use crate::elenia_client::ConsumptionSeries;
use anyhow::{anyhow, Result};
use reqwest::Client;
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InfluxConfig {
    pub url: String,
    pub token: String,
    pub org: String,
    pub bucket: String,
    pub enabled: bool,
    pub interval_minutes: u64,
}

impl Default for InfluxConfig {
    fn default() -> Self {
        Self {
            url: "http://localhost:8086".to_string(),
            token: String::new(),
            org: String::new(),
            bucket: "electricity".to_string(),
            enabled: false,
            interval_minutes: 60,
        }
    }
}

fn config_path() -> PathBuf {
    PathBuf::from("influx_config.json")
}

pub fn load_config() -> InfluxConfig {
    std::fs::read_to_string(config_path())
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

pub fn save_config(config: &InfluxConfig) -> Result<()> {
    std::fs::write(config_path(), serde_json::to_string_pretty(config)?)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Connection test
// ---------------------------------------------------------------------------

pub async fn test_connection(config: &InfluxConfig) -> Result<String> {
    // Early guard — catch obviously missing fields before any network call
    if config.token.trim().is_empty() {
        return Err(anyhow!(
            "API token is empty — fill in the Token field and save first"
        ));
    }
    if config.org.trim().is_empty() {
        return Err(anyhow!("Organization is empty — fill in the Org field"));
    }
    if config.bucket.trim().is_empty() {
        return Err(anyhow!("Bucket is empty — fill in the Bucket field"));
    }

    let client = Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()?;

    // 1. Ping — proves the server is reachable (no auth needed)
    let ping = format!("{}/ping", config.url.trim_end_matches('/'));
    let r = client
        .get(&ping)
        .send()
        .await
        .map_err(|e| anyhow!("Cannot reach InfluxDB at '{}': {}", config.url, e))?;
    if !r.status().is_success() && r.status().as_u16() != 204 {
        return Err(anyhow!("InfluxDB ping returned {}", r.status()));
    }

    // 2. Bucket lookup — validates token + org + bucket in one call
    let buckets_url = format!("{}/api/v2/buckets", config.url.trim_end_matches('/'));
    let r = client
        .get(&buckets_url)
        .query(&[("org", config.org.as_str()), ("name", config.bucket.as_str())])
        .header("Authorization", format!("Token {}", config.token))
        .send()
        .await?;

    let http_status = r.status().as_u16();
    let body: serde_json::Value = r.json().await.unwrap_or_else(|_| serde_json::json!({}));

    if http_status == 401 || http_status == 403 {
        let influx_msg = body["message"]
            .as_str()
            .unwrap_or("Invalid or missing API token");
        return Err(anyhow!("Authentication failed: {}", influx_msg));
    }
    if http_status >= 400 {
        let influx_msg = body["message"].as_str().unwrap_or("Unknown error");
        return Err(anyhow!(
            "Bucket check failed (HTTP {}): {}",
            http_status,
            influx_msg
        ));
    }

    let found = body["buckets"].as_array().map(|a| a.len()).unwrap_or(0);
    if found == 0 {
        // Scoped write-only tokens cannot list buckets — that is fine.
        return Ok(format!(
            "Server reached ✓ (Note: Bucket '{}' not listed, check if token is write-only)",
            config.bucket
        ));
    }

    Ok(format!(
        "Connected ✓ — bucket '{}' is ready in org '{}'",
        config.bucket, config.org
    ))
}

// ---------------------------------------------------------------------------
// Write data
// ---------------------------------------------------------------------------

pub async fn write_points(config: &InfluxConfig, lines: &str) -> Result<usize> {
    if lines.trim().is_empty() {
        return Ok(0);
    }
    let count = lines.lines().filter(|l| !l.trim().is_empty()).count();

    let client = Client::new();
    let url = format!("{}/api/v2/write", config.url.trim_end_matches('/'));
    let r = client
        .post(&url)
        .query(&[
            ("org", config.org.as_str()),
            ("bucket", config.bucket.as_str()),
            ("precision", "s"),
        ])
        .header("Authorization", format!("Token {}", config.token))
        .header("Content-Type", "text/plain; charset=utf-8")
        .body(lines.to_string())
        .send()
        .await?;

    if !r.status().is_success() {
        let status = r.status();
        let body = r.text().await.unwrap_or_default();
        return Err(anyhow!("InfluxDB write failed ({}): {}", status, body));
    }
    Ok(count)
}

// ---------------------------------------------------------------------------
// Line-protocol conversion
// ---------------------------------------------------------------------------

/// Convert an Elenia series to InfluxDB line protocol (precision = seconds).
/// Measurement : elenia_electricity
/// Tags        : gsrn, resolution
/// Fields      : electricity (kWh), electricity_netted (kWh),
///               spot_price (c/kWh excl VAT), spot_price_vat (c/kWh incl VAT)
///
/// `resolution` is a tag rather than a field so that points of different
/// granularity never collapse onto each other and corrupt sums.
pub fn to_line_protocol(gsrn: &str, resolution: &str, series: &[ConsumptionSeries]) -> String {
    series
        .iter()
        .filter_map(|item| {
            let ts = item.start?.timestamp();
            let mut fields = Vec::new();
            if let Some(v) = item.electricity {
                fields.push(format!("electricity={}", v));
            }
            if let Some(v) = item.electricity_netted {
                fields.push(format!("electricity_netted={}", v));
            }
            if let Some(v) = item.electricity_spot_prices {
                fields.push(format!("spot_price={}", v));
            }
            if let Some(v) = item.electricity_spot_prices_vat {
                fields.push(format!("spot_price_vat={}", v));
            }
            if fields.is_empty() {
                return None;
            }
            Some(format!(
                "elenia_electricity,gsrn={},resolution={} {} {}",
                gsrn,
                resolution,
                fields.join(","),
                ts
            ))
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{TimeZone, Utc};

    #[test]
    fn skips_intervals_without_any_value() {
        let series = vec![
            ConsumptionSeries {
                start: Some(Utc.with_ymd_and_hms(2026, 7, 25, 9, 0, 0).unwrap()),
                stop: None,
                electricity: Some(0.25),
                electricity_netted: None,
                electricity_spot_prices: Some(2.0),
                electricity_spot_prices_vat: Some(2.51),
            },
            ConsumptionSeries {
                start: Some(Utc.with_ymd_and_hms(2026, 7, 25, 10, 0, 0).unwrap()),
                stop: None,
                electricity: None,
                electricity_netted: None,
                electricity_spot_prices: None,
                electricity_spot_prices_vat: None,
            },
        ];
        let lines = to_line_protocol("64300123", "5min", &series);
        assert_eq!(
            lines,
            "elenia_electricity,gsrn=64300123,resolution=5min electricity=0.25,spot_price=2,spot_price_vat=2.51 1784970000"
        );
    }
}
