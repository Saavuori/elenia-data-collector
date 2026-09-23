mod elenia_client;
mod influx;

use axum::{
    extract::{Query, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use chrono::{Duration as ChronoDuration, NaiveDate, Utc};
use chrono_tz::Europe::Helsinki;
use elenia_client::{ConsumptionData, EleniaClient, Resolution};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::Mutex;
use tower_http::cors::CorsLayer;
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

// ---------------------------------------------------------------------------
// App state
// ---------------------------------------------------------------------------

struct AppState {
    client: EleniaClient,
    logged_in: bool,
    influx_last_sync: Option<chrono::DateTime<Utc>>,
    influx_error: Option<String>,
}

// ---------------------------------------------------------------------------
// Request / response types
// ---------------------------------------------------------------------------

#[derive(Deserialize)]
struct LoginRequest {
    username: String,
    password: String,
}

#[derive(Deserialize)]
struct ConsumptionQuery {
    start: NaiveDate,
    stop: NaiveDate,
    resolution: Option<String>,
}

#[derive(Deserialize)]
struct MeterReadingQuery {
    day: Option<NaiveDate>,
}

#[derive(Serialize)]
struct StatusResponse {
    logged_in: bool,
}

#[derive(Serialize)]
struct VersionResponse {
    version: &'static str,
}

#[derive(Serialize)]
struct InfluxStatusResponse {
    enabled: bool,
    last_sync: Option<chrono::DateTime<Utc>>,
    next_sync: Option<chrono::DateTime<Utc>>,
    error: Option<String>,
}

#[derive(Serialize)]
struct InfluxTestResponse {
    ok: bool,
    message: String,
}

#[derive(Serialize)]
struct InfluxSyncResponse {
    ok: bool,
    points: usize,
    message: String,
}

// ---------------------------------------------------------------------------
// Credentials persistence
// ---------------------------------------------------------------------------

#[derive(Serialize, Deserialize, Clone)]
struct SavedCredentials {
    username: String,
    password: String,
    selected_gsrn: Option<String>,
}

fn credentials_path() -> PathBuf {
    PathBuf::from("credentials.json")
}

fn save_credentials(username: &str, password: &str, selected_gsrn: Option<String>) {
    let creds = SavedCredentials {
        username: username.to_string(),
        password: password.to_string(),
        selected_gsrn,
    };
    match serde_json::to_string_pretty(&creds) {
        Ok(json) => {
            if let Err(e) = std::fs::write(credentials_path(), json) {
                tracing::warn!("Could not save credentials: {}", e);
            } else {
                tracing::info!("Credentials saved to {}", credentials_path().display());
            }
        }
        Err(e) => tracing::warn!("Could not serialize credentials: {}", e),
    }
}

fn load_credentials() -> Option<SavedCredentials> {
    let data = std::fs::read_to_string(credentials_path()).ok()?;
    let creds: SavedCredentials = serde_json::from_str(&data).ok()?;
    if creds.username.is_empty() {
        return None;
    }
    Some(creds)
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

#[tokio::main]
async fn main() {
    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .init();

    let mut state = AppState {
        client: EleniaClient::new().expect("Failed to create EleniaClient"),
        logged_in: false,
        influx_last_sync: None,
        influx_error: None,
    };
    if login_from_saved(&mut state).await {
        tracing::info!("Auto-login successful");
    } else {
        tracing::info!("No working saved credentials — manual login required");
    }
    let shared_state = Arc::new(Mutex::new(state));

    // ── Background: session refresh every 60 min ───────────────────────────
    // The measurement-API service token is valid for ~3 h.
    {
        let s = Arc::clone(&shared_state);
        tokio::spawn(async move {
            let interval = tokio::time::Duration::from_secs(60 * 60);
            loop {
                tokio::time::sleep(interval).await;
                let mut st = s.lock().await;
                if login_from_saved(&mut st).await {
                    tracing::info!("Session refresh: success");
                }
            }
        });
    }

    // ── Background: InfluxDB collector ─────────────────────────────────────
    {
        let s = Arc::clone(&shared_state);
        tokio::spawn(async move {
            // Check every 60 seconds; sync when the interval has elapsed.
            let tick = tokio::time::Duration::from_secs(60);
            loop {
                tokio::time::sleep(tick).await;

                let cfg = influx::load_config();
                if !cfg.enabled {
                    continue;
                }

                let should_sync = {
                    let st = s.lock().await;
                    st.influx_last_sync
                        .map(|t| Utc::now() - t > ChronoDuration::minutes(cfg.interval_minutes as i64))
                        .unwrap_or(true)
                };
                if !should_sync {
                    continue;
                }

                tracing::info!("InfluxDB collector: starting sync…");
                let result = run_influx_sync(&s, &cfg).await;
                let mut st = s.lock().await;
                match result {
                    Ok(pts) => {
                        st.influx_last_sync = Some(Utc::now());
                        st.influx_error = None;
                        tracing::info!("InfluxDB collector: wrote {} points", pts);
                    }
                    Err(e) => {
                        st.influx_error = Some(e.to_string());
                        tracing::warn!("InfluxDB collector error: {}", e);
                    }
                }
            }
        });
    }

    let app = Router::new()
        .route("/login", post(login_handler))
        .route("/status", get(status_handler))
        .route("/version", get(version_handler))
        .route("/consumption", get(get_consumption_handler))
        .route("/meter-reading", get(get_meter_reading_handler))
        .route("/metering-points", get(get_metering_points_handler))
        .route("/metering-points/select", post(select_metering_point_handler))
        .route(
            "/influx/config",
            get(get_influx_config_handler).post(post_influx_config_handler),
        )
        .route("/influx/status", get(get_influx_status_handler))
        .route("/influx/test", post(influx_test_handler))
        .route("/influx/sync", post(influx_sync_handler))
        .fallback_service(tower_http::services::ServeDir::new("dist"))
        .layer(CorsLayer::permissive())
        .with_state(shared_state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "3000".to_string());
    let addr = format!("0.0.0.0:{}", port);
    let listener = tokio::net::TcpListener::bind(&addr).await.unwrap();
    tracing::info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}

// ---------------------------------------------------------------------------
// InfluxDB sync logic (shared between background task and manual trigger)
// ---------------------------------------------------------------------------

/// Collect yesterday + today from Elenia and write them to InfluxDB.
/// Returns the number of data points written.
///
/// Uses the 5-minute meter registers, which are only ~10 minutes behind. Older
/// meters that publish nothing there fall back to the settled 15-minute
/// series; the resolution is written as a tag so the two never end up mixed in
/// one series.
async fn run_influx_sync(
    state: &Arc<Mutex<AppState>>,
    cfg: &influx::InfluxConfig,
) -> anyhow::Result<usize> {
    let now_hel = Utc::now().with_timezone(&Helsinki);
    let today = now_hel.date_naive();
    let yesterday = today - ChronoDuration::days(1);

    let mut total_lines = String::new();

    for date in [yesterday, today] {
        let mut data = {
            let mut st = state.lock().await;
            if !st.logged_in {
                return Err(anyhow::anyhow!("Not logged in"));
            }
            consumption_with_relogin(&mut st, date, date, Resolution::FiveMinute).await?
        };

        if data.series.is_empty() {
            tracing::info!("No 5 min data for {} — falling back to 15 min", date);
            let mut st = state.lock().await;
            data = consumption_with_relogin(&mut st, date, date, Resolution::Quarter).await?;
        }

        let gsrn = data.gsrn.clone().unwrap_or_default();
        let lines = influx::to_line_protocol(&gsrn, &data.resolution, &data.series);
        if !lines.is_empty() {
            if !total_lines.is_empty() {
                total_lines.push('\n');
            }
            total_lines.push_str(&lines);
        }
    }

    influx::write_points(cfg, &total_lines).await
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

/// True when an error means "the session is gone, log in again".
fn is_session_error(e: &anyhow::Error) -> bool {
    let msg = e.to_string();
    msg.contains("No access token") || msg.contains("login required")
}

/// Log in with the credentials saved in `credentials.json`. The one path used
/// by startup auto-login, the hourly refresh and on-demand re-login, so they
/// cannot drift apart. Returns whether the client now holds a session.
async fn login_from_saved(state: &mut AppState) -> bool {
    let Some(creds) = load_credentials() else {
        tracing::debug!("No saved credentials to log in with");
        return false;
    };
    tracing::info!("Logging in to Elenia as '{}'…", creds.username);
    state.client.set_selected_gsrn(creds.selected_gsrn);
    match state.client.login(&creds.username, &creds.password).await {
        Ok(()) => {
            state.logged_in = true;
            true
        }
        Err(e) => {
            tracing::warn!("Login with saved credentials failed: {}", e);
            false
        }
    }
}

/// `get_consumption`, retried once after a re-login when the service token
/// turns out to have expired mid-request.
async fn consumption_with_relogin(
    state: &mut AppState,
    start: NaiveDate,
    stop: NaiveDate,
    resolution: Resolution,
) -> anyhow::Result<ConsumptionData> {
    match state.client.get_consumption(start, stop, resolution).await {
        Err(e) if is_session_error(&e) => {
            tracing::warn!("Session expired during get_consumption — re-logging in");
            if !login_from_saved(state).await {
                return Err(e);
            }
            state.client.get_consumption(start, stop, resolution).await
        }
        result => result,
    }
}

// ---------------------------------------------------------------------------
// Handlers — auth
// ---------------------------------------------------------------------------

async fn version_handler() -> Json<VersionResponse> {
    let version = option_env!("VERSION").unwrap_or(env!("CARGO_PKG_VERSION"));
    Json(VersionResponse { version })
}

async fn status_handler(State(state): State<Arc<Mutex<AppState>>>) -> Json<StatusResponse> {
    let state = state.lock().await;
    Json(StatusResponse {
        logged_in: state.logged_in,
    })
}

async fn login_handler(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<LoginRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    tracing::info!("Login attempt for {}", payload.username);
    let mut state = state.lock().await;

    // Keep the previously selected metering point if the same user logs back in.
    let selected_gsrn = load_credentials().and_then(|e| {
        if e.username == payload.username {
            e.selected_gsrn
        } else {
            None
        }
    });

    state.client.set_selected_gsrn(selected_gsrn);
    state
        .client
        .login(&payload.username, &payload.password)
        .await
        .map_err(|e| (StatusCode::UNAUTHORIZED, e.to_string()))?;

    let selected = state.client.gsrn().ok();
    save_credentials(&payload.username, &payload.password, selected);
    state.logged_in = true;
    tracing::info!("Login successful");
    Ok(StatusCode::OK)
}

// ---------------------------------------------------------------------------
// Handlers — Elenia data
// ---------------------------------------------------------------------------

async fn get_metering_points_handler(
    State(state): State<Arc<Mutex<AppState>>>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let state = state.lock().await;
    if !state.logged_in {
        return Err((StatusCode::UNAUTHORIZED, "Not logged in".into()));
    }
    let selected = state.client.gsrn().ok();
    Ok(Json(serde_json::json!({
        "metering_points": state.client.metering_points(),
        "selected_gsrn": selected,
    })))
}

#[derive(Deserialize)]
struct SelectMeteringPointRequest {
    gsrn: String,
}

async fn select_metering_point_handler(
    State(state): State<Arc<Mutex<AppState>>>,
    Json(payload): Json<SelectMeteringPointRequest>,
) -> Result<StatusCode, (StatusCode, String)> {
    let mut state = state.lock().await;
    if !state.logged_in {
        return Err((StatusCode::UNAUTHORIZED, "Not logged in".into()));
    }

    state
        .client
        .select_gsrn(Some(payload.gsrn.clone()))
        .await
        .map_err(|e| (StatusCode::BAD_REQUEST, e.to_string()))?;

    if let Some(creds) = load_credentials() {
        save_credentials(&creds.username, &creds.password, Some(payload.gsrn));
    }

    Ok(StatusCode::OK)
}

async fn get_consumption_handler(
    State(state): State<Arc<Mutex<AppState>>>,
    Query(params): Query<ConsumptionQuery>,
) -> Result<Json<ConsumptionData>, (StatusCode, String)> {
    let mut state = state.lock().await;
    if !state.logged_in {
        return Err((StatusCode::UNAUTHORIZED, "Not logged in".into()));
    }

    let resolution = Resolution::parse(params.resolution.as_deref());
    consumption_with_relogin(&mut state, params.start, params.stop, resolution)
        .await
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

/// Raw 5-minute meter readings for a day (defaults to today).
async fn get_meter_reading_handler(
    State(state): State<Arc<Mutex<AppState>>>,
    Query(params): Query<MeterReadingQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, String)> {
    let mut state = state.lock().await;
    if !state.logged_in {
        return Err((StatusCode::UNAUTHORIZED, "Not logged in".into()));
    }
    let day = params
        .day
        .unwrap_or_else(|| Utc::now().with_timezone(&Helsinki).date_naive());

    let result = match state.client.get_meter_reading(day).await {
        Err(e) if is_session_error(&e) && login_from_saved(&mut state).await => {
            state.client.get_meter_reading(day).await
        }
        result => result,
    };
    result
        .map(Json)
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))
}

// ---------------------------------------------------------------------------
// Handlers — InfluxDB configuration
// ---------------------------------------------------------------------------

async fn get_influx_config_handler() -> Json<influx::InfluxConfig> {
    Json(influx::load_config())
}

async fn post_influx_config_handler(
    Json(new_cfg): Json<influx::InfluxConfig>,
) -> Result<StatusCode, (StatusCode, String)> {
    influx::save_config(&new_cfg).map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, e.to_string()))?;
    tracing::info!("InfluxDB config saved (enabled={})", new_cfg.enabled);
    Ok(StatusCode::OK)
}

async fn get_influx_status_handler(
    State(state): State<Arc<Mutex<AppState>>>,
) -> Json<InfluxStatusResponse> {
    let state = state.lock().await;
    let cfg = influx::load_config();
    let next = state
        .influx_last_sync
        .map(|t| t + ChronoDuration::minutes(cfg.interval_minutes as i64));
    Json(InfluxStatusResponse {
        enabled: cfg.enabled,
        last_sync: state.influx_last_sync,
        next_sync: next,
        error: state.influx_error.clone(),
    })
}

async fn influx_test_handler(Json(cfg): Json<influx::InfluxConfig>) -> Json<InfluxTestResponse> {
    match influx::test_connection(&cfg).await {
        Ok(msg) => Json(InfluxTestResponse {
            ok: true,
            message: msg,
        }),
        Err(e) => Json(InfluxTestResponse {
            ok: false,
            message: e.to_string(),
        }),
    }
}

async fn influx_sync_handler(State(state): State<Arc<Mutex<AppState>>>) -> Json<InfluxSyncResponse> {
    let cfg = influx::load_config();
    if cfg.token.is_empty() || cfg.url.is_empty() {
        return Json(InfluxSyncResponse {
            ok: false,
            points: 0,
            message: "InfluxDB not configured — fill in URL, token, org and bucket first".into(),
        });
    }
    match run_influx_sync(&state, &cfg).await {
        Ok(pts) => {
            let mut st = state.lock().await;
            st.influx_last_sync = Some(Utc::now());
            st.influx_error = None;
            Json(InfluxSyncResponse {
                ok: true,
                points: pts,
                message: format!("Wrote {} points", pts),
            })
        }
        Err(e) => {
            let mut st = state.lock().await;
            st.influx_error = Some(e.to_string());
            Json(InfluxSyncResponse {
                ok: false,
                points: 0,
                message: e.to_string(),
            })
        }
    }
}
