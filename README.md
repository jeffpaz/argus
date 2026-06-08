# 🛡️ Argus

Argus is a local network monitoring dashboard. It discovers every device on your network, tracks open ports over time, detects anomalies, and generates weekly security reports.

**Live:** [argus-pazlabs.web.app](https://argus-pazlabs.web.app) · **API:** `argus-api.pazlabs.io`

---

## Features

- **Device inventory** — discovers hosts by IP, MAC, hostname, vendor, and OS (with confidence %)
- **Status tracking** — flags devices as `NEW`, `CHANGED`, or `OK` across scans
- **Port history** — per-device timeline showing ports added or removed each scan
- **Anomaly detection** — severity-graded alerts (`high`, `medium`, `low`) with open/resolved state
- **Weekly report** — printable/PDF security summary with new devices, threat events, and recommendations
- **Manual scan trigger** — kick off a network scan on demand from the dashboard
- **Filtering & search** — search by IP / hostname / MAC, filter by OS, show new-only, paginate

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (static export), React 18, TypeScript |
| Styling | Tailwind CSS v3, JetBrains Mono, dark terminal theme |
| Hosting | Firebase Hosting (`argus-pazlabs` project) |
| Backend API | REST service at `argus-api.pazlabs.io` (separate repo) |

## Pages

| Route | Description |
|---|---|
| `/` | Main dashboard — summary cards, anomaly alerts, device table |
| `/device?mac=<mac>` | Device detail — port grid, port history timeline, anomaly log |
| `/report` | Weekly security report — printable, PDF-exportable |

## Getting Started

**Prerequisites:** Node.js 20+, Firebase CLI

```bash
cd frontend
cp .env.example .env.local    # set NEXT_PUBLIC_ARGUS_BASE_URL and API key
npm install
npm run dev                   # http://localhost:3000
```

## Environment Variables

| Variable | Description | Default |
|---|---|---|
| `NEXT_PUBLIC_ARGUS_BASE_URL` | Argus backend API base URL | `https://argus-api.pazlabs.io` |
| `NEXT_PUBLIC_ARGUS_API_KEY` | API key sent as `X-Argus-Key` header | _(empty)_ |

## Build & Deploy

```bash
cd frontend
npm run build               # generates frontend/out/

cd ..
firebase deploy --only hosting
```

CI/CD: pushes to `main` deploy automatically via Firebase Hosting GitHub integration.

## API Surface

The frontend calls these endpoints on the backend API:

| Method | Path | Description |
|---|---|---|
| `GET` | `/health` | System health, device count, last scan metadata |
| `GET` | `/devices` | All known devices |
| `GET` | `/devices/:mac` | Single device detail including port service info |
| `GET` | `/devices/:mac/ports` | Port scan history (diffs per scan) |
| `GET` | `/devices/:mac/anomalies` | Anomalies for a specific device |
| `GET` | `/anomalies` | All anomalies across all devices |
| `GET` | `/scans` | List of completed scan runs |
| `POST` | `/scans` | Trigger a new network scan |
| `GET` | `/reports/weekly` | Weekly security summary |
