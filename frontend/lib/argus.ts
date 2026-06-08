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
  id:             string
  ip:             string
  hostname:       string
  mac:            string
  os:             string
  os_accuracy?:   number
  vendor?:        string
  open_ports:     number[]
  first_seen:     string
  last_seen:      string
  status:         DeviceStatus
  location:       string   // 'MSP' | 'PHX' | ''
  subnet:         string
  firewalla_name: string | null
  manufacturer:   string | null
  device_type:    string | null
  firewalla_group:string | null
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

// Raw backend shapes (actual API responses differ from the frontend types above)
interface RawDevice {
  ip: string; mac: string; hostname: string | null; vendor: string | null
  os_guess: string | null; open_ports: number[]; first_seen: string; last_seen: string
  is_known: boolean; label: string | null; status?: string; id?: string | number
  location?: string; subnet?: string
  firewalla_name?: string | null; manufacturer?: string | null
  device_type?: string | null; firewalla_group?: string | null
}
interface RawPortSnapshot {
  id: number; device_ip: string; scan_run_id: number; timestamp: string; open_ports: number[]
  // may also come in normalized shape already
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

export async function getDeviceDetail(mac: string): Promise<DeviceDetail> {
  const raw = await argusGet<RawDevice>(`/devices/${encodeURIComponent(mac)}`)
  return normalizeDevice(raw)
}

export async function getDevicePortHistory(mac: string): Promise<PortScanSnapshot[]> {
  const data = await argusGet<RawPortSnapshot[] | { history: PortScanSnapshot[] }>(
    `/devices/${encodeURIComponent(mac)}/ports`
  )
  if (!Array.isArray(data)) return data.history ?? []

  // Already normalized (has scan_id/scanned_at/added/removed)
  if (data.length > 0 && 'scan_id' in data[0] && 'added' in data[0]) {
    return data as unknown as PortScanSnapshot[]
  }

  // Raw backend snapshots: compute added/removed by diffing consecutive scans
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDevice(d: RawDevice): Device {
  const raw = d as unknown as Record<string, unknown>
  return {
    id:          String(d.id ?? d.mac),
    ip:          d.ip,
    mac:         d.mac,
    hostname:    d.hostname ?? '',
    os:          d.os_guess ?? raw.os as string ?? '',
    os_accuracy: raw.os_accuracy as number | undefined,
    vendor:      d.vendor ?? undefined,
    open_ports:  d.open_ports ?? [],
    first_seen:  d.first_seen,
    last_seen:   d.last_seen,
    status:          ((d.status as DeviceStatus) ?? 'OK'),
    location:        (raw.location as string) ?? '',
    subnet:          (raw.subnet as string) ?? '',
    firewalla_name:  d.firewalla_name ?? null,
    manufacturer:    d.manufacturer ?? null,
    device_type:     d.device_type ?? null,
    firewalla_group: d.firewalla_group ?? null,
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
