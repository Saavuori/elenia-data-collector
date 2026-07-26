# Elenia API Integration — Backend Documentation

> How the Rust backend authenticates with Elenia Aina and fetches electricity
> consumption data.

---

## Overview

Elenia does not publish a public API. The backend reproduces the requests the
**Elenia Aina** web portal (`aina.elenia.fi`) makes from the browser, then calls
Elenia's measurement API to retrieve metered electricity data.

| Purpose | Base URL |
|---|---|
| Portal / authentication | `https://api.aina.elenia.fi` |
| Measurement & price data | `https://public.sgp-prod.aws.elenia.fi/api/gen` |

Two different tokens are involved:

| Token | Obtained from | Used for | Lifetime |
|---|---|---|---|
| *Applications token* | `api.aina.elenia.fi` | one call only — exchanging for the service token | short |
| *Service token* | `customer_data_and_token` | every measurement API call | ~3 h |

---

## Authentication Flow

The portal is cookie- and CSRF-based, so the client keeps a cookie jar and
echoes the `csrf_token` cookie back in an `x-csrf-token` header.

```
Client                                  Elenia
   |                                       |
   |-- GET  /api/csrf-token -------------->|  Set-Cookie: csrf_token
   |                                       |
   |-- POST /api/auth/login/               |  { email, password }
   |        credentials-authentication --->|  Set-Cookie: sessionId, access_token,
   |<--------------------------------------|              id_token, refresh_token
   |                                       |
   |-- GET  /api/customerships ----------->|  x-csrf-token header
   |<-- { data: { user: { userId } } } ----|
   |                                       |
   |-- POST /api/auth/access/token/        |
   |        {userId}/v2/bearer ----------->|
   |<-- { data: { token } } ---------------|  applications token
   |                                       |
   |-- GET  /api/gen/customer_data_and_token
   |        Authorization: Bearer <app> -->|
   |<-- { token, customer_datas } ---------|  service token + metering points
```

### Step details

#### 1. `GET https://api.aina.elenia.fi/api/csrf-token`

No body. Responds with `Set-Cookie: csrf_token=…; Domain=.aina.elenia.fi`.

#### 2. `POST /api/auth/login/credentials-authentication`

```json
{ "email": "user@example.com", "password": "secret" }
```

- `200 OK` — session cookies are set.
- `401` with body `{"error":"credentials_error"}` — wrong e-mail or password.
- The endpoint is rate limited (`x-ratelimit-reset` header).

#### 3. `GET /api/customerships`

Returns the customerships the account can act for:

```json
{
  "data": {
    "user": { "userId": "6255f4a4-9091-70be-…", "…": "…" },
    "mandatedUsers": [ { "userId": "…" } ]
  }
}
```

The backend uses `data.user.userId`, falling back to the first mandated user.

#### 4. `POST /api/auth/access/token/{userId}/v2/bearer`

Empty JSON body, `x-csrf-token` header required. Returns:

```json
{ "data": { "token": "<applications token>" } }
```

#### 5. `GET https://public.sgp-prod.aws.elenia.fi/api/gen/customer_data_and_token`

`Authorization: Bearer <applications token>`. Returns the *service* token plus
every metering point the account can see:

```json
{
  "token": "<service token>",
  "customer_datas": {
    "7757079": {
      "meteringpoints": [
        {
          "gsrn": "643006966035524955",
          "device_serialnumber": "1234567890123456",
          "productcode_description": "Yleissiirto 3x25A",
          "address": { "streetaddress": "Esimerkkitie 1", "postalcode": "33100", "city": "Tampere" },
          "device": { "name": "Aidon 6534" }
        }
      ]
    }
  }
}
```

A metering point is identified by the pair **`customer_id` + `gsrn`** — both are
required on every data request.

---

## Consumption Data

```
GET https://public.sgp-prod.aws.elenia.fi/api/gen/meter_reading_yh
    ?gsrn=<gsrn>
    &customer_ids=<customer id>
    &year=<YYYY | YYYY-MM-DD>
    &timestep=<PT1H | PT15M>
Authorization: Bearer <service token>
```

| `timestep` | `year` parameter | Returns |
|---|---|---|
| `PT1H` | `2026` | every hour of that calendar year |
| `PT15M` | `2026-07-25` | every 15 minutes of that single day |

### Response

```json
{
  "year": 2026,
  "months": [
    {
      "month": 7,
      "hourly_values":          [ { "t": "2026-07-25T00:00:00", "v": 412.0 } ],
      "hourly_values_netted":   [ { "t": "2026-07-25T00:00:00", "v": 380.0 } ],
      "hourly_values_reactive": [ … ]
    }
  ]
}
```

| Field | Meaning |
|---|---|
| `t` | Interval start — either UTC (`…Z`) or naive **Europe/Helsinki** local time |
| `v` | Energy for the interval in **Wh** (the backend divides by 1000 → kWh) |
| `hourly_values_netted` | Consumption with own production netted off, when available |

> The array is named `hourly_values` regardless of the requested timestep.

### Raw 5-minute readings — the freshest data

```
GET /api/gen/meter_reading?customer_ids=<id>&gsrn=<gsrn>&day=YYYY-MM-DD
```

Returns a flat array, one entry per 5-minute slot of that Helsinki day:

```json
[
  { "dt": "2026-07-26T18:15:00", "a": 7089977, "a1": 5017299, "a2": 910120, "a3": 1162556,
    "a_": 0, "r": 504108, "quality": 0, "source": "ai",
    "gsrn": 643006966021228690, "serialnumber": 7359992942718148,
    "modified": "2026-07-26T18:15:56" }
]
```

Two things matter here:

1. **The values are cumulative meter registers in Wh, not per-interval energy.**
   `a` is total import across all phases (`a1`–`a3` per phase), `a_` is total
   export. The energy of a slot is the difference to the previous reading.
2. **`dt` is UTC despite carrying no zone suffix** — the opposite convention
   from `meter_reading_yh`, where a bare timestamp means Helsinki local time.
   Getting this wrong silently shifts everything by 2–3 hours.

This feed is only ~10–20 minutes behind real time, while the settled
`meter_reading_yh` series lag by days. The backend therefore exposes it as
`resolution=5min` on `/consumption`, differencing consecutive registers and
seeding from the previous day so the first slot of the day is complete. A
negative step (register rollover or meter reset) yields no value rather than a
bogus spike.

Differenced 5-minute values sum to exactly the same daily total as Elenia's own
15-minute and hourly series — verified on live data.

The untouched JSON is also available through the backend's `/meter-reading`
endpoint. History reaches back about 60 days.

---

## Spot Prices

Elenia serves Nord Pool prices from **unauthenticated** endpoints:

```
GET /api/gen/market_prices?year=2026            → hourly, whole year
GET /api/gen/market_prices_15min?day=2026-07-25 → 15 minutes, one day
```

```json
// market_prices — nested by month, then day
{ "7": { "25": [ { "t_utc": "2026-07-24T21:00:00Z", "v": 1.431 } ] } }

// market_prices_15min
[ { "startTime": "2026-07-24T21:00:00Z", "endTime": "2026-07-24T21:15:00Z", "value": 1.431 } ]
```

Values are **c/kWh including VAT** — verified against Elering's Nord Pool feed
(`11.4 €/MWh × 1.255 = 1.431 c/kWh`). The backend therefore derives the VAT-free
price by dividing:

| Period | VAT |
|---|---|
| before 2024-09-01 | 24 % |
| from 2024-09-01 | 25.5 % |

---

## Time Zone Handling

Elenia meters run on **Europe/Helsinki** (UTC+2 / UTC+3 DST). Requests are made
per Helsinki calendar day or year; timestamps that come back without a zone are
interpreted as Helsinki local time, and everything is normalised to UTC before
it reaches the frontend or InfluxDB.

---

## Credential Persistence

After a successful login the backend writes `credentials.json` in its working
directory:

```json
{
  "username": "user@example.com",
  "password": "secret",
  "selected_gsrn": "643006966035524955"
}
```

On startup it performs an automatic login if this file exists. The service token
expires in about three hours, so a background task re-logs in every 60 minutes,
and any request that hits an expired token triggers a one-off re-login and
retry.

> **Security note:** credentials are stored in plaintext. That is acceptable for
> a single-user local tool, but the file must not be committed — it is already
> in `.gitignore`.

---

## Backend REST API (exposed to the frontend)

Served on port **3000**.

### `POST /login`

```json
{ "username": "user@example.com", "password": "secret" }
```

`200 OK` on success, `401` with Elenia's error text otherwise.

### `GET /status`

```json
{ "logged_in": true }
```

### `GET /version`

```json
{ "version": "v1.2.3" }
```

### `GET /consumption`

| Parameter | Required | Description |
|---|---|---|
| `start` | ✅ | first Helsinki date (`YYYY-MM-DD`) |
| `stop` | ✅ | last Helsinki date, inclusive |
| `resolution` | ❌ | `5min`, `quarter`, `hour` (default), `day`, `month` |

| Resolution | Source | Freshness |
|---|---|---|
| `5min` | `meter_reading`, differenced | ~10–20 min |
| `quarter` | `meter_reading_yh` `PT15M` | 1–3 days |
| `hour` | `meter_reading_yh` `PT1H` | 1–3 days |
| `day`, `month` | aggregated from `hour` | 1–3 days |

```json
{
  "gsrn": "643006966035524955",
  "resolution": "quarter",
  "series": [
    {
      "start": "2026-07-24T21:00:00Z",
      "stop":  "2026-07-24T21:15:00Z",
      "electricity": 0.412,
      "electricity_netted": 0.380,
      "electricity_spot_prices": 1.14,
      "electricity_spot_prices_vat": 1.431
    }
  ]
}
```

`day` and `month` are aggregated by the backend from hourly values. Their spot
price is a **consumption-weighted** average, so `kWh × price` still equals the
true cost of the bucket.

Spot prices are attached per interval; `5min` intervals take the price of the
15-minute bucket they fall inside.

### `GET /meter-reading?day=YYYY-MM-DD`

Raw 5-minute registers for one day (defaults to today), passed through
unchanged.

### `GET /metering-points`

```json
{
  "metering_points": [ { "gsrn": "…", "customer_id": "…", "street_address": "…", "…": "…" } ],
  "selected_gsrn": "643006966035524955"
}
```

### `POST /metering-points/select`

```json
{ "gsrn": "643006966035524955" }
```

Persists the choice to `credentials.json`.

### InfluxDB endpoints

| Endpoint | Purpose |
|---|---|
| `GET  /influx/config` | current configuration |
| `POST /influx/config` | save configuration |
| `GET  /influx/status` | last/next sync and last error |
| `POST /influx/test` | validate URL, token, org and bucket |
| `POST /influx/sync` | sync yesterday + today immediately |

---

## Key Files

| File | Purpose |
|---|---|
| `backend/src/elenia_client.rs` | All Elenia API logic: login, metering points, consumption, prices |
| `backend/src/influx.rs` | InfluxDB configuration, connection test and line protocol |
| `backend/src/main.rs` | Axum HTTP server, route handlers, background tasks |
| `backend/credentials.json` | Saved credentials (gitignored) |
