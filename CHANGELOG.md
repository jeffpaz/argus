# Changelog

## [Unreleased]

## [1.2.0] — 2026-06-12

### Added
- Alerts page: Cleartext Protocol Usage table, SSL/TLS Issues table with Run SSL Scan, Network Outages (30-day history), VLAN Recommendations with Implement/Dismiss actions
- Report page: full rewrite — health score grade badge, history sidebar, Generate Now, Download HTML, iframe report viewer
- Dashboard: Health Score 5th stat card (A–F), active outage banner, open outages included in Active Threats count

## [1.1.0] — 2026-06-12

### Added
- Light mode redesign — new color palette, card shadows, Inter font
- Network Map page (`/map`) — force-directed graph per location
- Dashboard device history and top-bandwidth charts (Recharts)
- DNS anomalies panel on dashboard
- Device type icons, NEW badge, online/offline dot, per-location filter tabs
- Uptime timeline on device detail page

### Fixed
- "New only" filter now uses backend `is_new` field instead of broken `status === 'NEW'` check

## [1.0.2] — 2026-06-07

### Changed
- Backend API base URL updated to `argus-api.pazlabs.io` (dedicated subdomain for Argus)

## [1.0.1] — 2026-06-06

### Changed
- Backend API base URL migrated from legacy endpoint to `api.pazlabs.io` (Option A domain split)

## [1.0.0] — 2026-06-05

### Added
- Initial release — Argus frontend + Firebase Hosting deployment
- Dashboard page: summary cards (active devices, new this week, open anomalies, last scan), device table with sort/filter/pagination, manual scan trigger
- Device detail page: device header with OS confidence badge, open port grid with risk coloring, port history timeline, anomaly log
- Weekly report page: printable/PDF-exportable security report with new devices, threat events, and recommendations
- API client (`lib/argus.ts`): typed wrappers for all backend endpoints with `X-Argus-Key` auth header
- Dark terminal UI theme: JetBrains Mono, custom Tailwind color palette (`a-bg`, `a-teal`, `a-red`, etc.)
- Port risk classification: high-risk (FTP/Telnet/RDP/SMB), medium-risk (SSH/DB/Redis), safe (HTTP/HTTPS), neutral
- Device status badges: `NEW` (teal), `CHANGED` (amber), `OK` (muted)
- OS accuracy confidence badge on device detail
- Firebase Hosting config with clean URLs and `/device/**` rewrite for query-param routing
