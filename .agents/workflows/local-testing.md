---
description: how to run and test EleniaFlow Collector locally
---

# Local Testing and Development

## Project Overview

EleniaFlow Collector is a self-hosted tool that retrieves electricity consumption and Nord Pool spot price data from Elenia Aina (`aina.elenia.fi`).
* **Production Environment**: Runs in a Docker container on a Raspberry Pi or other target server. It automatically updates via Watchtower when new images are built and pushed to GitHub Container Registry (GHCR) from the `main` branch.
* **InfluxDB Export**: Active in production, writing to a remote InfluxDB instance (e.g. bucket `RUUVI`).

---

## Local Testing Guidelines

Always perform local testing and development **without InfluxDB**.

### 1. Backend (Rust/Axum)
Run the backend server locally. Since default port `3000` is often taken by other services:
* Use a custom port (e.g., `3050`) using the `PORT` environment variable.
* The backend will serve the API and fall back to serving static files from the `dist` directory if built.

**To run the backend locally:**
```powershell
$env:PORT="3050"
cargo run --manifest-path backend/Cargo.toml
```

**To run the unit tests:**
```powershell
cargo test --manifest-path backend/Cargo.toml
```

### 2. Frontend (React/Vite)
Run the Vite development server.
* Pass the `VITE_API_URL` environment variable pointing to the custom port of the local backend server (e.g. `http://localhost:3050`).
* Serves the web UI on `http://localhost:5173`.

**To run the frontend locally:**
```powershell
$env:VITE_API_URL="http://localhost:3050"
npm run dev --prefix frontend
```

---

## Configuration Files Location
When running locally, your configuration and credentials are saved inside the `backend` folder:
* `backend/credentials.json`
* `backend/influx_config.json`

---

## Elenia API Notes
* Spot price endpoints (`market_prices`, `market_prices_15min`) are public — they can be curled without any login, which makes them handy for smoke tests.
* Consumption endpoints need a valid Elenia Aina account; the login flow is documented in `ELENIA_API.md`.
* Metered values are published with a delay (typically 1–3 days), so testing against *today* often returns an empty series. Use yesterday or earlier.
