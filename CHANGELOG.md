# Changelog

## [Unreleased]

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
