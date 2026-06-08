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
  id:          string
  ip:          string
  hostname:    string
  mac:         string
  os:          string
  os_accuracy?: number
  vendor?:     string
  open_ports:  number[]
  first_seen:  string
  last_seen:   string
  status:      DeviceStatus
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
}

// ─── API functions ────────────────────────────────────────────────────────────

export const getHealth    = () => argusGet<HealthStatus>('/health')
export const getScanRuns  = () => argusGet<ScanRun[]>('/scans')
export const getAnomalies = () => argusGet<Anomaly[] | { anomalies: Anomaly[] }>('/anomalies')
export const getWeeklyReport = () => argusGet<WeeklySummary>('/reports/weekly')
export const triggerScan  = () => argusPost<{ message: string; scan_id: string }>('/scans')

export async function getDevices(): Promise<Device[]> {
  const data = await argusGet<Device[] | { devices: Device[] }>('/devices')
  return Array.isArray(data) ? data : data.devices
}

export async function getDeviceDetail(mac: string): Promise<DeviceDetail> {
  return argusGet<DeviceDetail>(`/devices/${encodeURIComponent(mac)}`)
}

export async function getDevicePortHistory(mac: string): Promise<PortScanSnapshot[]> {
  const data = await argusGet<PortScanSnapshot[] | { history: PortScanSnapshot[] }>(
    `/devices/${encodeURIComponent(mac)}/ports`
  )
  return Array.isArray(data) ? data : data.history
}

export async function getDeviceAnomalies(mac: string): Promise<Anomaly[]> {
  const data = await argusGet<Anomaly[] | { anomalies: Anomaly[] }>(
    `/devices/${encodeURIComponent(mac)}/anomalies`
  )
  return Array.isArray(data) ? data : data.anomalies
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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
