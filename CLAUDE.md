# CLAUDE.md

Guidance for AI assistants working in this repository.

## What this project is

**EleniaFlow** — a self-hosted collector and dashboard for electricity
consumption and Nord Pool spot prices from [Elenia Aina](https://aina.elenia.fi)
(a Finnish DSO). A Rust/Axum backend scrapes Elenia's undocumented portal API and
serves a React/Vite single-page app from the same port; InfluxDB export is
optional. Ships as one multi-arch Docker image, typically run on a Raspberry Pi
behind a Caddy reverse proxy and auto-updated by Watchtower.

Single-user, self-hosted tool. There is no multi-tenancy, no user database and no
auth on the backend's own HTTP API — it is assumed to sit behind a private
reverse proxy.

## Layout

```
backend/                Rust workspace-less binary crate (edition 2024)
  src/main.rs           Axum router, handlers, background tasks, credentials.json
  src/elenia_client.rs  All Elenia API logic + unit tests (largest file, ~1.2k lines)
  src/influx.rs         InfluxDB config, connection test, line-protocol writer
  *.json.example        Templates for the two gitignored config files
frontend/               React 19 + TypeScript + Vite SPA
  src/App.tsx           Shell: login gate, tab routing, theme state
  src/theme.ts          Palettes, Fluent theme overrides, CSS-variable bridge
  src/components/       UsageView (charts), SitesView, SettingsView, TopBar,
                        BottomNav, LoginForm, Logo, ui.tsx (primitives)
  src/types.ts          Mirrors the backend's serialized shapes — keep in sync
Dockerfile              3-stage cross-compiling build (node → xx-cargo → alpine)
docker-compose.yml      Production deployment incl. scoped Watchtower
install.sh              One-liner installer for end users
ELENIA_API.md           Protocol reference: auth flow, endpoints, REST API table
.agents/workflows/      Repo-local agent notes (local-testing.md)
```

## Commands

```bash
# Backend — serves API and falls back to serving ./dist
cargo run   --manifest-path backend/Cargo.toml     # port 3000, override with PORT
cargo test  --manifest-path backend/Cargo.toml     # 7 unit tests, no network needed
cargo clippy --manifest-path backend/Cargo.toml

# Frontend
npm install --prefix frontend
npm run dev   --prefix frontend                    # :5173, VITE_API_URL → backend
npm run build --prefix frontend                    # tsc -b && vite build → dist/
npm run lint  --prefix frontend                    # eslint (flat config)
```

Port 3000 is often taken on dev machines; prefer `PORT=3050` for the backend and
`VITE_API_URL=http://localhost:3050` for the frontend. `.agents/workflows/local-testing.md`
has the PowerShell form of this (the maintainer develops on Windows).

**Do all local development without InfluxDB** — leave `enabled: false`. The
production instance writes to a real remote InfluxDB.

Backend unit tests are pure functions (timestamp parsing, VAT, Wh→kWh,
aggregation, line protocol) and need no credentials or network. Anything
touching Elenia itself cannot be tested offline; the spot-price endpoints
(`market_prices`, `market_prices_15min`) are public and curl-able, which makes
them the only usable smoke test without an account.

## How the backend works

**Auth is a 5-step chain** (full detail in `ELENIA_API.md`): CSRF cookie →
credentials login → `/api/customerships` for the `userId` → applications bearer
token → `customer_data_and_token`, which yields the ~3 h *service token* plus the
account's metering points. Every login builds a **fresh cookie jar** — reusing a
stale jar breaks the CSRF handshake.

Session upkeep is two-layered and both layers must keep working:
- a background task in `main.rs` re-logs in every 60 minutes;
- `is_session_error()` + `relogin_if_needed()` catch an expired token mid-request,
  re-login once and retry. `is_session_error` matches on the error *strings*
  `"No access token"` / `"login required"`, so don't reword those messages in
  `elenia_client.rs` without updating the matcher.

**Two data feeds with very different freshness** — this is the core domain fact:

| Feed | Endpoint | Resolutions | Delay |
|---|---|---|---|
| Raw cumulative meter registers | `meter_reading` | `5min` | ~10–20 min |
| Settled measurement series | `meter_reading_yh` | `quarter`, `hour`, `day`, `month` | 1–3 days |

The `5min` series is *differenced* from cumulative Wh registers (`a` import,
`a_` export), so `fetch_five_minute_series` deliberately fetches one extra day
before `start` to seed the first difference, and a negative step (register reset
or rollover) is dropped rather than reported. `day`/`month` are computed
locally by `aggregate()` over the hourly series — Elenia is not asked for them.

**Timestamps are the classic trap.** Both parsers exist on purpose:
`parse_timestamp` treats a zone-less string as **Helsinki local** (matching
`meter_reading_yh` and how the Elenia web app reads it), while
`parse_timestamp_utc` treats the *same format* from `meter_reading`'s `dt` field
as **UTC**. Everything is normalised to UTC internally; ranges are Helsinki
calendar days (`helsinki_range`). There is a unit test pinning both conventions —
if it fails, you changed a convention, not a detail.

**Prices** come from public endpoints and arrive *including* VAT. The VAT-free
value is derived by dividing with the rate in force at that timestamp
(`vat_multiplier`: 1.24 before 2024-09-01, 1.255 after). Prices are attached to
intervals *before* aggregation so day/month prices are consumption-weighted
(kWh × price still equals real cost). Hourly prices are cached per year in
`price_cache`.

**Persistence** is two plaintext JSON files in the process working directory,
mounted as volumes in production and gitignored: `credentials.json` (Elenia
email, password, selected GSRN) and `influx_config.json`. Both are read on
demand rather than held only in memory. Locally they land in `backend/`.
Never commit them, never log their contents, and never print a password or
token in a log line or error message.

**InfluxDB export**: a 60 s ticker checks `influx_config.json` and syncs
yesterday + today when `interval_minutes` has elapsed, preferring `5min` and
falling back to `quarter` when the meter publishes no register data.
`resolution` is a **tag**, not a field, so granularities can never collapse onto
each other and corrupt sums.

## How the frontend works

- Mobile-first. Base CSS rules describe the phone layout; `@media (min-width: 768px)`
  blocks scale up. Single breakpoint, exposed as `useIsMobile()` — don't invent
  a second one.
- Styling is Griffel (`makeStyles` from Fluent UI v9) for structure plus CSS
  custom properties for colour. `applyPaletteToDocument()` mirrors the active
  `Palette` onto `--bg`, `--surface`, `--energy`, … because Griffel rules are
  static and cannot read React state. Use `usePalette()` only where CSS
  variables can't reach: Recharts props, inline SVG fills.
- Add colours to **both** `dark` and `light` in `theme.ts` — the `Palette`
  interface forces this, and components stay theme-agnostic.
- Server state is TanStack Query; `axios.defaults.baseURL` is set in `App.tsx`
  and is **empty in production builds**. All API calls and asset paths must stay
  *relative* (`axios.get('consumption')`, `base: './'` in `vite.config.ts`) so
  the app works under any reverse-proxy path prefix. Never introduce a leading
  slash or an absolute URL.
- `UsageView` picks the resolution from the range length (≤1 day → `5min`,
  ≤2 → `quarter`, ≤31 → `hour`, else `day`) unless the user overrides it, and
  polls every 5 minutes while showing today at `5min`.
- `errorText()` in `api.ts` surfaces the backend's passthrough of Elenia's own
  error text — keep that path intact rather than replacing it with generic
  messages.
- `src/types.ts` duplicates the backend's serde shapes by hand. Change a
  `Serialize` struct in Rust → update the TS interface in the same commit.

## Backend REST API

Served at the root, with `ServeDir("dist")` as the fallback so the SPA and API
share one port.

| Route | Purpose |
|---|---|
| `POST /login` | `{username, password}`; saves credentials on success |
| `GET /status` | `{logged_in}` |
| `GET /version` | build version (`VERSION` build arg, else crate version) |
| `GET /consumption?start&stop&resolution` | main data endpoint, dates are Helsinki days |
| `GET /meter-reading?day` | Elenia's raw register JSON, unmodified |
| `GET /metering-points`, `POST /metering-points/select` | site discovery/selection |
| `GET,POST /influx/config`, `GET /influx/status`, `POST /influx/test`, `POST /influx/sync` | export settings |

CORS is permissive (`CorsLayer::permissive()`) because dev runs on two ports.

## Conventions

- **Rust**: `anyhow::Result` with `.context()` everywhere; `tracing` for logs
  (`RUST_LOG`, default `info`); shared state is `Arc<Mutex<AppState>>` (tokio
  mutex — never hold it across a long await chain you don't need to);
  section banner comments (`// ---- Name ----`) separate concerns within a file.
- **Comments explain *why*, not *what*.** The existing code is dense with
  domain rationale (why a seed day, why two timestamp parsers, why resolution is
  a tag). Match that: a non-obvious workaround gets a sentence explaining the
  Elenia behaviour that forced it.
- **TypeScript**: functional components typed `React.FC`, named `useStyles` per
  file, shared primitives in `components/ui.tsx` (`Card`, `SectionHeader`,
  `SegmentedControl`, `StatTile`, `Row`/`RowList`, `EmptyState`, `Sheet`) — reuse
  these rather than hand-rolling another card.
- Units: Elenia reports Wh, the app works in **kWh**; prices are **c/kWh**.
  Convert at the parse boundary, not downstream.
- Don't add dependencies casually — the image is deliberately small
  (Alpine + a static musl binary).

## CI / release

`.github/workflows/docker-build.yml` runs on push to `main` (skipping
markdown-only changes): it bumps a git tag, then builds and pushes
`ghcr.io/saavuori/elenia-data-collector` for **linux/arm64** only (the target is
a Raspberry Pi). The Dockerfile cross-compiles with `tonistiigi/xx`; the frontend
stage always runs on the build host platform. `VERSION` is passed as a build arg
and surfaces at `GET /version`. Watchtower on the device polls every 5 minutes
under the `elenia-collector` scope, so merging to `main` deploys to production.
Keep that in mind: a broken `main` reaches the Pi within minutes.

## Working in this repo

- Branch, commit, push; open a PR only when asked.
- The maintainer's other collector, HelenFlow, shares field names
  (`electricity`, `electricity_netted`, `electricity_spot_prices*`) so the same
  Grafana dashboards work against both. Renaming those breaks dashboards.
- When Elenia's protocol understanding changes, update `ELENIA_API.md` alongside
  the code — it is the reference for the whole scraping layer.
- This tool relies on undocumented endpoints belonging to a third party. Keep it
  to normal single-account portal traffic: no aggressive polling loops, no
  parallel hammering of Elenia's endpoints, no attempts to reach data outside
  the logged-in account.
