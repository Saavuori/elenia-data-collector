//! Elenia Aina API client.
//!
//! Elenia does not publish a public API. This module reproduces the calls the
//! `aina.elenia.fi` web portal makes:
//!
//! 1. `GET  api.aina.elenia.fi/api/csrf-token`                      → csrf_token cookie
//! 2. `POST api.aina.elenia.fi/api/auth/login/credentials-authentication`
//!                                                                  → session cookies
//! 3. `GET  api.aina.elenia.fi/api/customerships`                    → userId
//! 4. `POST api.aina.elenia.fi/api/auth/access/token/{userId}/v2/bearer`
//!                                                                  → applications token
//! 5. `GET  public.sgp-prod.aws.elenia.fi/api/gen/customer_data_and_token`
//!                                                                  → service token + metering points
//! 6. `GET  .../api/gen/meter_reading_yh`                            → consumption series
//!
//! Spot prices come from Elenia's public (unauthenticated) `market_prices`
//! endpoints and are published *including* VAT, so the VAT-free value is
//! derived by dividing with the VAT rate that was in force at that time.

use anyhow::{anyhow, Context, Result};
use chrono::{
    DateTime, Datelike, Duration, NaiveDate, NaiveDateTime, NaiveTime, TimeZone, Timelike, Utc,
};
use chrono_tz::Europe::Helsinki;
use reqwest::{
    cookie::{CookieStore, Jar},
    Client,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::Arc;

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/// Portal API — authentication lives here.
const AINA_API: &str = "https://api.aina.elenia.fi";
/// Measurement API — consumption and prices live here.
const SGP_API: &str = "https://public.sgp-prod.aws.elenia.fi/api/gen";

const USER_AGENT: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) \
                          AppleWebKit/537.36 (KHTML, like Gecko) \
                          Chrome/141.0.0.0 Safari/537.36";

/// Finnish VAT on electricity was raised from 24 % to 25.5 % on 2024-09-01.
fn vat_multiplier(ts: DateTime<Utc>) -> f64 {
    let local = ts.with_timezone(&Helsinki);
    if local.year() < 2024 || (local.year() == 2024 && local.month() < 9) {
        1.24
    } else {
        1.255
    }
}

// ---------------------------------------------------------------------------
// Public data types
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Resolution {
    /// Near real-time: differenced from the raw cumulative meter registers.
    FiveMinute,
    Quarter,
    Hour,
    Day,
    Month,
}

impl Resolution {
    pub fn as_str(self) -> &'static str {
        match self {
            Resolution::FiveMinute => "5min",
            Resolution::Quarter => "quarter",
            Resolution::Hour => "hour",
            Resolution::Day => "day",
            Resolution::Month => "month",
        }
    }

    pub fn parse(s: Option<&str>) -> Self {
        match s {
            Some("5min") | Some("five_minute") | Some("minute") => Resolution::FiveMinute,
            Some("quarter") => Resolution::Quarter,
            Some("day") => Resolution::Day,
            Some("month") => Resolution::Month,
            _ => Resolution::Hour,
        }
    }
}

/// One measurement interval. Field names mirror the Helen collector so the
/// same dashboards and chart code can be reused.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumptionSeries {
    pub start: Option<DateTime<Utc>>,
    pub stop: Option<DateTime<Utc>>,
    /// Consumption in kWh for the interval.
    pub electricity: Option<f64>,
    /// Netted consumption in kWh (production subtracted), when available.
    pub electricity_netted: Option<f64>,
    /// Spot price excluding VAT (c/kWh).
    pub electricity_spot_prices: Option<f64>,
    /// Spot price including VAT (c/kWh).
    pub electricity_spot_prices_vat: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConsumptionData {
    pub gsrn: Option<String>,
    pub resolution: String,
    pub series: Vec<ConsumptionSeries>,
}

/// A metering point (physical delivery site) belonging to the logged-in user.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MeteringPoint {
    pub gsrn: String,
    pub customer_id: String,
    pub street_address: Option<String>,
    pub postal_code: Option<String>,
    pub city: Option<String>,
    pub product_description: Option<String>,
    pub device_name: Option<String>,
    pub device_serialnumber: Option<String>,
    pub contract_start: Option<String>,
    pub contract_end: Option<String>,
    /// Original object as returned by Elenia, for the details view.
    pub raw: serde_json::Value,
}

// ---------------------------------------------------------------------------
// Internal response shapes
// ---------------------------------------------------------------------------

#[derive(Debug, Deserialize)]
struct MeterReadingYh {
    #[serde(default)]
    months: Vec<MeterReadingMonth>,
}

#[derive(Debug, Deserialize)]
struct MeterReadingMonth {
    #[serde(default)]
    hourly_values: Vec<MeterValue>,
    #[serde(default)]
    hourly_values_netted: Vec<MeterValue>,
}

#[derive(Debug, Deserialize)]
struct MeterValue {
    /// Timestamp — either UTC (`…Z`) or naive Helsinki local time.
    t: String,
    /// Energy for the interval in Wh.
    v: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct MarketPrice15Min {
    #[serde(rename = "startTime")]
    start_time: String,
    /// c/kWh including VAT.
    value: Option<f64>,
}

#[derive(Debug, Deserialize)]
struct MarketPriceHour {
    t_utc: String,
    /// c/kWh including VAT.
    v: Option<f64>,
}

// ---------------------------------------------------------------------------
// Client
// ---------------------------------------------------------------------------

pub struct EleniaClient {
    jar: Arc<Jar>,
    client: Client,
    /// Bearer token for `public.sgp-prod.aws.elenia.fi` (valid ~3 h).
    service_token: Option<String>,
    service_token_time: Option<DateTime<Utc>>,
    metering_points: Vec<MeteringPoint>,
    selected_gsrn: Option<String>,
    /// Cached hourly spot prices per calendar year (Helsinki), keyed by year.
    price_cache: HashMap<i32, Vec<(DateTime<Utc>, f64)>>,
}

impl EleniaClient {
    pub fn new() -> Result<Self> {
        let (jar, client) = Self::build_client()?;
        Ok(Self {
            jar,
            client,
            service_token: None,
            service_token_time: None,
            metering_points: Vec::new(),
            selected_gsrn: None,
            price_cache: HashMap::new(),
        })
    }

    fn build_client() -> Result<(Arc<Jar>, Client)> {
        let jar = Arc::new(Jar::default());
        let client = Client::builder()
            .cookie_provider(Arc::clone(&jar))
            .user_agent(USER_AGENT)
            .timeout(std::time::Duration::from_secs(30))
            .build()?;
        Ok((jar, client))
    }

    // -----------------------------------------------------------------------
    // Session state
    // -----------------------------------------------------------------------

    pub fn set_selected_gsrn(&mut self, gsrn: Option<String>) {
        self.selected_gsrn = gsrn;
    }

    pub async fn select_gsrn(&mut self, gsrn: Option<String>) -> Result<()> {
        if let Some(ref g) = gsrn {
            if !self.metering_points.iter().any(|m| &m.gsrn == g) {
                return Err(anyhow!("Unknown metering point {}", g));
            }
        }
        self.selected_gsrn = gsrn;
        Ok(())
    }

    pub fn metering_points(&self) -> &[MeteringPoint] {
        &self.metering_points
    }

    pub fn selected(&self) -> Result<&MeteringPoint> {
        let gsrn = self.selected_gsrn.as_deref();
        self.metering_points
            .iter()
            .find(|m| Some(m.gsrn.as_str()) == gsrn)
            .or_else(|| self.metering_points.first())
            .context("No metering point available — call login() first")
    }

    pub fn gsrn(&self) -> Result<String> {
        Ok(self.selected()?.gsrn.clone())
    }

    fn cookie(&self, name: &str) -> Option<String> {
        let url = AINA_API.parse::<reqwest::Url>().ok()?;
        let cookies = self.jar.cookies(&url)?;
        let raw = cookies.to_str().ok()?;
        for part in raw.split(';').map(str::trim) {
            if let Some(v) = part.strip_prefix(&format!("{}=", name)) {
                return Some(v.to_string());
            }
        }
        None
    }

    // -----------------------------------------------------------------------
    // Login
    // -----------------------------------------------------------------------

    /// Full portal login. Leaves the client holding a valid service token and
    /// the list of metering points the account can see.
    pub async fn login(&mut self, username: &str, password: &str) -> Result<()> {
        tracing::info!("Starting Elenia login for {}", username);

        // Fresh cookie jar for every login attempt.
        let (jar, client) = Self::build_client()?;
        self.jar = jar;
        self.client = client;
        self.service_token = None;
        self.service_token_time = None;

        // 1. Prime the CSRF cookie.
        let res = self
            .client
            .get(format!("{}/api/csrf-token", AINA_API))
            .header("Origin", "https://aina.elenia.fi")
            .header("Referer", "https://aina.elenia.fi/")
            .send()
            .await
            .context("Could not reach api.aina.elenia.fi")?;
        if !res.status().is_success() {
            return Err(anyhow!("CSRF token request failed ({})", res.status()));
        }

        // 2. Log in with e-mail + password. Sets the session cookies.
        let res = self
            .client
            .post(format!(
                "{}/api/auth/login/credentials-authentication",
                AINA_API
            ))
            .header("Content-Type", "application/json")
            .header("Origin", "https://aina.elenia.fi")
            .header("Referer", "https://aina.elenia.fi/")
            .json(&serde_json::json!({ "email": username, "password": password }))
            .send()
            .await?;

        let status = res.status();
        let body = res.text().await.unwrap_or_default();
        if !status.is_success() {
            // Elenia answers `{"error":"credentials_error"}` on a bad password.
            let hint = if body.contains("credentials_error") {
                "wrong e-mail or password"
            } else {
                body.trim()
            };
            return Err(anyhow!("Elenia login failed ({}): {}", status, hint));
        }
        tracing::info!("Portal login OK");

        // 3. Find the user id of the customership to act as.
        let user_id = self.fetch_user_id().await?;
        tracing::info!("Customership user id: {}", user_id);

        // 4. Exchange the session for an applications bearer token.
        let app_token = self.fetch_application_token(&user_id).await?;

        // 5. Trade that for the measurement-API service token + customer data.
        self.fetch_customer_data(&app_token).await?;

        tracing::info!(
            "Elenia login successful — {} metering point(s)",
            self.metering_points.len()
        );
        Ok(())
    }

    /// The portal calls `/api/customerships`; the selected customership's
    /// `userId` is what the token endpoint expects.
    async fn fetch_user_id(&self) -> Result<String> {
        let csrf = self.cookie("csrf_token");
        let mut req = self
            .client
            .get(format!("{}/api/customerships", AINA_API))
            .header("Accept", "application/json")
            .header("Origin", "https://aina.elenia.fi")
            .header("Referer", "https://aina.elenia.fi/");
        if let Some(ref token) = csrf {
            req = req.header("x-csrf-token", token);
        }

        let res = req.send().await?;
        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(anyhow!("Customerships request failed ({}): {}", status, body));
        }

        let json: serde_json::Value = serde_json::from_str(&body)
            .with_context(|| format!("Could not decode customerships JSON: {}", body))?;

        // { "data": { "user": { "userId": … }, "mandatedUsers": [ … ] } }
        let data = &json["data"];
        if let Some(id) = data["user"]["userId"].as_str() {
            return Ok(id.to_string());
        }
        if let Some(id) = data["mandatedUsers"][0]["userId"].as_str() {
            return Ok(id.to_string());
        }
        Err(anyhow!("No userId in customerships response: {}", body))
    }

    async fn fetch_application_token(&self, user_id: &str) -> Result<String> {
        let csrf = self.cookie("csrf_token");
        let url = format!("{}/api/auth/access/token/{}/v2/bearer", AINA_API, user_id);

        let mut req = self
            .client
            .post(&url)
            .header("Content-Type", "application/json")
            .header("Origin", "https://aina.elenia.fi")
            .header("Referer", "https://aina.elenia.fi/")
            .json(&serde_json::json!({}));
        if let Some(ref token) = csrf {
            req = req.header("x-csrf-token", token);
        }

        let res = req.send().await?;
        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(anyhow!("Access token request failed ({}): {}", status, body));
        }

        let json: serde_json::Value = serde_json::from_str(&body)
            .with_context(|| format!("Could not decode access token JSON: {}", body))?;

        json["data"]["token"]
            .as_str()
            .or_else(|| json["token"].as_str())
            .map(|s| s.to_string())
            .with_context(|| format!("No applications token in response: {}", body))
    }

    /// Fetches the measurement-API service token and the metering point list.
    async fn fetch_customer_data(&mut self, app_token: &str) -> Result<()> {
        let res = self
            .client
            .get(format!("{}/customer_data_and_token", SGP_API))
            .header("Authorization", format!("Bearer {}", app_token))
            .header("Accept", "application/json")
            .send()
            .await?;

        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(anyhow!("Customer data request failed ({}): {}", status, body));
        }

        let json: serde_json::Value = serde_json::from_str(&body)
            .with_context(|| format!("Could not decode customer data JSON: {}", body))?;

        let token = json["token"]
            .as_str()
            .context("No service token in customer data response")?;
        self.service_token = Some(token.to_string());
        self.service_token_time = Some(Utc::now());

        self.metering_points = Self::parse_metering_points(&json);
        if self.metering_points.is_empty() {
            return Err(anyhow!("Account has no metering points"));
        }

        // Keep the previous selection if it still exists.
        let still_valid = self
            .selected_gsrn
            .as_ref()
            .map(|g| self.metering_points.iter().any(|m| &m.gsrn == g))
            .unwrap_or(false);
        if !still_valid {
            self.selected_gsrn = Some(self.metering_points[0].gsrn.clone());
        }
        tracing::info!("Selected metering point GSRN: {}", self.gsrn()?);
        Ok(())
    }

    fn parse_metering_points(json: &serde_json::Value) -> Vec<MeteringPoint> {
        let mut out = Vec::new();
        let Some(customers) = json["customer_datas"].as_object() else {
            return out;
        };

        for (customer_id, customer) in customers {
            let Some(points) = customer["meteringpoints"].as_array() else {
                continue;
            };
            for mp in points {
                let Some(gsrn) = mp["gsrn"].as_str() else { continue };
                out.push(MeteringPoint {
                    gsrn: gsrn.to_string(),
                    customer_id: customer_id.clone(),
                    street_address: mp["address"]["streetaddress"]
                        .as_str()
                        .map(|s| s.to_string()),
                    postal_code: mp["address"]["postalcode"].as_str().map(|s| s.to_string()),
                    city: mp["address"]["city"]
                        .as_str()
                        .or_else(|| mp["address"]["postoffice"].as_str())
                        .map(|s| s.to_string()),
                    product_description: mp["productcode_description"]
                        .as_str()
                        .map(|s| s.to_string()),
                    device_name: mp["device"]["name"].as_str().map(|s| s.to_string()),
                    device_serialnumber: mp["device_serialnumber"]
                        .as_str()
                        .map(|s| s.to_string())
                        .or_else(|| mp["device"]["serialnumber"].as_str().map(|s| s.to_string())),
                    contract_start: mp["contract_start"]
                        .as_str()
                        .or_else(|| mp["start_date"].as_str())
                        .map(|s| s.to_string()),
                    contract_end: mp["contract_end"]
                        .as_str()
                        .or_else(|| mp["end_date"].as_str())
                        .map(|s| s.to_string()),
                    raw: mp.clone(),
                });
            }
        }

        // Stable order, deduplicated by GSRN.
        out.sort_by(|a, b| a.gsrn.cmp(&b.gsrn));
        out.dedup_by(|a, b| a.gsrn == b.gsrn);
        out
    }

    fn service_token(&self) -> Result<&str> {
        self.service_token
            .as_deref()
            .context("No access token — login required")
    }

    // -----------------------------------------------------------------------
    // Consumption
    // -----------------------------------------------------------------------

    /// Fetch consumption for an inclusive range of Helsinki calendar dates.
    pub async fn get_consumption(
        &mut self,
        start: NaiveDate,
        stop: NaiveDate,
        resolution: Resolution,
    ) -> Result<ConsumptionData> {
        if stop < start {
            return Err(anyhow!("stop date is before start date"));
        }
        let point = self.selected()?.clone();

        let mut series = match resolution {
            Resolution::FiveMinute => self.fetch_five_minute_series(&point, start, stop).await?,
            Resolution::Quarter => self.fetch_quarter_series(&point, start, stop).await?,
            _ => self.fetch_hourly_series(&point, start, stop).await?,
        };

        // Attach spot prices before aggregating so that aggregated prices are
        // consumption-weighted.
        match resolution {
            Resolution::FiveMinute | Resolution::Quarter => {
                self.attach_quarter_prices(&mut series, start, stop).await?
            }
            _ => self.attach_hourly_prices(&mut series, start, stop).await?,
        }

        let series = match resolution {
            Resolution::Day => aggregate(series, Bucket::Day),
            Resolution::Month => aggregate(series, Bucket::Month),
            _ => series,
        };

        Ok(ConsumptionData {
            gsrn: Some(point.gsrn.clone()),
            resolution: resolution.as_str().to_string(),
            series,
        })
    }

    /// 5-minute values, derived from the raw meter registers.
    ///
    /// `meter_reading` reports the *cumulative* import (`a`) and export (`a_`)
    /// registers in Wh at the end of each 5-minute slot, so the energy of a
    /// slot is the difference to the previous reading. This is the freshest
    /// data Elenia has — typically ~10 minutes behind — whereas the settled
    /// 15-minute and hourly series lag by days.
    async fn fetch_five_minute_series(
        &self,
        point: &MeteringPoint,
        start: NaiveDate,
        stop: NaiveDate,
    ) -> Result<Vec<ConsumptionSeries>> {
        // Start one day early so the first slot of `start` has a predecessor
        // to difference against.
        let mut readings: Vec<MeterRegister> = Vec::new();
        let mut day = start - Duration::days(1);
        while day <= stop {
            match self.fetch_meter_reading(point, day).await {
                Ok(json) => readings.extend(parse_meter_registers(&json)),
                // A missing day (e.g. older than Elenia's ~60 day window) is
                // not fatal — it only costs us the seed reading.
                Err(e) if day < start => {
                    tracing::debug!("No seed meter reading for {}: {}", day, e)
                }
                Err(e) => return Err(e),
            }
            day += Duration::days(1);
        }

        readings.sort_by_key(|r| r.at);
        readings.dedup_by_key(|r| r.at);

        let mut out = Vec::new();
        for pair in readings.windows(2) {
            let (prev, cur) = (&pair[0], &pair[1]);
            // A negative step means the register rolled over or was reset;
            // there is no sensible value for that interval.
            let consumed = match (prev.import, cur.import) {
                (Some(a), Some(b)) if b >= a => Some((b - a) / 1000.0),
                _ => None,
            };
            let produced = match (prev.export, cur.export) {
                (Some(a), Some(b)) if b >= a => Some((b - a) / 1000.0),
                _ => None,
            };
            if consumed.is_none() {
                continue;
            }
            out.push(ConsumptionSeries {
                start: Some(prev.at),
                stop: Some(cur.at),
                electricity: consumed,
                electricity_netted: match (consumed, produced) {
                    (Some(c), Some(p)) => Some(c - p),
                    _ => None,
                },
                electricity_spot_prices: None,
                electricity_spot_prices_vat: None,
            });
        }

        out.retain(|s| in_range(s.start, start, stop));
        Ok(out)
    }

    /// 15-minute values: Elenia serves these one calendar day at a time.
    async fn fetch_quarter_series(
        &self,
        point: &MeteringPoint,
        start: NaiveDate,
        stop: NaiveDate,
    ) -> Result<Vec<ConsumptionSeries>> {
        let mut out = Vec::new();
        let mut day = start;
        while day <= stop {
            let raw = self
                .fetch_meter_reading_yh(point, &day.format("%Y-%m-%d").to_string(), "PT15M")
                .await?;
            out.extend(flatten_meter_reading(raw, Duration::minutes(15)));
            day += Duration::days(1);
        }
        out.retain(|s| in_range(s.start, start, stop));
        out.sort_by_key(|s| s.start);
        Ok(out)
    }

    /// Hourly values: Elenia serves a whole calendar year per request.
    async fn fetch_hourly_series(
        &self,
        point: &MeteringPoint,
        start: NaiveDate,
        stop: NaiveDate,
    ) -> Result<Vec<ConsumptionSeries>> {
        let mut out = Vec::new();
        for year in start.year()..=stop.year() {
            let raw = self
                .fetch_meter_reading_yh(point, &year.to_string(), "PT1H")
                .await?;
            out.extend(flatten_meter_reading(raw, Duration::hours(1)));
        }
        out.retain(|s| in_range(s.start, start, stop));
        out.sort_by_key(|s| s.start);
        Ok(out)
    }

    async fn fetch_meter_reading_yh(
        &self,
        point: &MeteringPoint,
        year_param: &str,
        timestep: &str,
    ) -> Result<MeterReadingYh> {
        let token = self.service_token()?;
        let url = format!("{}/meter_reading_yh", SGP_API);
        tracing::info!(
            "Fetching {} consumption for {} (gsrn {})",
            timestep,
            year_param,
            point.gsrn
        );

        let res = self
            .client
            .get(&url)
            .query(&[
                ("gsrn", point.gsrn.as_str()),
                ("customer_ids", point.customer_id.as_str()),
                ("year", year_param),
                ("timestep", timestep),
            ])
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .send()
            .await?;

        let status = res.status();
        let body = res.text().await?;
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(anyhow!("No access token — session expired ({})", status));
        }
        if !status.is_success() {
            return Err(anyhow!("Consumption fetch failed ({}): {}", status, body));
        }

        serde_json::from_str(&body)
            .with_context(|| format!("Could not decode consumption JSON: {}", truncate(&body)))
    }

    /// Latest 5-minute readings for a day — raw meter data, used for the
    /// "live" view. Returns Elenia's own JSON unchanged.
    pub async fn get_meter_reading(&self, day: NaiveDate) -> Result<serde_json::Value> {
        self.fetch_meter_reading(self.selected()?, day).await
    }

    async fn fetch_meter_reading(
        &self,
        point: &MeteringPoint,
        day: NaiveDate,
    ) -> Result<serde_json::Value> {
        let token = self.service_token()?;

        let res = self
            .client
            .get(format!("{}/meter_reading", SGP_API))
            .query(&[
                ("customer_ids", point.customer_id.as_str()),
                ("gsrn", point.gsrn.as_str()),
                ("day", &day.format("%Y-%m-%d").to_string()),
            ])
            .header("Authorization", format!("Bearer {}", token))
            .header("Accept", "application/json")
            .send()
            .await?;

        let status = res.status();
        let body = res.text().await?;
        if status == reqwest::StatusCode::UNAUTHORIZED || status == reqwest::StatusCode::FORBIDDEN {
            return Err(anyhow!("No access token — session expired ({})", status));
        }
        if !status.is_success() {
            return Err(anyhow!("Meter reading fetch failed ({}): {}", status, body));
        }
        serde_json::from_str(&body)
            .with_context(|| format!("Could not decode meter reading JSON: {}", truncate(&body)))
    }

    // -----------------------------------------------------------------------
    // Spot prices (public endpoints — no authentication needed)
    // -----------------------------------------------------------------------

    async fn attach_quarter_prices(
        &self,
        series: &mut [ConsumptionSeries],
        start: NaiveDate,
        stop: NaiveDate,
    ) -> Result<()> {
        let mut prices: HashMap<DateTime<Utc>, f64> = HashMap::new();
        let mut day = start;
        while day <= stop {
            match self.fetch_market_prices_15min(day).await {
                Ok(list) => prices.extend(list),
                Err(e) => tracing::warn!("Spot prices for {} unavailable: {}", day, e),
            }
            day += Duration::days(1);
        }
        // 5-minute intervals fall inside a 15-minute price bucket, so round
        // the interval start down before looking the price up.
        for item in series.iter_mut() {
            if let Some(ts) = item.start {
                if let Some(v) = prices.get(&floor_to(ts, 15)) {
                    set_price(item, *v);
                }
            }
        }
        Ok(())
    }

    async fn attach_hourly_prices(
        &mut self,
        series: &mut [ConsumptionSeries],
        start: NaiveDate,
        stop: NaiveDate,
    ) -> Result<()> {
        let mut prices: HashMap<DateTime<Utc>, f64> = HashMap::new();
        for year in start.year()..=stop.year() {
            match self.fetch_market_prices_year(year).await {
                Ok(list) => prices.extend(list.iter().copied()),
                Err(e) => tracing::warn!("Spot prices for {} unavailable: {}", year, e),
            }
        }
        for item in series.iter_mut() {
            if let Some(ts) = item.start {
                if let Some(v) = prices.get(&ts) {
                    set_price(item, *v);
                }
            }
        }
        Ok(())
    }

    async fn fetch_market_prices_15min(&self, day: NaiveDate) -> Result<Vec<(DateTime<Utc>, f64)>> {
        let res = self
            .client
            .get(format!("{}/market_prices_15min", SGP_API))
            .query(&[("day", day.format("%Y-%m-%d").to_string())])
            .header("Accept", "application/json")
            .send()
            .await?;

        let status = res.status();
        let body = res.text().await?;
        if !status.is_success() {
            return Err(anyhow!("market_prices_15min failed ({})", status));
        }

        let list: Vec<MarketPrice15Min> = serde_json::from_str(&body)
            .with_context(|| format!("Could not decode 15 min prices: {}", truncate(&body)))?;

        Ok(list
            .into_iter()
            .filter_map(|p| Some((parse_timestamp(&p.start_time)?, p.value?)))
            .collect())
    }

    /// Hourly prices for a whole year. Cached — this is a large response.
    async fn fetch_market_prices_year(&mut self, year: i32) -> Result<&Vec<(DateTime<Utc>, f64)>> {
        if !self.price_cache.contains_key(&year) {
            let res = self
                .client
                .get(format!("{}/market_prices", SGP_API))
                .query(&[("year", year.to_string())])
                .header("Accept", "application/json")
                .send()
                .await?;

            let status = res.status();
            let body = res.text().await?;
            if !status.is_success() {
                return Err(anyhow!("market_prices failed ({})", status));
            }

            // { "<month>": { "<day>": [ { t_utc, v } ] } }
            let raw: HashMap<String, HashMap<String, Vec<MarketPriceHour>>> =
                serde_json::from_str(&body)
                    .with_context(|| format!("Could not decode prices: {}", truncate(&body)))?;

            let mut list = Vec::new();
            for days in raw.values() {
                for hours in days.values() {
                    for h in hours {
                        if let (Some(ts), Some(v)) = (parse_timestamp(&h.t_utc), h.v) {
                            list.push((ts, v));
                        }
                    }
                }
            }
            list.sort_by_key(|(t, _)| *t);
            self.price_cache.insert(year, list);
        }
        Ok(self.price_cache.get(&year).unwrap())
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// One raw meter reading: cumulative registers in Wh at instant `at`.
#[derive(Debug, Clone)]
struct MeterRegister {
    at: DateTime<Utc>,
    /// Cumulative imported energy, all phases (`a`).
    import: Option<f64>,
    /// Cumulative exported energy, all phases (`a_`).
    export: Option<f64>,
}

fn parse_meter_registers(json: &serde_json::Value) -> Vec<MeterRegister> {
    let Some(rows) = json.as_array() else {
        return Vec::new();
    };
    rows.iter()
        .filter_map(|row| {
            Some(MeterRegister {
                at: parse_timestamp_utc(row["dt"].as_str()?)?,
                import: row["a"].as_f64(),
                export: row["a_"].as_f64(),
            })
        })
        .collect()
}

/// Round a timestamp down to a whole `minutes` boundary of the hour.
fn floor_to(ts: DateTime<Utc>, minutes: u32) -> DateTime<Utc> {
    let floored = (ts.minute() / minutes) * minutes;
    ts.with_minute(floored)
        .and_then(|t| t.with_second(0))
        .and_then(|t| t.with_nanosecond(0))
        .unwrap_or(ts)
}

fn truncate(s: &str) -> String {
    if s.len() > 400 {
        format!("{}…", &s[..400])
    } else {
        s.to_string()
    }
}

fn parse_naive(s: &str) -> Option<NaiveDateTime> {
    NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
        .or_else(|_| NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M"))
        .ok()
}

/// Timestamps from `meter_reading_yh`: either `2026-07-25T09:00:00Z` (UTC) or
/// `2026-07-25T12:00:00` (naive **Helsinki** local time), matching how the
/// Elenia web app parses them.
fn parse_timestamp(s: &str) -> Option<DateTime<Utc>> {
    if s.ends_with('Z') || s.contains('+') {
        return DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|d| d.with_timezone(&Utc));
    }
    Helsinki
        .from_local_datetime(&parse_naive(s)?)
        .earliest()
        .map(|d| d.with_timezone(&Utc))
}

/// Timestamps from `meter_reading`, whose `dt` field is **always UTC** even
/// though it carries no zone suffix — the opposite convention from
/// `meter_reading_yh`, so it needs its own parser.
fn parse_timestamp_utc(s: &str) -> Option<DateTime<Utc>> {
    if s.ends_with('Z') || s.contains('+') {
        return DateTime::parse_from_rfc3339(s)
            .ok()
            .map(|d| d.with_timezone(&Utc));
    }
    Some(Utc.from_utc_datetime(&parse_naive(s)?))
}

/// Elenia reports energy in Wh; the rest of the app works in kWh.
fn flatten_meter_reading(raw: MeterReadingYh, step: Duration) -> Vec<ConsumptionSeries> {
    let mut out = Vec::new();
    for month in raw.months {
        let netted: HashMap<String, Option<f64>> = month
            .hourly_values_netted
            .into_iter()
            .map(|m| (m.t, m.v))
            .collect();

        for value in month.hourly_values {
            let Some(start) = parse_timestamp(&value.t) else {
                continue;
            };
            out.push(ConsumptionSeries {
                start: Some(start),
                stop: Some(start + step),
                electricity: value.v.map(|v| v / 1000.0),
                electricity_netted: netted
                    .get(&value.t)
                    .copied()
                    .flatten()
                    .map(|v| v / 1000.0),
                electricity_spot_prices: None,
                electricity_spot_prices_vat: None,
            });
        }
    }
    out
}

fn set_price(item: &mut ConsumptionSeries, price_with_vat: f64) {
    let ts = item.start.unwrap_or_else(Utc::now);
    item.electricity_spot_prices_vat = Some(price_with_vat);
    item.electricity_spot_prices = Some(price_with_vat / vat_multiplier(ts));
}

/// Is `ts` inside the inclusive Helsinki date range [start, stop]?
fn in_range(ts: Option<DateTime<Utc>>, start: NaiveDate, stop: NaiveDate) -> bool {
    let Some(ts) = ts else { return false };
    let (from, to) = helsinki_range(start, stop);
    ts >= from && ts < to
}

/// Helsinki local midnight of `start` .. local midnight after `stop`, in UTC.
pub fn helsinki_range(start: NaiveDate, stop: NaiveDate) -> (DateTime<Utc>, DateTime<Utc>) {
    let from = Helsinki
        .from_local_datetime(&start.and_time(NaiveTime::MIN))
        .earliest()
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);
    let to = Helsinki
        .from_local_datetime(&(stop + Duration::days(1)).and_time(NaiveTime::MIN))
        .earliest()
        .map(|d| d.with_timezone(&Utc))
        .unwrap_or_else(Utc::now);
    (from, to)
}

enum Bucket {
    Day,
    Month,
}

/// Roll hourly values up into days or months (Helsinki calendar).
/// Prices become consumption-weighted averages so that kWh × price still
/// equals the true cost of the bucket.
fn aggregate(series: Vec<ConsumptionSeries>, bucket: Bucket) -> Vec<ConsumptionSeries> {
    let mut buckets: Vec<(DateTime<Utc>, DateTime<Utc>, Acc)> = Vec::new();

    for item in series {
        let Some(start) = item.start else { continue };
        let local = start.with_timezone(&Helsinki);
        let (bucket_start_local, bucket_end_local) = match bucket {
            Bucket::Day => {
                let d = local.date_naive();
                (d, d + Duration::days(1))
            }
            Bucket::Month => {
                let d = NaiveDate::from_ymd_opt(local.year(), local.month(), 1).unwrap();
                let next = if local.month() == 12 {
                    NaiveDate::from_ymd_opt(local.year() + 1, 1, 1).unwrap()
                } else {
                    NaiveDate::from_ymd_opt(local.year(), local.month() + 1, 1).unwrap()
                };
                (d, next)
            }
        };

        let (b_start, b_stop) = {
            let s = Helsinki
                .from_local_datetime(&bucket_start_local.and_time(NaiveTime::MIN))
                .earliest()
                .unwrap()
                .with_timezone(&Utc);
            let e = Helsinki
                .from_local_datetime(&bucket_end_local.and_time(NaiveTime::MIN))
                .earliest()
                .unwrap()
                .with_timezone(&Utc);
            (s, e)
        };

        let entry = match buckets.iter_mut().find(|(s, _, _)| *s == b_start) {
            Some(e) => &mut e.2,
            None => {
                buckets.push((b_start, b_stop, Acc::default()));
                &mut buckets.last_mut().unwrap().2
            }
        };
        entry.add(&item);
    }

    buckets.sort_by_key(|(s, _, _)| *s);
    buckets
        .into_iter()
        .map(|(start, stop, acc)| acc.finish(start, stop))
        .collect()
}

#[derive(Default)]
struct Acc {
    kwh: Option<f64>,
    kwh_netted: Option<f64>,
    weighted_cost_vat: f64,
    price_sum_vat: f64,
    price_count: usize,
}

impl Acc {
    fn add(&mut self, item: &ConsumptionSeries) {
        if let Some(v) = item.electricity {
            *self.kwh.get_or_insert(0.0) += v;
        }
        if let Some(v) = item.electricity_netted {
            *self.kwh_netted.get_or_insert(0.0) += v;
        }
        if let Some(p) = item.electricity_spot_prices_vat {
            self.price_sum_vat += p;
            self.price_count += 1;
            self.weighted_cost_vat += p * item.electricity.unwrap_or(0.0);
        }
    }

    fn finish(self, start: DateTime<Utc>, stop: DateTime<Utc>) -> ConsumptionSeries {
        let price_vat = if self.price_count == 0 {
            None
        } else if self.kwh.unwrap_or(0.0) > 0.0 {
            Some(self.weighted_cost_vat / self.kwh.unwrap())
        } else {
            Some(self.price_sum_vat / self.price_count as f64)
        };

        let mut item = ConsumptionSeries {
            start: Some(start),
            stop: Some(stop),
            electricity: self.kwh,
            electricity_netted: self.kwh_netted,
            electricity_spot_prices: None,
            electricity_spot_prices_vat: None,
        };
        if let Some(p) = price_vat {
            set_price(&mut item, p);
        }
        item
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_both_timestamp_styles() {
        let utc = parse_timestamp("2026-07-25T09:00:00Z").unwrap();
        assert_eq!(utc.to_rfc3339(), "2026-07-25T09:00:00+00:00");

        // In meter_reading_yh a naive timestamp is Helsinki local (UTC+3 in July)…
        let local = parse_timestamp("2026-07-25T12:00:00").unwrap();
        assert_eq!(local.to_rfc3339(), "2026-07-25T09:00:00+00:00");

        // …but in meter_reading the very same format is already UTC.
        let raw = parse_timestamp_utc("2026-07-25T12:00:00").unwrap();
        assert_eq!(raw.to_rfc3339(), "2026-07-25T12:00:00+00:00");
    }

    #[test]
    fn vat_rate_changes_in_september_2024() {
        let before = parse_timestamp("2024-08-31T12:00:00Z").unwrap();
        let after = parse_timestamp("2024-09-01T12:00:00Z").unwrap();
        assert_eq!(vat_multiplier(before), 1.24);
        assert_eq!(vat_multiplier(after), 1.255);
    }

    #[test]
    fn converts_wh_to_kwh_and_pairs_netted_values() {
        let raw = MeterReadingYh {
            months: vec![MeterReadingMonth {
                hourly_values: vec![MeterValue {
                    t: "2026-07-25T09:00:00Z".into(),
                    v: Some(1500.0),
                }],
                hourly_values_netted: vec![MeterValue {
                    t: "2026-07-25T09:00:00Z".into(),
                    v: Some(1200.0),
                }],
            }],
        };
        let series = flatten_meter_reading(raw, Duration::hours(1));
        assert_eq!(series.len(), 1);
        assert_eq!(series[0].electricity, Some(1.5));
        assert_eq!(series[0].electricity_netted, Some(1.2));
        assert_eq!(
            series[0].stop.unwrap() - series[0].start.unwrap(),
            Duration::hours(1)
        );
    }

    #[test]
    fn parses_cumulative_meter_registers() {
        let json = serde_json::json!([
            { "dt": "2026-07-26T18:05:00", "a": 7089935.0, "a_": 100.0 },
            { "dt": "2026-07-26T18:10:00", "a": 7089956.0, "a_": 105.0 },
        ]);
        let regs = parse_meter_registers(&json);
        assert_eq!(regs.len(), 2);
        // 21 Wh imported, 5 Wh exported over the interval.
        assert_eq!(regs[1].import.unwrap() - regs[0].import.unwrap(), 21.0);
        assert_eq!(regs[1].export.unwrap() - regs[0].export.unwrap(), 5.0);
    }

    #[test]
    fn floors_timestamps_to_the_quarter_hour_price_bucket() {
        let ts = parse_timestamp("2026-07-26T18:07:00Z").unwrap();
        assert_eq!(floor_to(ts, 15).to_rfc3339(), "2026-07-26T18:00:00+00:00");
        let ts = parse_timestamp("2026-07-26T18:59:59Z").unwrap();
        assert_eq!(floor_to(ts, 15).to_rfc3339(), "2026-07-26T18:45:00+00:00");
    }

    #[test]
    fn daily_aggregate_uses_consumption_weighted_price() {
        let day = NaiveDate::from_ymd_opt(2026, 7, 25).unwrap();
        let (start, _) = helsinki_range(day, day);
        let mut a = ConsumptionSeries {
            start: Some(start),
            stop: Some(start + Duration::hours(1)),
            electricity: Some(1.0),
            electricity_netted: None,
            electricity_spot_prices: None,
            electricity_spot_prices_vat: None,
        };
        let mut b = ConsumptionSeries {
            start: Some(start + Duration::hours(1)),
            stop: Some(start + Duration::hours(2)),
            electricity: Some(3.0),
            electricity_netted: None,
            electricity_spot_prices: None,
            electricity_spot_prices_vat: None,
        };
        set_price(&mut a, 10.0);
        set_price(&mut b, 2.0);

        let out = aggregate(vec![a, b], Bucket::Day);
        assert_eq!(out.len(), 1);
        assert_eq!(out[0].electricity, Some(4.0));
        // (1×10 + 3×2) / 4 = 4.0 c/kWh
        assert_eq!(out[0].electricity_spot_prices_vat, Some(4.0));
    }
}
