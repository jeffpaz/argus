# Changelog

## [Unreleased]

### Changed
- Suggested always-on devices: clicking a row opens that device's detail page. The checkbox and ✕ still select and dismiss.

## [1.3.2] — 2026-11-17

### Added
- Dashboard availability card: click Always on / Online / Offline / Pending to open the matching devices in the card (offline first, with status, IP/MAC, type, last seen and last check source); rows link to the device page.
- Alerts → Incidents: "Mark all resolved" button with an optional note. Resolves every open + monitoring incident server-side (only monitoring on the Monitoring tab), not just the loaded page (needs argus-api `POST /incidents/resolve-all`).

## [1.3.1] — 2026-11-12

### Added
- Device table: Manufacturer column after MAC (MAC vendor; "Private (randomized)" for randomized MACs). PHX/CBN rows now show the MAC and vendor Firewalla reports (needs argus-api 0.5.1).

## [1.3.0] — 2026-11-12

### Added
- Always-on availability (needs argus-api 0.5.0):
  - Dashboard availability card: each site's firewall up/down (with poll-failure warning) and counts of always-on devices online/offline.
  - Device table: always-on toggle and Online / Offline since X / Unknown badge per row, checkbox column with a bulk "Mark always on" / "Remove always on" bar, and an "Always on" filter. Site firewalls show as "Firewall (auto)".
  - Dismissible "Suggested always-on devices" panel (routers, cameras, servers, IoT sensors) for bulk tagging. Nothing is tagged automatically.
  - Device page: always-on toggle and availability badge in the header.
  - Alerts page labels for the new alert types (site down/up, devices offline, reminders, poll failures, test).
- Device page: Network card with IP, MAC, MAC vendor (with lookup link) and a Private Address badge for randomized MACs.

## [1.2.1] — 2026-09-24

### Fixed
- Device page bandwidth chart relabeled "Rolling 24h Usage — Last 48h". The
  backend now returns Firewalla's rolling last-24h totals instead of differences
  between snapshots, which were meaningless. All bandwidth numbers shown in the
  UI were ~30x too high before argus-api 0.4.0 (backend fix, no frontend change needed).

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
