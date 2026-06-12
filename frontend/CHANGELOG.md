# Changelog

All notable changes to the Argus frontend are documented here.

---

## 2026-06-12

### Added
- **Light mode redesign** — complete visual overhaul from dark terminal theme to a clean light UI. All `a-*` Tailwind color tokens remapped: `bg #F8F9FC`, `surface #FFFFFF`, `border #E5E7EB`, `text #111827`, `muted #6B7280`, accent `#6366F1` (indigo). Card shadows, hover transitions, and rounded corners added throughout.
- **Inter + JetBrains Mono fonts** — Google Fonts import added to `globals.css`. Inter replaces JetBrains Mono as the body/UI font. JetBrains Mono retained for IP addresses, MAC addresses, and port numbers via `font-mono` class on individual fields.
- **Network Map page** (`/map`) — force-directed network graph per location with a geographic card overview. Click a location card to drill into a live node graph showing device topology, bandwidth sizing, and DNS anomaly flags. VPN tunnel lines connect site cards.
- **Device history chart** — 30-day line chart (Recharts) on the dashboard showing total and online device counts per location (MSP/PHX/CBN), colored by location accent.
- **Top bandwidth chart** — horizontal bar chart of top 10 devices by 24h bandwidth, colored by location.
- **DNS anomalies panel** — live table on dashboard showing flagged DNS queries with device, domain, reason, and query count.
- **Device type icons** — emoji icons (💻 📱 🔥 📡 📷 🔊 🎮 etc.) map to device types from Firewalla classification or OUI-based ML classifier on the device detail page header.
- **NEW badge** — indigo pill (`bg-indigo-50 text-indigo-600`) shown inline in the device name column for devices first seen within the last 5 days. Replaces the previously broken `status === 'NEW'` check.
- **`is_new` field** — `normalizeDevice()` reads the backend `is_new` boolean (5-day threshold) and falls back to a client-side `first_seen` computation for compatibility.
- **Online/offline dot** — pulsing green dot for online devices, grey for offline, in the IP column of the device table.
- **Per-location filter tabs** — pill-style filter bar (All / MSP / PHX / Cabin) persisted in `localStorage`. Replaces the previous dropdown.
- **Uptime timeline** (`/device`) — 7-day visual timeline bar showing online/offline segments with percentage, and a scrollable event log below.

### Changed
- **Navbar** — white background, 1px gray bottom border, shadow. All pages: Dashboard, Device Detail, Map, Report. Back links use indigo hover.
- **Summary cards** — white card with shadow, stat in large indigo/green text, small icon badge on the right.
- **Device table** — white card with rounded-xl corners. Location group headers with left border accent. Sortable column headers with directional arrows. New (5-day) checkbox label updated to **"New only (5 days)"**.
- **Firewalla card** (`/device`) — left accent border changed from orange to indigo. FW badge changed from orange to indigo.
- **FW bubble in device list** — removed from list rows (too noisy). Still shown on device detail page.
- **Device type pill** — removed from list rows. Still shown on device detail page.
- **"New This Week" summary card** — relabelled **"New (5 days)"** to match the actual filter threshold.
- **Report page** — print button restyled to indigo, font changed from mono to Inter.
- **Chart colors** — Recharts tooltip background `#fff`, grid lines `#F3F4F6` replacing dark values. VPN tunnel lines use `#22C55E` (online) / `#D1D5DB` (offline).
- **Location badge colours** — MSP: blue-50/blue-600, PHX: orange-50/orange-600, CBN: green-50/green-600.

### Fixed
- **"New only" filter was always empty** — the previous filter used `d.status === 'NEW'` but the `/devices/all` endpoint never returned a `status` field for devices. Now correctly uses `d.is_new` from the backend.

---

## [1.0.2] — 2026-06-07

### Changed
- Backend API base URL updated to `argus-api.pazlabs.io`

## [1.0.1] — 2026-06-06

### Changed
- Backend API base URL migrated to `api.pazlabs.io`

## [1.0.0] — 2026-06-05

### Added
- Initial release — dashboard, device detail, weekly report pages
- Dark terminal UI theme (JetBrains Mono, custom `a-*` Tailwind palette)
- API client `lib/argus.ts` with typed wrappers and `X-Argus-Key` auth
- Port risk classification (high/medium/safe/neutral)
- Device status badges, OS accuracy badge
- Firebase Hosting static export via `next export`
