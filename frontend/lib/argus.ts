const BASE = process.env.NEXT_PUBLIC_ARGUS_BASE_URL ?? 'https://argus.pazlabs.io'
const KEY  = process.env.NEXT_PUBLIC_ARGUS_API_KEY  ?? ''

async function argusGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: {
      'Content-Type': 'application/json',
      ...(KEY ? { 'X-Argus-Key': KEY } : {}),
    },
  })
  if (!res.ok) throw new Error(`Argus ${path} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

async function argusPost<T>(path: string, body?: unknown, method: string = 'POST'): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(KEY ? { 'X-Argus-Key': KEY } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Argus ${method} ${path} → HTTP ${res.status}`)
  return res.json() as Promise<T>
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type DeviceStatus = 'NEW' | 'CHANGED' | 'OK'

export interface Device {
  id:              string
  ip:              string
  hostname:        string
  mac:             string
  os:              string
  os_accuracy?:    number
  vendor?:         string
  open_ports:      number[]
  first_seen?:     string
  last_seen:       string
  status:          DeviceStatus
  location:        string
  subnet:          string
  firewalla_name:  string | null
  manufacturer:    string | null
  device_type:     string | null
  firewalla_group: string | null
  // extended fields from /devices/all and /network/map
  is_online?:      boolean
  downtime_since?: string | null
  bytes_in_24h?:   number
  bytes_out_24h?:  number
  flagged_dns?:    boolean
  friendly_name?:  string
  is_new?:         boolean
  mac_randomized?: boolean
}

export interface LocationStats {
  name:           string
  label:          string
  active_devices: number
  new_devices:    number
  open_anomalies: number
}

export interface HealthStatus {
  status:       'ok' | 'error'
  device_count: number
  last_scan:    ScanRun | null
}

export interface ScanRun {
  id:           string
  started_at:   string
  finished_at:  string
  duration_s:   number
  device_count: number
}

export interface Anomaly {
  id:          string
  device_id:   string
  type:        string
  description: string
  severity:    'low' | 'medium' | 'high'
  resolved:    boolean
  created_at:  string
  resolved_at: string | null
}

export interface PortInfo {
  port:     number
  service?: string
  version?: string
}

export interface PortScanSnapshot {
  scan_id:    string
  scanned_at: string
  ports:      number[]
  added:      number[]
  removed:    number[]
}

export interface DeviceDetail extends Device {
  open_port_details?: PortInfo[]
}

export interface WeeklySummary {
  generated_at:    string
  period:          { start: string; end: string }
  active_devices:  number
  new_devices:     Array<{ ip: string; mac: string; hostname: string; first_seen: string }>
  open_anomalies:  number
  anomalies:       Anomaly[]
  recommendations: Array<{ id: string; title: string; description: string; icon?: string }>
  by_location?:    LocationStats[]
}

export interface UptimeEvent {
  id:        number
  mac:       string
  location:  string
  event:     'online' | 'offline'
  timestamp: string
}

export interface UptimeDetail {
  mac:           string
  first_seen:    string
  last_seen:     string
  is_online:     boolean
  downtime_since: string | null
  uptime_events: UptimeEvent[]
}

export interface CountHistoryPoint {
  id:           number
  timestamp:    string
  location:     string
  device_count: number
  online_count: number
}

export interface BandwidthPoint {
  timestamp: string
  bytes_in:  number
  bytes_out: number
}

export interface TopBandwidthDevice {
  mac:          string
  location:     string
  friendly_name: string | null
  device_name:  string
  total_in:     number
  total_out:    number
  total_bytes:  number
}

export interface DnsAnomaly {
  id:          number
  mac:         string
  location:    string
  timestamp:   string
  domain:      string
  query_count: number
  flagged:     number
  flag_reason: string | null
  device_name: string
}

export interface DeviceBandwidthPoint {
  timestamp: string
  bytes_in:  number
  bytes_out: number
}

export interface Threat {
  id:            number
  threat_type:   string
  severity:      'low' | 'medium' | 'high' | 'critical'
  identity_id:   string | null
  device_name:   string
  location:      string
  src_ip:        string | null
  dst_ip:        string | null
  dst_port:      number | null
  detail:        string
  timestamp:     string
  resolved:      boolean
  resolved_at:   string | null
  resolved_note: string | null
}

export interface MacObservation {
  mac:        string
  ip:         string | null
  is_current: number
  first_seen: string
  last_seen:  string | null
}

export interface DeviceIdentity extends Device {
  identity_id:               string
  display_name:              string
  canonical_hostname:        string | null
  canonical_friendly_name:   string | null
  current_mac:               string | null
  all_macs:                  string[]
  confidence:                number
  lifecycle_state?:          LifecycleState
  is_guest?:                 boolean
  lifecycle_updated_at?:     string | null
  first_seen?:               string
}

export interface MapDevice {
  mac:          string
  ip:           string
  hostname:     string
  friendly_name: string
  device_type:  string
  is_online:    boolean
  last_seen:    string | null
  bytes_in_24h: number
  bytes_out_24h: number
  flagged_dns:  boolean
  open_ports:   number[]
}

export interface MapLocation {
  name:         string
  label:        string
  subnet:       string
  online_count: number
  total_count:  number
  devices:      MapDevice[]
}

export interface NetworkMap {
  locations: MapLocation[]
}

// Raw backend shapes
interface RawDevice {
  ip: string; mac: string; hostname: string | null; vendor: string | null
  os_guess: string | null; open_ports: number[]; first_seen: string; last_seen: string
  is_known: boolean; label: string | null; status?: string; id?: string | number
  location?: string; subnet?: string
  firewalla_name?: string | null; manufacturer?: string | null
  device_type?: string | null; firewalla_group?: string | null
  is_online?: number | boolean; downtime_since?: string | null
  bytes_in_24h?: number; bytes_out_24h?: number; flagged_dns?: boolean
  friendly_name?: string; is_new?: boolean
}
interface RawPortSnapshot {
  id: number; device_ip: string; scan_run_id: number; timestamp: string; open_ports: number[]
  scan_id?: string; scanned_at?: string; ports?: number[]; added?: number[]; removed?: number[]
}
interface RawWeeklyReport {
  period_start?: string; period_end?: string
  active_devices?: number; total_devices?: number
  new_devices?: RawDevice[]
  anomalies?: Anomaly[]
  recommendations?: WeeklySummary['recommendations']
  [key: string]: unknown
}


export interface AlertRule {
  id:                  number
  name:                string
  description:         string | null
  enabled:             boolean
  trigger_type:        string
  filter_location:     string | null
  filter_identity_id:  string | null
  filter_severity:     string | null
  filter_threat_type:  string | null
  filter_device_type:  string | null
  threshold_bytes:     number | null
  active_hours_start:  number | null
  active_hours_end:    number | null
  ntfy_server:         string
  ntfy_topic:          string
  ntfy_priority:       string
  ntfy_tags:           string | null
  cooldown_minutes:    number
  created_at:          string
  updated_at:          string
}

export interface AlertHistoryEntry {
  id:           number
  rule_id:      number
  rule_name:    string
  identity_id:  string | null
  device_name:  string | null
  location:     string | null
  trigger_type: string
  detail:       string | null
  ntfy_topic:   string
  ntfy_status:  number
  fired_at:     string
}

// ─── API functions ────────────────────────────────────────────────────────────

export const getHealth    = () => argusGet<HealthStatus>('/health')
export const getScanRuns  = () => argusGet<ScanRun[]>('/scans')
export const getAnomalies = () => argusGet<Anomaly[] | { anomalies: Anomaly[] }>('/anomalies')
export const triggerScan  = () => argusPost<{ message: string; scan_id: string }>('/scans')

export async function getWeeklyReport(): Promise<WeeklySummary> {
  const raw = await argusGet<RawWeeklyReport>('/reports/weekly')
  const anomalies = raw.anomalies ?? []
  return {
    generated_at:    raw.period_end ?? new Date().toISOString(),
    period:          { start: raw.period_start ?? '', end: raw.period_end ?? '' },
    active_devices:  raw.active_devices ?? raw.total_devices ?? 0,
    new_devices:     (raw.new_devices ?? []).map(d => ({
      ip:         d.ip,
      mac:        d.mac,
      hostname:   d.hostname ?? '',
      first_seen: d.first_seen,
    })),
    open_anomalies:  anomalies.filter(a => !a.resolved).length,
    anomalies,
    recommendations: raw.recommendations ?? [],
  }
}

export async function getDevices(location?: string): Promise<Device[]> {
  const qs = location ? `?location=${encodeURIComponent(location)}` : ''
  const data = await argusGet<RawDevice[] | { devices: RawDevice[] }>(`/devices${qs}`)
  const raw = Array.isArray(data) ? data : data.devices
  return raw.map(normalizeDevice)
}

export async function getAllDevices(location?: string, includeOffline = true): Promise<Device[]> {
  const params = new URLSearchParams()
  if (location) params.set('location', location)
  params.set('include_offline', String(includeOffline))
  const data = await argusGet<RawDevice[]>(`/devices/all?${params}`)
  return data.map(normalizeDevice)
}

export async function getDeviceDetail(mac: string): Promise<DeviceDetail> {
  const raw = await argusGet<RawDevice>(`/devices/${encodeURIComponent(mac)}`)
  return normalizeDevice(raw)
}

export async function getDevicePortHistory(mac: string): Promise<PortScanSnapshot[]> {
  const data = await argusGet<RawPortSnapshot[] | { history: PortScanSnapshot[] }>(
    `/devices/${encodeURIComponent(mac)}/ports`
  )
  if (!Array.isArray(data)) return data.history ?? []

  if (data.length > 0 && 'scan_id' in data[0] && 'added' in data[0]) {
    return data as unknown as PortScanSnapshot[]
  }

  const sorted = [...data].sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return sorted.map((snap, i) => {
    const prevPorts = i > 0 ? sorted[i - 1].open_ports : snap.open_ports
    const currPorts = snap.open_ports ?? []
    return {
      scan_id:    String(snap.scan_run_id),
      scanned_at: snap.timestamp,
      ports:      currPorts,
      added:      i > 0 ? currPorts.filter(p => !prevPorts.includes(p)) : [],
      removed:    i > 0 ? prevPorts.filter(p => !currPorts.includes(p)) : [],
    }
  })
}

export async function getDeviceAnomalies(mac: string): Promise<Anomaly[]> {
  const data = await argusGet<Anomaly[] | { anomalies: Anomaly[] }>(
    `/devices/${encodeURIComponent(mac)}/anomalies`
  )
  return Array.isArray(data) ? data : (data.anomalies ?? [])
}

export async function getDeviceUptime(mac: string): Promise<UptimeDetail> {
  return argusGet<UptimeDetail>(`/devices/${encodeURIComponent(mac)}/uptime`)
}

export async function getCountHistory(days = 30): Promise<CountHistoryPoint[]> {
  const data = await argusGet<{ days: number; history: CountHistoryPoint[] }>(
    `/devices/count-history?days=${days}`
  )
  return data.history
}

export async function getNetworkMap(): Promise<NetworkMap> {
  return argusGet<NetworkMap>('/network/map')
}

export async function getBandwidthSummary(location?: string): Promise<TopBandwidthDevice[]> {
  const qs = location ? `?location=${encodeURIComponent(location)}` : ''
  const data = await argusGet<{ hours: number; top_devices: TopBandwidthDevice[] }>(
    `/network/bandwidth/summary${qs}`
  )
  return data.top_devices
}

export async function getDnsAnomalies(flagged = true, limit = 20): Promise<DnsAnomaly[]> {
  const data = await argusGet<{ count: number; anomalies: DnsAnomaly[] }>(
    `/network/dns/anomalies?flagged=${flagged}&limit=${limit}`
  )
  return data.anomalies
}

export async function getDeviceDnsAnomalies(mac: string, limit = 20): Promise<DnsAnomaly[]> {
  const data = await argusGet<{ count: number; anomalies: DnsAnomaly[] }>(
    `/network/dns/anomalies?mac=${encodeURIComponent(mac)}&limit=${limit}`
  )
  return data.anomalies
}

export async function getDeviceBandwidthHistory(mac: string, hours = 48): Promise<DeviceBandwidthPoint[]> {
  const data = await argusGet<{ mac: string; hours: number; history: DeviceBandwidthPoint[] }>(
    `/network/bandwidth/device?mac=${encodeURIComponent(mac)}&hours=${hours}`
  )
  return data.history
}

export async function getIdentities(location?: string, includeOffline = true): Promise<DeviceIdentity[]> {
  const params = new URLSearchParams()
  if (location) params.set('location', location)
  params.set('include_offline', String(includeOffline))
  const data = await argusGet<Record<string, unknown>[]>(`/identities/?${params}`)
  return data.map(normalizeIdentity)
}

export async function getIdentityDetail(identityId: string): Promise<DeviceIdentity & { mac_history: MacObservation[] }> {
  const data = await argusGet<Record<string, unknown>>(`/identities/${encodeURIComponent(identityId)}`)
  return {
    ...normalizeIdentity(data),
    mac_history: (data.mac_history as MacObservation[]) ?? [],
  }
}

export async function getIdentityBandwidth(identityId: string, hours = 48): Promise<DeviceBandwidthPoint[]> {
  const data = await argusGet<{ identity_id: string; hours: number; history: DeviceBandwidthPoint[] }>(
    `/identities/${encodeURIComponent(identityId)}/bandwidth?hours=${hours}`
  )
  return data.history
}

export async function getIdentityUptime(identityId: string): Promise<UptimeDetail> {
  const data = await argusGet<{
    identity_id: string; is_online: boolean; last_seen: string | null
    uptime_events: Array<{ id: number; event: string; mac: string | null; timestamp: string }>
  }>(`/identities/${encodeURIComponent(identityId)}/uptime`)
  return {
    mac:           identityId,
    first_seen:    data.last_seen ?? '',
    last_seen:     data.last_seen ?? '',
    is_online:     data.is_online,
    downtime_since: null,
    uptime_events: data.uptime_events.map(e => ({
      id:        e.id,
      mac:       e.mac ?? identityId,
      location:  '',
      event:     e.event as 'online' | 'offline',
      timestamp: e.timestamp,
    })),
  }
}

export async function getThreats(resolved?: boolean, limit = 50): Promise<Threat[]> {
  const params = new URLSearchParams()
  if (resolved !== undefined) params.set('resolved', String(resolved))
  params.set('limit', String(limit))
  return argusGet<Threat[]>(`/flows/threats?${params}`)
}

export async function resolveThreat(id: number, note = ''): Promise<void> {
  await argusPost<unknown>(`/flows/threats/${id}/resolve`, { note })
}

export const getAlertRules     = () => argusGet<AlertRule[]>('/alerts/rules')
export const getAlertHistory   = (limit = 50) => argusGet<AlertHistoryEntry[]>(`/alerts/history?limit=${limit}`)
export const createAlertRule   = (body: Partial<AlertRule>) => argusPost<AlertRule>('/alerts/rules', body)
export const updateAlertRule   = (id: number, body: Partial<AlertRule>) =>
  argusPost<AlertRule>(`/alerts/rules/${id}`, body, 'PATCH')
export const deleteAlertRule   = (id: number) => argusPost<{ status: string }>(`/alerts/rules/${id}`, undefined, 'DELETE')
export const testAlertRule     = (id: number) => argusPost<{ status: string; ntfy_status: number }>(`/alerts/test/${id}`)
export const evaluateRules     = () => argusPost<{ alerts_fired: number }>('/alerts/evaluate')

// ─── Lifecycle types ─────────────────────────────────────────────────────────

export type LifecycleState = 'active' | 'idle' | 'stale' | 'gone' | 'guest'

export interface LifecycleSummary {
  active: number
  idle: number
  stale: number
  gone: number
  guest: number
  total_guest_devices: number
  newly_classified_today: number
}

export interface GuestDevice {
  identity_id: string
  display_name: string
  location: string
  device_type: string
  manufacturer: string | null
  first_seen: string
  last_seen: string
  guest_since: string | null
  lifecycle_state: LifecycleState
  is_online: boolean
  total_visits: number
  longest_visit_minutes: number
  last_visit_arrived: string | null
}

export interface GuestVisit {
  id: number
  identity_id: string
  device_name: string
  device_type: string | null
  location: string
  arrived_at: string
  departed_at: string | null
  duration_minutes: number
}

export interface LifecycleEvent {
  id: number
  identity_id: string
  event: string
  previous_state: string | null
  new_state: string | null
  detail: string | null
  timestamp: string
}

// ─── CVE types ────────────────────────────────────────────────────────────────

export interface CveSummary {
  total_unresolved: number
  critical: number
  high: number
  medium: number
  low: number
  most_vulnerable_device: string | null
  oldest_cve: string | null
}

export interface CveMatch {
  id: number
  identity_id: string
  device_name: string
  location: string
  cve_id: string
  cvss_score: number
  severity: 'critical' | 'high' | 'medium' | 'low'
  service: string | null
  port: number | null
  description: string | null
  published_date: string | null
  reference_url: string | null
  first_detected: string
  resolved: boolean
  resolved_note: string | null
}

// ─── Comms graph types ────────────────────────────────────────────────────────

export interface GraphNode {
  id: string
  label: string
  device_type: string
  location: string
  is_online: boolean
  bytes_24h: number
  has_threats: boolean
  threat_severity: string | null
  has_cves: boolean
  cve_severity: string | null
  lifecycle_state: LifecycleState
  is_guest: boolean
  ip: string | null
  last_seen: string | null
}

export interface GraphEdge {
  source: string
  target: string
  total_bytes: number
  connection_count: number
  ports_used: number[]
  last_seen: string | null
}

export interface CommGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  location: string | null
  generated_at: string
}

export interface LocationCard {
  location: string
  label: string
  total_devices: number
  online_devices: number
  offline_devices: number
  online_pct: number
  threat_count: number
  cve_count: number
  top_devices: Array<{ display_name: string; device_type: string | null; is_online: boolean; ip: string }>
}

// ─── Lifecycle API ────────────────────────────────────────────────────────────

export const getLifecycleSummary = () => argusGet<LifecycleSummary>('/lifecycle/summary')
export const getGuestDevices = (location?: string) =>
  argusGet<{ guests: GuestDevice[]; total: number }>(
    `/lifecycle/guests${location ? `?location=${encodeURIComponent(location)}` : ''}`
  )
export const getGuestVisits = (location?: string, limit = 20) =>
  argusGet<GuestVisit[]>(
    `/lifecycle/guest-visits?limit=${limit}${location ? `&location=${encodeURIComponent(location)}` : ''}`
  )
export const getLifecycleEvents = (identityId?: string, limit = 20) =>
  argusGet<LifecycleEvent[]>(
    `/lifecycle/events?limit=${limit}${identityId ? `&identity_id=${encodeURIComponent(identityId)}` : ''}`
  )

// ─── CVE API ─────────────────────────────────────────────────────────────────

export const getCveSummary    = () => argusGet<CveSummary>('/cve/summary')
export const getCveMatches    = (params?: { severity?: string; resolved?: boolean; identity_id?: string; limit?: number }) => {
  const qs = new URLSearchParams()
  if (params?.severity) qs.set('severity', params.severity)
  if (params?.resolved !== undefined) qs.set('resolved', String(params.resolved))
  if (params?.identity_id) qs.set('identity_id', params.identity_id)
  if (params?.limit) qs.set('limit', String(params.limit))
  return argusGet<CveMatch[]>(`/cve/matches?${qs}`)
}
export const getDeviceCves    = (identityId: string) => argusGet<CveMatch[]>(`/cve/matches/${encodeURIComponent(identityId)}`)
export const resolveCve       = (id: number, note?: string) => argusPost<{ status: string }>(`/cve/matches/${id}/resolve`, { note })
export const triggerCveScan   = () => argusPost<{ scanned: number; new_cves: number }>('/cve/scan')

// ─── Comms graph API ──────────────────────────────────────────────────────────

export const getCommGraph     = (location?: string) =>
  argusGet<CommGraph>(`/flows/comms/graph${location ? `?location=${encodeURIComponent(location)}` : ''}`)
export const getLocationCards = () => argusGet<LocationCard[]>('/flows/comms/locations')

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDevice(d: RawDevice): Device {
  const raw = d as unknown as Record<string, unknown>
  return {
    id:              String(d.id ?? d.mac),
    ip:              d.ip,
    mac:             d.mac,
    hostname:        d.hostname ?? '',
    os:              d.os_guess ?? raw.os as string ?? '',
    os_accuracy:     raw.os_accuracy as number | undefined,
    vendor:          d.vendor ?? undefined,
    open_ports:      d.open_ports ?? [],
    first_seen:      d.first_seen,
    last_seen:       d.last_seen,
    status:              ((d.status as DeviceStatus) ?? 'OK'),
    location:            (raw.location as string) ?? '',
    subnet:              (raw.subnet as string) ?? '',
    firewalla_name:      d.firewalla_name ?? null,
    manufacturer:        d.manufacturer ?? null,
    device_type:         d.device_type ?? null,
    firewalla_group:     d.firewalla_group ?? null,
    is_online:           d.is_online != null ? Boolean(d.is_online) : undefined,
    downtime_since:      d.downtime_since ?? null,
    bytes_in_24h:        d.bytes_in_24h ?? 0,
    bytes_out_24h:       d.bytes_out_24h ?? 0,
    flagged_dns:         d.flagged_dns ?? false,
    friendly_name:       d.friendly_name ?? d.firewalla_name ?? d.hostname ?? d.ip,
    is_new:              (raw.is_new as boolean | undefined) ?? (() => {
      const t = new Date(d.first_seen).getTime()
      return !isNaN(t) && t >= Date.now() - 5 * 24 * 60 * 60 * 1000
    })(),
  }
}

function normalizeIdentity(d: Record<string, unknown>): DeviceIdentity {
  const asDevice = normalizeDevice({
    ip:             String(d.ip ?? ''),
    mac:            String(d.current_mac ?? d.mac ?? ''),
    hostname:       String(d.canonical_hostname ?? d.display_name ?? ''),
    vendor:         null,
    os_guess:       (d.os as string) ?? null,
    open_ports:     (d.open_ports as number[]) ?? [],
    first_seen:     String(d.first_seen ?? ''),
    last_seen:      String(d.last_seen ?? ''),
    is_known:       false,
    label:          null,
    status:         (d.status as string) ?? 'OK',
    location:       (d.location as string) ?? '',
    subnet:         '',
    firewalla_name: (d.canonical_friendly_name as string) ?? null,
    manufacturer:   (d.manufacturer as string) ?? null,
    device_type:    (d.device_type as string) ?? null,
    firewalla_group: null,
    is_online:      Boolean(d.is_online),
    downtime_since:  (d.downtime_since as string) ?? null,
    bytes_in_24h:    Number(d.bytes_in_24h ?? 0),
    bytes_out_24h:   Number(d.bytes_out_24h ?? 0),
    flagged_dns:     Boolean(d.flagged_dns),
    friendly_name:   String(d.display_name ?? d.canonical_friendly_name ?? ''),
    is_new:          Boolean(d.is_new),
  })
  return {
    ...asDevice,
    mac_randomized:            Boolean(d.mac_randomized),
    identity_id:               String(d.identity_id ?? d.id ?? ''),
    display_name:              String(d.display_name ?? ''),
    canonical_hostname:        (d.canonical_hostname as string) ?? null,
    canonical_friendly_name:   (d.canonical_friendly_name as string) ?? null,
    current_mac:               (d.current_mac as string) ?? null,
    all_macs:                  (d.all_macs as string[]) ?? [],
    confidence:                Number(d.confidence ?? 0),
    lifecycle_state:           (d.lifecycle_state as LifecycleState) ?? undefined,
    lifecycle_updated_at:      (d.lifecycle_updated_at as string) ?? null,
    is_guest:                  Boolean(d.is_guest),
  }
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  })
}

export function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} KB`
  if (bytes < 1024 ** 3) return `${(bytes / 1024 ** 2).toFixed(1)} MB`
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`
}

export function timeAgo(iso: string | null | undefined): string {
  if (!iso) return '—'
  const diffMs = Date.now() - new Date(iso).getTime()
  if (diffMs < 0) return 'just now'
  const diffMin = Math.floor(diffMs / 60_000)
  if (diffMin < 2) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffH = Math.floor(diffMin / 60)
  if (diffH < 24) return `${diffH}h ago`
  const diffD = Math.floor(diffH / 24)
  return `${diffD}d ago`
}

// ── Sessions 6-9 types ────────────────────────────────────────────────────────

export interface OutageEvent {
  id:                    number
  location:              string | null
  outage_type:           'lan' | 'internet' | 'all_sites' | 'device'
  started_at:            string
  resolved_at:           string | null
  duration_minutes:      number | null
  affected_device_count: number | null
  detail:                string | null
}

export interface VlanRecommendation {
  id:                  number
  location:            string
  recommendation:      string
  rationale:           string
  device_types:        string[]
  affected_identities: string[]
  firewalla_rule:      string
  priority:            'high' | 'medium' | 'low'
  status:              'open' | 'implemented' | 'dismissed'
  created_at:          string
  updated_at:          string
}

export interface SslIssue {
  id:           number
  threat_type:  string
  severity:     string
  src_ip:       string | null
  dst_port:     number | null
  detail:       string
  timestamp:    string
  display_name: string | null
  location:     string | null
  identity_id:  string | null
}

export interface EnhancedReportSummary {
  week:                 string
  health_score:         number
  health_grade:         'A' | 'B' | 'C' | 'D' | 'F'
  health_deductions:    string[]
  health_bonuses:       string[]
  new_devices:          number
  total_threats:        number
  unresolved_threats:   number
  critical_cves:        number
  guest_visits:         number
  vlan_recommendations: number
  outages:              number
}

export interface EnhancedReport {
  report_date:  string
  html_content: string
  summary:      EnhancedReportSummary
  generated_at: string
  delivered:    boolean
}

export interface ReportHistoryEntry {
  report_date:   string
  generated_at:  string
  delivered:     boolean
  health_score:  number | null
  health_grade:  string | null
  week:          string | null
}

// ── Sessions 6-9 API functions ────────────────────────────────────────────────

export async function getOpenOutages(): Promise<OutageEvent[]> {
  return argusGet<OutageEvent[]>('/outages/current')
}

export async function getOutageHistory(days = 30): Promise<OutageEvent[]> {
  return argusGet<OutageEvent[]>(`/outages/history?days=${days}`)
}

export async function getVlanRecommendations(location?: string, status = 'open'): Promise<VlanRecommendation[]> {
  const params = new URLSearchParams({ status })
  if (location) params.set('location', location)
  return argusGet<VlanRecommendation[]>(`/vlan/recommendations?${params}`)
}

export async function updateVlanRecommendation(id: number, status: 'implemented' | 'dismissed' | 'open'): Promise<void> {
  await argusPost<void>(`/vlan/recommendations/${id}`, { status }, 'PATCH')
}

export async function runVlanAnalysis(): Promise<{ new_recommendations: number }> {
  return argusPost<{ new_recommendations: number }>('/vlan/analyze')
}

export async function getSslIssues(): Promise<SslIssue[]> {
  return argusGet<SslIssue[]>('/ssl/issues')
}

export async function triggerSslScan(): Promise<{ scanned: number; threats_found: number }> {
  return argusPost<{ scanned: number; threats_found: number }>('/ssl/scan')
}

export async function getLatestReport(): Promise<EnhancedReport | null> {
  try {
    return await argusGet<EnhancedReport>('/reports/latest')
  } catch {
    return null
  }
}

export async function listReports(limit = 20): Promise<ReportHistoryEntry[]> {
  return argusGet<ReportHistoryEntry[]>(`/reports/history?limit=${limit}`)
}

export async function generateReport(): Promise<{ status: string; report_date: string; summary: EnhancedReportSummary }> {
  return argusPost('/reports/generate')
}
