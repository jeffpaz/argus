# Argus — System Architecture

## Overview

Argus is a two-tier system: a static Next.js frontend hosted on Firebase, and a backend REST API that runs nmap scans, stores device state, and generates reports.

```
                ┌─────────────────────────────────┐
                │         Browser / User           │
                └───────────────┬─────────────────┘
                                │ HTTPS
                ┌───────────────▼─────────────────┐
                │      Firebase Hosting            │
                │  argus-pazlabs.web.app           │
                │  (Next.js static export)         │
                │                                  │
                │  /            → Dashboard        │
                │  /device?mac= → Device Detail    │
                │  /report      → Weekly Report    │
                └───────────────┬─────────────────┘
                                │ HTTPS + X-Argus-Key
                ┌───────────────▼─────────────────┐
                │      Argus Backend API           │
                │  argus-api.pazlabs.io            │
                │                                  │
                │  GET  /health                    │
                │  GET  /devices                   │
                │  GET  /devices/:mac              │
                │  GET  /devices/:mac/ports        │
                │  GET  /devices/:mac/anomalies    │
                │  GET  /anomalies                 │
                │  GET  /scans                     │
                │  POST /scans  (trigger)          │
                │  GET  /reports/weekly            │
                └───────────────┬─────────────────┘
                                │
                ┌───────────────▼─────────────────┐
                │      Network Scanner             │
                │  nmap / host discovery           │
                │  OS fingerprinting               │
                │  Port enumeration                │
                └───────────────┬─────────────────┘
                                │
                ┌───────────────▼─────────────────┐
                │      Device Database             │
                │  Device inventory                │
                │  Port scan history (diffs)       │
                │  Anomaly records                 │
                │  Scan run metadata               │
                └─────────────────────────────────┘
```

---

## Frontend

**Repo path:** `frontend/`  
**Framework:** Next.js 14 with `output: 'export'` (fully static — no server-side rendering)  
**Deployed to:** Firebase Hosting, `frontend/out/` as the hosting root

### Pages

#### Dashboard (`app/page.tsx`)

The main view. On load it fires three parallel requests (`getHealth`, `getDevices`, `getAnomalies`) and renders:

- **Summary cards** — active device count, new-this-week count, open anomaly count, last scan timestamp
- **Open anomalies** — top 5 unresolved anomalies with severity coloring
- **Device table** — sortable by IP / hostname / last seen / status; filterable by search string, OS, and new-only; paginated in pages of 25
- **Scan trigger** — `POST /scans` with live status feedback

Clicking a table row navigates to `/device?mac=<mac>`.

#### Device Detail (`app/device/page.tsx`)

Per-device deep-dive, loaded by MAC address from the query string:

- **Device header** — IP, MAC, vendor, OS + confidence badge, status badge, first/last seen, port and anomaly counts
- **Port history** — last 20 scan snapshots, each showing ports added (green) and removed (red)
- **Open ports grid** — color-coded by risk: high (red: FTP/Telnet/RDP/SMB), medium (amber: SSH/DBs/Redis), safe (green: HTTP/HTTPS), neutral (muted)
- **Anomaly log** — full history table for this device with type, description, severity, and resolved state

#### Weekly Report (`app/report/page.tsx`)

A printable security digest:

- Summary cards (active devices, new this week, open anomalies, recommendation count)
- New devices table — devices first seen in the current week
- Threat events — all anomalies from the period
- Recommendations — actionable security suggestions from the backend

Has CSS `@media print` overrides for clean PDF export via browser print.

### API Client (`lib/argus.ts`)

All backend calls go through two thin wrappers (`argusGet`, `argusPost`) that:

1. Prepend `NEXT_PUBLIC_ARGUS_BASE_URL` to the path
2. Attach `X-Argus-Key` header when an API key is set
3. Throw on non-2xx responses

Response shapes are fully typed via exported TypeScript interfaces (`Device`, `Anomaly`, `PortScanSnapshot`, `WeeklySummary`, etc.). Some endpoints return either a bare array or a wrapped object (`{ devices: [...] }`) — the client normalises both.

### Styling

- **Tailwind CSS v3** with a custom `a.*` color palette: `a-bg` (near-black), `a-surface` (dark navy), `a-teal` (primary accent), `a-red/amber/green` (severity colors)
- **Font:** JetBrains Mono — reinforces the terminal/security aesthetic
- All colors are defined in `tailwind.config.ts`; no inline style objects except for a few flex layout overrides

---

## Backend API

The backend is a separate service (not in this repo) reachable at `argus-api.pazlabs.io`. Based on the API surface it:

- Runs **nmap** scans on a schedule (and on demand via `POST /scans`)
- Maintains a **device inventory** keyed by MAC address — tracking IP, hostname, OS, vendor, and open ports
- Computes **port diffs** between scan runs, storing per-scan snapshots as `{ added, removed, ports }`
- Detects **anomalies** (e.g. new device on network, high-risk port opened, OS fingerprint changed) and grades them `low/medium/high`
- Generates a **weekly report** aggregating new devices, active anomalies, and recommendations
- Authenticates callers via `X-Argus-Key` header

---

## Deployment

### Firebase Hosting

```
argus/
├── firebase.json          # hosting config — public: frontend/out
├── .firebaserc            # project: argus-pazlabs
└── frontend/
    └── out/               # Next.js static export (generated by npm run build)
```

`firebase.json` rewrites `/device/**` → `/device.html` so that the MAC query parameter works correctly after a hard refresh (Firebase otherwise serves a 404 on unknown paths).

### Build

```bash
cd frontend
npm run build    # next build → writes to frontend/out/
cd ..
firebase deploy --only hosting
```

### URL

| Environment | URL |
|---|---|
| Production | `https://argus-pazlabs.web.app` |
| API | `https://argus-api.pazlabs.io` |

---

## Data Flow — Dashboard Load

```
Browser                 Firebase Hosting         Argus API
  │                           │                      │
  │── GET /  ────────────────▶│                      │
  │◀── HTML + JS ────────────│                      │
  │                           │                      │
  │── GET /health ───────────────────────────────▶  │
  │── GET /devices ──────────────────────────────▶  │
  │── GET /anomalies ────────────────────────────▶  │
  │                           │                      │
  │◀── HealthStatus ────────────────────────────────│
  │◀── Device[] ────────────────────────────────────│
  │◀── Anomaly[] ───────────────────────────────────│
  │                           │                      │
  │ [render summary cards, anomaly banner,            │
  │  device table with sort/filter/pagination]       │
```

All three API calls are fired in parallel via `Promise.allSettled` — a failure in one does not block the others from rendering.
