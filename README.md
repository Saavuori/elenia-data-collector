# EleniaFlow — Elenia Electricity Data Collector

A self-hosted tool that collects your electricity consumption and spot price
data from [Elenia Aina](https://aina.elenia.fi) and displays it in a clean web
dashboard. Optionally exports data to InfluxDB.

---

## Features

- ⚡ **Near Real-Time** — 5-minute consumption straight from the meter registers, typically only 10–20 minutes behind
- 📊 **Interactive Dashboard** — 5-minute, 15-minute, hourly, daily and monthly consumption charts with Nord Pool spot prices (VAT incl./excl.)
- 📱 **Mobile-First UI** — touch-friendly layout with a bottom tab bar, light/dark themes, safe-area support and an installable web app manifest; scales up to a full desktop dashboard
- 🏡 **Metering Point Discovery** — lists every delivery site on your Elenia account and lets you pick the active one
- 🔄 **Automatic Session Refresh** — handles Elenia Aina's cookie/CSRF login and keeps the measurement API session alive in the background
- 📡 **InfluxDB Export** — optional background sync of yesterday's and today's consumption data to your local/remote InfluxDB instance
- 🐳 **Single Docker Container** — Rust backend + React frontend compiled and served on a single port for minimal footprint
- 🔁 **Auto-Updates** — Watchtower configuration included for seamless automatic container updates in the background

---

## Quick Install (Raspberry Pi or any Linux)

### Prerequisites

- Docker + Docker Compose installed
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```

### 1. Run the installer

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/Saavuori/elenia-data-collector/main/install.sh)
```

This creates an `elenia-collector/` directory with everything you need.

### 2. Start the app

```bash
cd elenia-collector
docker compose up -d
```

### 3. Open the web UI

The container publishes **no host port** by default — it joins the shared
`web-proxy` Docker network and is reached by container name through a reverse
proxy. With [caddy-proxy](https://github.com/Saavuori/caddy-proxy), add:

```
redir /eleniadatacollector /eleniadatacollector/

handle_path /eleniadatacollector* {
    reverse_proxy elenia-collector:3000
}
```

then reload Caddy and open `https://<your-domain>/eleniadatacollector/`.

**No reverse proxy?** Uncomment the `ports` block in `docker-compose.yml` and
browse to `http://<your-device-ip>:3001`. Pick a port that is actually free —
3000 and 8080 are commonly taken by other self-hosted services.

Log in with your **Elenia Aina** email and password. Your credentials are saved
locally so the app logs in automatically on restart.

The frontend is built with relative asset paths and relative API calls, so it
works correctly under any path prefix without extra configuration.

---

## Running Alongside Other Collectors

EleniaFlow uses its own **Watchtower scope**, so it updates independently of
anything else you run. Just keep it in its own directory:

```
~/helen-collector/     ← HelenFlow
~/elenia-collector/    ← EleniaFlow
```

Both can keep their internal port `3000`: on the `web-proxy` network they are
addressed by container name, so only the container name and URL path need to be
unique.

---

## InfluxDB Export & Settings (Optional)

Pick the delivery site you want to follow on the **Sites** tab, then configure
InfluxDB export on the **Settings** tab. The collector syncs yesterday's and
today's 5-minute consumption data to InfluxDB on the configured interval.

Data is written using this schema:

```
elenia_electricity,gsrn=<meter-id>,resolution=<5min|quarter>
  electricity=<kWh>
  electricity_netted=<kWh, own production netted off>
  spot_price=<c/kWh excl. VAT>
  spot_price_vat=<c/kWh incl. VAT>
  <unix timestamp in seconds>
```

Older meters that publish no 5-minute data fall back to the settled 15-minute
series. `resolution` is a **tag** so the two granularities can never collapse
onto each other and corrupt your sums — filter on it in Grafana.

---

## Data Availability

Elenia exposes two different feeds, and they are not equally fresh:

| Feed | Used for | Delay |
|---|---|---|
| Raw meter registers | the **5m** view | ~10–20 minutes |
| Settled measurement series | **15m**, **1h**, **1d**, **1mo** | 1–3 days |

The dashboard opens on *today* at 5-minute resolution and refreshes itself
every five minutes. If the coarser views look empty for a recent day, that day
simply has not been settled yet — the 5-minute view will still have it.

The 5-minute figures are differenced from the meter's cumulative registers and
sum to exactly the same daily total as Elenia's own settled series.

---

## Updating

Updates are automatic — [Watchtower](https://containrrr.dev/watchtower/) checks
for new images every 5 minutes and restarts the container when one is available.

To update manually:

```bash
cd elenia-collector
docker compose pull
docker compose up -d
```

---

## Data Persistence

| File | Contents |
|---|---|
| `credentials.json` | Your Elenia Aina login and selected metering point (saved by the app on first login) |
| `influx_config.json` | InfluxDB connection settings |

Both files are mounted into the container as volumes and survive container
restarts and updates.

---

## Local Development

**Backend (Rust/Axum):**
```bash
cd backend
cargo run
# Serves API on http://localhost:3000
```

**Frontend (React/Vite):**
```bash
cd frontend
npm install
npm run dev
# Serves UI on http://localhost:5173 (proxies API to :3000)
```

**Tests:**
```bash
cd backend
cargo test
```

---

## How It Works

Elenia has no documented public API. The backend reproduces the calls the Elenia
Aina web portal makes — cookie/CSRF login, an applications token, then a service
token for the measurement API. The full protocol is documented in
[ELENIA_API.md](ELENIA_API.md).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Rust, Axum, reqwest, tokio |
| Frontend | React 19, TypeScript, Vite, Fluent UI v9, Recharts |
| Container | Docker, Alpine Linux |
| CI/CD | GitHub Actions, GHCR |
| Auto-update | Watchtower |

---

## Disclaimer

This is an unofficial tool. It is not affiliated with or endorsed by Elenia Oy,
and it relies on undocumented endpoints that may change without notice. Use it
with your own account and your own data only.
