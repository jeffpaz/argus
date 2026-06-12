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

async function argusPost<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(KEY ? { 'X-Argus-Key': KEY } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`Argus POST ${path} → HTTP ${res.status}`)
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
  first_seen:      string
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
  friendly_name?: string
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
