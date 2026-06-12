# Argus

Argus is a self-hosted network security monitor. It discovers devices across three locations, ingests Firewalla flow logs, analyzes threats, and serves a live dashboard with alerts, a health-scored weekly report, and VLAN recommendations.

**Live:** [argus-pazlabs.web.app](https://argus-pazlabs.web.app) · **API:** `argus-api.pazlabs.io`

---

## Features

- **Multi-location device inventory** — MSP (Minneapolis), PHX (Phoenix), CBN (Cabin); stable UUID identities survive MAC rotation
- **Threat detection** — behavioral baselines, cleartext protocol detection, threat feed lookups, unusual-hours alerts
- **SSL/TLS scanning** — expired / expiring / self-signed / weak-cipher / cert-rotation detection
- **VLAN segmentation recommendations** — per-location with Firewalla rule suggestions
- **Network outage detection** — LAN, internet, and all-sites outages with auto-resolution
- **CVE matching** — device service signatures vs NVD data
- **Weekly security report** — health score (0–100 / A–F), inline-CSS HTML, ntfy delivery
- **Alert rules engine** — configurable triggers with ntfy cooldown dispatch

## Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 14 (static export), React 18, TypeScript, Tailwind CSS v3 |
| Fonts | Inter (UI), JetBrains Mono (code/IPs/ports) |
| Hosting | Firebase Hosting (`argus-pazlabs` project) |
| Backend API | FastAPI on Jetson Orin Nano at `argus-api.pazlabs.io` (see backend repo) |

## Pages

| Route | Description |
|---|---|
| `/` | Dashboard — outage banner, 5 stat cards (devices, new, threats, last scan, health score), bandwidth chart, DNS anomalies, device table |
| `/alerts` | Alerts — cleartext protocols, SSL/TLS issues, network outages, VLAN recommendations, active threats, CVEs |
| `/report` | Security report — health score grade, history sidebar, Generate Now, Download HTML, iframe report viewer |
| `/map` | Network map — force-directed topology per location |
| `/device?identity_id=` | Device detail — port history, uptime timeline, anomaly log |
| `/guests` | Guest/lifecycle summary |

## Getting Started

**Prerequisites:** Node.js 20+, Firebase CLI

```bash
cd frontend
cp .env.example .env.local    # set NEXT_PUBLIC_ARGUS_BASE_URL and API key
npm install
npm run dev                   # http://localhost:3000
```

## Environment Variables

| Variable | Description |
|---|---|
| `NEXT_PUBLIC_ARGUS_BASE_URL` | Argus backend base URL (`https://argus-api.pazlabs.io`) |
| `NEXT_PUBLIC_ARGUS_API_KEY` | `X-Argus-Key` header value |

## Build & Deploy

```bash
cd frontend
npm run build              # generates frontend/out/
cd ..
firebase deploy --only hosting
```

CI/CD: pushes to `main` deploy automatically via Firebase Hosting GitHub integration.

## API Surface (frontend → backend)

| Method | Path | Used by |
|---|---|---|
| GET | `/health` | Dashboard |
| GET | `/identities/` | Dashboard, Map |
| GET | `/flows/threats` | Dashboard, Alerts |
| GET | `/lifecycle/summary` | Dashboard |
| GET | `/network/bandwidth` | Dashboard |
| GET | `/network/dns/anomalies` | Dashboard |
| GET | `/reports/latest` | Dashboard, Report |
| GET | `/reports/history` | Report sidebar |
| POST | `/reports/generate` | Report page |
| GET | `/outages/current` | Dashboard banner |
| GET | `/outages/history` | Alerts |
| GET | `/ssl/issues` | Alerts |
| POST | `/ssl/scan` | Alerts |
| GET | `/vlan/recommendations` | Alerts |
| PATCH | `/vlan/recommendations/{id}` | Alerts |
| GET | `/cve/matches` | Alerts |
| GET | `/alerts/rules` | Alerts |
