'use client'

import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  getHealth, getIdentities, getAnomalies, triggerScan,
  getBandwidthSummary, getDnsAnomalies, getThreats, resolveThreat,
  getLifecycleSummary, getLatestReport, getOpenOutages,
  fmtDate, fmtBytes, timeAgo,
  type HealthStatus, type DeviceIdentity, type Anomaly,
  type TopBandwidthDevice, type DnsAnomaly, type Threat,
  type LifecycleSummary, type LifecycleState,
  type EnhancedReport, type OutageEvent,
} from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip,
  ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

type SortKey = 'ip' | 'hostname' | 'last_seen' | 'status' | 'bandwidth'
type SortDir = 'asc' | 'desc'
type ScanState = 'idle' | 'running' | 'done' | 'error'
type LocationFilter = 'all' | 'MSP' | 'PHX' | 'CBN'
type LifecycleFilter = 'all' | LifecycleState

const LOC_CONFIG: Record<string, { label: string; btn: string; badge: string; border: string; color: string; rowBorder: string }> = {
  MSP: { label: 'Minneapolis', btn: 'MSP',   badge: 'bg-blue-50   text-blue-600   border-blue-200',  border: 'border-l-blue-400',  color: '#3B82F6', rowBorder: 'border-l-blue-300'  },
  PHX: { label: 'Phoenix',     btn: 'PHX',   badge: 'bg-orange-50 text-orange-600 border-orange-200', border: 'border-l-orange-400', color: '#F97316', rowBorder: 'border-l-orange-300' },
  CBN: { label: 'Cabin',       btn: 'Cabin', badge: 'bg-green-50  text-green-600  border-green-200',  border: 'border-l-green-400',  color: '#22C55E', rowBorder: 'border-l-green-300'  },
}

const BW_COLORS: Record<string, { dl: string; ul: string }> = {
  MSP: { dl: '#3B82F6', ul: '#93C5FD' },
  PHX: { dl: '#F97316', ul: '#FED7AA' },
  CBN: { dl: '#22C55E', ul: '#86EFAC' },
  '':  { dl: '#9CA3AF', ul: '#D1D5DB' },
}

function BwTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; label: string; location: string; total_in: number; total_out: number } }> }) {
  if (!active || !payload?.length) return null
  const d = payload[0].payload
  const total = (d.total_in ?? 0) + (d.total_out ?? 0)
  const loc = d.location
  const cfg = LOC_CONFIG[loc]
  return (
    <div className="bg-white border border-gray-200 rounded-xl shadow-card px-4 py-3 text-[13px] font-sans min-w-[200px]">
      <div className="font-semibold text-indigo-600 mb-1.5 truncate">{d.label || d.name}</div>
      {cfg && (
        <div className="mb-2">
          <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider ${cfg.badge}`}>{loc}</span>
        </div>
      )}
      <div className="space-y-0.5">
        <div className="flex justify-between gap-6">
          <span style={{ color: BW_COLORS[loc]?.dl ?? BW_COLORS[''].dl }}>↓ Download</span>
          <span className="text-gray-700">{fmtBytes(d.total_in ?? 0)}</span>
        </div>
        <div className="flex justify-between gap-6">
          <span style={{ color: BW_COLORS[loc]?.dl ?? BW_COLORS[''].dl }} className="opacity-60">↑ Upload</span>
          <span className="text-gray-700">{fmtBytes(d.total_out ?? 0)}</span>
        </div>
        <div className="border-t border-gray-100 mt-1.5 pt-1.5 flex justify-between gap-6">
          <span className="text-gray-500">Total</span>
          <span className="font-semibold text-gray-800">{fmtBytes(total)}</span>
        </div>
      </div>
    </div>
  )
}

const DEVICE_TYPE_ICONS: Record<string, string> = {
  'Mac': '💻',
  'iOS Device': '📱',
  'Android Device': '📱',
  'Router / Firewall': '🔥',
  'Network Device': '📡',
  'Security Camera': '📷',
  'Smart Speaker': '🔊',
  'Thermostat': '🌡️',
  'Streaming / TV': '📺',
  'Printer': '🖨️',
  'NAS': '🗄️',
  'Gaming Console': '🎮',
  'Linux / SBC': '🐧',
  'Linux Device': '🐧',
  'Windows PC': '🪟',
  'Laptop': '💻',
  'Apple Device': '🍎',
  'Smart Home Device': '🏠',
}

function sortIp(ip: string) {
  return ip.split('.').map(n => n.padStart(3, '0')).join('.')
}

function newThisWeek(devices: DeviceIdentity[]) {
  return devices.filter(d => d.is_new).length
}

function StatusBadge({ status }: { status: DeviceIdentity['status'] }) {
  const cls = status === 'NEW'     ? 'bg-indigo-50 text-indigo-600 border-indigo-200'
            : status === 'CHANGED' ? 'bg-amber-50  text-amber-600  border-amber-200'
                                   : 'bg-gray-50   text-gray-500   border-gray-200'
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  )
}

function LocationBadge({ location }: { location: string }) {
  const cfg = LOC_CONFIG[location]
  if (!cfg) return null
  return (
    <span className={`inline-flex items-center px-2 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider ${cfg.badge}`}>
      {location}
    </span>
  )
}

function DeviceTypePill({ deviceType }: { deviceType?: string | null }) {
  if (!deviceType || deviceType === 'Unknown') return null
  const icon = DEVICE_TYPE_ICONS[deviceType] ?? '❓'
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-50 text-gray-500 border border-gray-200 rounded-full text-[10px] font-medium mt-0.5">
      {icon} {deviceType}
    </span>
  )
}

const LC_PILL: Record<string, string> = {
  idle:   'bg-amber-50 text-amber-700 border-amber-200',
  stale:  'bg-orange-50 text-orange-600 border-orange-200',
  gone:   'bg-red-50 text-red-600 border-red-200',
  guest:  'bg-purple-50 text-purple-600 border-purple-200',
}

function LifecyclePill({ state }: { state?: LifecycleState | null }) {
  if (!state || state === 'active') return null
  const cls = LC_PILL[state] ?? 'bg-gray-50 text-gray-500 border-gray-200'
  return (
    <span className={`inline-block px-1.5 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider ${cls}`}>
      {state}
    </span>
  )
}

function OnlineDot({ isOnline, downtimeSince }: { isOnline?: boolean; downtimeSince?: string | null }) {
  if (isOnline === undefined) return null
  return isOnline
    ? <span title="Online" className="inline-block w-2 h-2 rounded-full bg-green-500 pulse-dot align-middle mr-1.5 shrink-0" />
    : <span title={downtimeSince ? `Offline since ${fmtDate(downtimeSince)}` : 'Offline'} className="inline-block w-2 h-2 rounded-full bg-gray-300 align-middle mr-1.5 shrink-0" />
}

function BandwidthPill({ bytesIn, bytesOut }: { bytesIn?: number; bytesOut?: number }) {
  if (!bytesIn && !bytesOut) return <span className="text-gray-300 text-[10px]">—</span>
  return (
    <span className="text-[10px] text-gray-500 space-x-1.5">
      <span className="text-indigo-500">↓{fmtBytes(bytesIn ?? 0)}</span>
      <span>↑{fmtBytes(bytesOut ?? 0)}</span>
    </span>
  )
}

const LOC_ORDER = ['MSP', 'PHX', 'CBN', 'Unknown']

export default function DashboardPage() {
  const router = useRouter()
  const [health,    setHealth]    = useState<HealthStatus | null>(null)
  const [devices,   setDevices]   = useState<DeviceIdentity[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  const [bwTop,        setBwTop]        = useState<TopBandwidthDevice[]>([])
  const [dnsAnomalies, setDnsAnomalies] = useState<DnsAnomaly[]>([])
  const [threats, setThreats] = useState<Threat[]>([])
  const [lifecycle, setLifecycle] = useState<LifecycleSummary | null>(null)
  const [healthReport, setHealthReport] = useState<EnhancedReport | null>(null)
  const [openOutages,  setOpenOutages]  = useState<OutageEvent[]>([])
  const [lcFilter, setLcFilter] = useState<LifecycleFilter>('all')

  const [search,    setSearch]    = useState('')
  const [osFilter,  setOsFilter]  = useState('')
  const [newOnly,   setNewOnly]   = useState(false)
  const [locFilter, setLocFilter] = useState<LocationFilter>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('argus_loc_filter') as LocationFilter) ?? 'all'
    }
    return 'all'
  })
  const [sortKey,  setSortKey]  = useState<SortKey | null>('ip')
  const [sortDir,  setSortDir]  = useState<SortDir>('asc')
  const [page,     setPage]     = useState(0)

  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanMsg,   setScanMsg]   = useState('')

  const PAGE_SIZE = 25

  const load = useCallback(async () => {
    try {
      const [h, d, a] = await Promise.allSettled([getHealth(), getIdentities(), getAnomalies()])
      if (h.status === 'fulfilled') setHealth(h.value)
      if (d.status === 'fulfilled') setDevices(d.value)
      if (a.status === 'fulfilled') {
        const raw = a.value
        setAnomalies(Array.isArray(raw) ? raw : raw.anomalies)
      }
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const loadCharts = useCallback(async () => {
    const [bw, dns, lc, rpt, out] = await Promise.allSettled([
      getBandwidthSummary(),
      getDnsAnomalies(true, 20),
      getLifecycleSummary(),
      getLatestReport(),
      getOpenOutages(),
    ])
    if (bw.status === 'fulfilled')  setBwTop(bw.value)
    if (dns.status === 'fulfilled') setDnsAnomalies(dns.value)
    if (lc.status === 'fulfilled')  setLifecycle(lc.value)
    if (rpt.status === 'fulfilled') setHealthReport(rpt.value)
    if (out.status === 'fulfilled') setOpenOutages(out.value)
  }, [])

  useEffect(() => { load() }, [load])
  useEffect(() => { loadCharts() }, [loadCharts])

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('argus_loc_filter', locFilter)
    }
  }, [locFilter])

  useEffect(() => {
    const id = setInterval(() => getDnsAnomalies(true, 20).then(setDnsAnomalies).catch(() => {}), 5 * 60_000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const id = setInterval(() => getThreats(false, 50).then(setThreats).catch(() => {}), 60_000)
    return () => clearInterval(id)
  }, [])

  async function handleTriggerScan() {
    setScanState('running')
    setScanMsg('Scanning all subnets…')
    try {
      await triggerScan()
      setScanState('done')
      setScanMsg('Scan started — refresh in ~60s.')
    } catch (e) {
      setScanState('error')
      setScanMsg(`Failed: ${String(e)}`)
    }
  }

  function toggleSort(key: SortKey) {
    if (key === 'bandwidth') {
      if (sortKey !== 'bandwidth') { setSortKey('bandwidth'); setSortDir('desc') }
      else if (sortDir === 'desc')  { setSortDir('asc') }
      else                          { setSortKey(null) }
    } else {
      if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
      else { setSortKey(key); setSortDir('asc') }
    }
    setPage(0)
  }

  const locFiltered = locFilter === 'all'
    ? devices
    : devices.filter(d => d.location === locFilter)

  const osList = [...new Set(locFiltered.map(d => d.os).filter(Boolean))].sort()

  const filtered = locFiltered
    .filter(d => {
      const q = search.toLowerCase()
      if (q && !d.ip.includes(q) && !d.display_name.toLowerCase().includes(q) && !(d.current_mac ?? '').toLowerCase().includes(q) && !(d.canonical_friendly_name?.toLowerCase() ?? '').includes(q)) return false
      if (osFilter && d.os !== osFilter) return false
      if (newOnly && !d.is_new) return false
      if (lcFilter !== 'all') {
        const state = (d as DeviceIdentity & { lifecycle_state?: string }).lifecycle_state ?? 'active'
        if (state !== lcFilter) return false
      }
      return true
    })
    .sort((a, b) => {
      if (!sortKey) return 0
      if (sortKey === 'bandwidth') {
        const aBw = (a.bytes_in_24h ?? 0) + (a.bytes_out_24h ?? 0)
        const bBw = (b.bytes_in_24h ?? 0) + (b.bytes_out_24h ?? 0)
        if (!aBw && !bBw) return 0
        if (!aBw) return 1
        if (!bBw) return -1
        return sortDir === 'asc' ? aBw - bBw : bBw - aBw
      }
      let cmp = 0
      if (sortKey === 'ip')        cmp = sortIp(a.ip).localeCompare(sortIp(b.ip))
      if (sortKey === 'hostname')  cmp = a.display_name.localeCompare(b.display_name)
      if (sortKey === 'last_seen') cmp = a.last_seen.localeCompare(b.last_seen)
      if (sortKey === 'status')    cmp = a.status.localeCompare(b.status)
      return sortDir === 'asc' ? cmp : -cmp
    })

  // When showing all locations, re-bucket by location (stable group order)
  // so bandwidth sort reorders within each location group, not across groups
  const displayFiltered = locFilter !== 'all'
    ? filtered
    : (() => {
        const byLoc: Record<string, DeviceIdentity[]> = {}
        for (const d of filtered) {
          const k = d.location || 'Unknown'
          if (!byLoc[k]) byLoc[k] = []
          byLoc[k].push(d)
        }
        return LOC_ORDER.flatMap(loc => byLoc[loc] ?? [])
      })()

  const pageCount = Math.ceil(displayFiltered.length / PAGE_SIZE)
  const pageSlice = displayFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const openAnoms = anomalies.filter(a => !a.resolved)
  const newCount  = newThisWeek(locFiltered)
  const onlineCount = locFiltered.filter(d => d.is_online).length

  const guestCount = lifecycle?.total_guest_devices ?? 0
  const hs = healthReport?.summary
  const hsColor = !hs ? 'text-gray-400'
    : hs.health_grade === 'A' ? 'text-green-600'
    : hs.health_grade === 'B' ? 'text-teal-600'
    : hs.health_grade === 'C' ? 'text-yellow-600'
    : hs.health_grade === 'D' ? 'text-orange-600'
    : 'text-red-600'
  const hsBg = !hs ? 'bg-gray-50'
    : hs.health_grade === 'A' ? 'bg-green-50'
    : hs.health_grade === 'B' ? 'bg-teal-50'
    : hs.health_grade === 'C' ? 'bg-yellow-50'
    : hs.health_grade === 'D' ? 'bg-orange-50'
    : 'bg-red-50'
  const activeThreatsCount = threats.length + openAnoms.filter(a => locFilter === 'all' || locFiltered.some(d => d.ip === a.device_id)).length + openOutages.length
  const summaryCards = [
    { label: 'Active Devices', value: locFiltered.length, icon: '🖥️',  accent: 'text-indigo-600', bg: 'bg-indigo-50', sub: lifecycle ? `${lifecycle.active} active · ${lifecycle.idle} idle · ${lifecycle.stale} stale` : null, onClick: undefined as (() => void) | undefined },
    { label: 'Online Now',     value: onlineCount,        icon: '🟢',  accent: 'text-green-600',  bg: 'bg-green-50', sub: null, onClick: undefined },
    { label: 'Guest Devices',  value: guestCount,         icon: '👥',  accent: 'text-purple-600', bg: 'bg-purple-50', sub: null, onClick: () => router.push('/guests') },
    { label: 'Active Threats', value: activeThreatsCount, icon: '⚠️', accent: activeThreatsCount > 0 ? 'text-red-600' : 'text-green-600', bg: activeThreatsCount > 0 ? 'bg-red-50' : 'bg-green-50', sub: null, onClick: () => router.push('/alerts') },
    { label: 'Health Score',   value: hs ? `${hs.health_grade} ${hs.health_score}` : '—', icon: '🛡️', accent: hsColor, bg: hsBg, sub: hs ? `Week of ${hs.week}` : null, onClick: () => router.push('/report') },
  ]

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span className="ml-1 text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  const groups: Array<{ loc: string | null; rows: DeviceIdentity[] }> =
    locFilter !== 'all'
      ? [{ loc: null, rows: pageSlice }]
      : (() => {
          const byLoc: Record<string, DeviceIdentity[]> = {}
          for (const d of pageSlice) {
            const k = d.location || 'Unknown'
            if (!byLoc[k]) byLoc[k] = []
            byLoc[k].push(d)
          }
          return LOC_ORDER.filter(loc => byLoc[loc]).map(loc => ({ loc, rows: byLoc[loc] }))
        })()

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      {/* Navbar */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          {/* Left: brand + status + scan */}
          <div className="flex items-center gap-3">
            <span className="text-gray-900 font-bold text-sm tracking-tight shrink-0">🛡️ Argus</span>
            <span className="text-gray-200 select-none">|</span>
            <span className="text-xs text-gray-500 shrink-0">
              {health?.status === 'ok'
                ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 align-middle pulse-dot" />Online</>
                : loading ? 'Connecting…'
                : <><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-1.5 align-middle" />Offline</>
              }
            </span>
            {scanMsg && (
              <span className={`text-xs shrink-0 ${scanState === 'error' ? 'text-red-500' : scanState === 'done' ? 'text-green-600' : 'text-amber-600'}`}>
                {scanMsg}
              </span>
            )}
            <button
              onClick={handleTriggerScan}
              disabled={scanState === 'running'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {scanState === 'running'
                ? <><span className="animate-spin-fast">◌</span> Scanning…</>
                : <>⟳ Trigger Scan</>
              }
            </button>
          </div>

          {/* Center: nav links */}
          <div className="flex items-center gap-2">
            <Link href="/alerts" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">
              🔔 Alerts
            </Link>
            <Link href="/guests" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">
              👥 Guests
            </Link>
            <Link href="/map" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">
              🗺️ Map
            </Link>
            <Link href="/report" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">
              📋 Report
            </Link>
          </div>

          {/* Right: Dashboard link */}
          <a
            href="https://pazlabs.io"
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors shrink-0"
          >
            ← Dashboard
          </a>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <ErrorBoundary label="Dashboard">
          {error && (
            <div className="mb-6 border border-red-200 bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm">
              ⚠ Could not reach Argus API: {error}
            </div>
          )}

          {/* Outage Banner */}
          {openOutages.length > 0 && (
            <div className="mb-6 flex items-start gap-3 border border-red-300 bg-red-50 rounded-xl px-4 py-3">
              <span className="text-red-500 text-lg mt-0.5">🔴</span>
              <div className="flex-1 min-w-0">
                <div className="font-semibold text-red-700 text-sm">Network Outage Detected</div>
                <ul className="mt-1 space-y-0.5">
                  {openOutages.map(o => (
                    <li key={o.id} className="text-xs text-red-600">
                      <span className="font-semibold uppercase">{o.outage_type.replace('_', ' ')}</span>
                      {o.location ? ` at ${o.location}` : ' (all sites)'}
                      {' · started '}{fmtDate(o.started_at)}
                    </li>
                  ))}
                </ul>
              </div>
              <a href="/alerts" className="text-xs text-red-600 font-semibold hover:underline shrink-0 mt-0.5">View →</a>
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-8">
            {summaryCards.map(c => (
              <div
                key={c.label}
                onClick={c.onClick}
                className={`bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-card hover:shadow-card-hover transition-shadow ${c.onClick ? 'cursor-pointer' : ''}`}
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{c.label}</span>
                  <span className={`text-lg w-8 h-8 flex items-center justify-center rounded-lg ${c.bg}`}>{c.icon}</span>
                </div>
                <div className={`font-bold text-2xl ${c.accent}`}>
                  {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                </div>
                {c.sub && <div className="text-[10px] text-gray-400 mt-1">{c.sub}</div>}
              </div>
            ))}
          </div>

          {/* Open Anomalies */}
          {openAnoms.length > 0 && (
            <div className="mb-8">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Open Anomalies</h2>
              <div className="space-y-2">
                {openAnoms.slice(0, 5).map(a => (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 border rounded-xl px-4 py-3 text-sm ${
                      a.severity === 'high'   ? 'border-red-200   bg-red-50   text-red-700'
                    : a.severity === 'medium' ? 'border-amber-200 bg-amber-50 text-amber-700'
                    :                          'border-gray-200  bg-gray-50  text-gray-600'
                    }`}
                  >
                    <span className="text-base mt-0.5">
                      {a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🔵'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="font-semibold uppercase text-[10px] tracking-wide">{a.type}</div>
                      <div className="text-xs mt-0.5 opacity-80">{a.description}</div>
                      <div className="text-[10px] mt-0.5 opacity-60">{fmtDate(a.created_at)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Bandwidth Chart */}
          {bwTop.length > 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-card">
              <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">📶 Top Bandwidth Users — Last 24h</h2>
              <ResponsiveContainer width="100%" height={Math.max(220, bwTop.slice(0, 10).length * 28)}>
                <BarChart
                  data={bwTop.slice(0, 10).map(d => ({
                    name:      (d.device_name || d.friendly_name || d.mac).substring(0, 24),
                    total_in:  d.total_in,
                    total_out: d.total_out,
                    location:  d.location,
                    label:     d.device_name || d.friendly_name || d.mac,
                    mac:       d.mac,
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                  style={{ cursor: 'pointer' }}
                  onClick={(data: Record<string, unknown>) => {
                    const payload = (data?.activePayload as Array<{payload?: {mac?: string; identity_id?: string}}>)?.[0]?.payload
                    if (payload?.identity_id) router.push(`/device?identity_id=${encodeURIComponent(payload.identity_id)}`)
                    else if (payload?.mac) router.push(`/device?mac=${encodeURIComponent(payload.mac)}`)
                  }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtBytes(v)} tick={{ fontSize: 9, fill: '#9CA3AF' }} />
                  <YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 9, fill: '#6B7280' }} />
                  <Tooltip content={<BwTooltip />} />
                  <Bar dataKey="total_in" stackId="a" radius={[0, 0, 0, 0]}>
                    {bwTop.slice(0, 10).map((entry, i) => (
                      <Cell key={i} fill={BW_COLORS[entry.location]?.dl ?? BW_COLORS[''].dl} />
                    ))}
                  </Bar>
                  <Bar dataKey="total_out" stackId="a" radius={[0, 4, 4, 0]}>
                    {bwTop.slice(0, 10).map((entry, i) => (
                      <Cell key={i} fill={BW_COLORS[entry.location]?.ul ?? BW_COLORS[''].ul} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-x-5 gap-y-1.5 mt-3 pl-1">
                <span className="text-[11px] text-gray-400 font-medium self-center">Download / Upload</span>
                {(['MSP', 'PHX', 'CBN'] as const).map(loc => (
                  <div key={loc} className="flex items-center gap-2">
                    <span className="inline-block w-3 h-2.5 rounded-sm shrink-0" style={{ background: BW_COLORS[loc].dl }} />
                    <span className="inline-block w-3 h-2.5 rounded-sm shrink-0" style={{ background: BW_COLORS[loc].ul }} />
                    <span className="text-[12px] text-gray-500">{loc}</span>
                  </div>
                ))}
              </div>
            </div>
          )}


          {/* Active Threats Panel */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-card">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">🚨 Active Threats</h2>
            {threats.length === 0 ? (
              <div className="text-green-600 text-sm flex items-center gap-2">
                <span>✅</span> No active threats detected
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Device</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Loc</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Severity</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Detail</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {threats.map(t => (
                      <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                        <td className="px-3 py-2 text-gray-400 text-[10px] whitespace-nowrap font-mono">{timeAgo(t.timestamp)}</td>
                        <td className="px-3 py-2 text-indigo-600 text-[10px] font-medium">{t.device_name || t.src_ip || '—'}</td>
                        <td className="px-3 py-2">
                          {t.location && <LocationBadge location={t.location} />}
                        </td>
                        <td className="px-3 py-2 font-medium text-[10px] whitespace-nowrap">
                          {t.threat_type === 'malicious_ip'  && '🚨 Malicious IP'}
                          {t.threat_type === 'port_scan'     && '🔍 Port Scan'}
                          {t.threat_type === 'cleartext'     && '🔓 Cleartext'}
                          {t.threat_type === 'unusual_hours' && '🌙 Unusual Hours'}
                          {t.threat_type === 'rogue_dhcp'    && '⚠️ Rogue DHCP'}
                          {t.threat_type === 'internal_scan' && '🔍 Internal Scan'}
                          {!['malicious_ip','port_scan','cleartext','unusual_hours','rogue_dhcp','internal_scan'].includes(t.threat_type) && t.threat_type}
                        </td>
                        <td className="px-3 py-2">
                          <span className={{
                            critical: 'bg-red-700   text-white',
                            high:     'bg-red-500   text-white',
                            medium:   'bg-amber-500 text-white',
                            low:      'bg-gray-400  text-white',
                          }[t.severity] + ' px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase'}>
                            {t.severity}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-600 text-[10px] max-w-[240px] truncate" title={t.detail}>{t.detail}</td>
                        <td className="px-3 py-2">
                          <button
                            onClick={async () => {
                              const note = window.prompt('Resolve note (optional):') ?? ''
                              if (note === null) return
                              await resolveThreat(t.id, note)
                              setThreats(prev => prev.filter(x => x.id !== t.id))
                            }}
                            className="px-2 py-1 text-[10px] bg-gray-100 hover:bg-indigo-50 hover:text-indigo-600 text-gray-500 rounded font-medium transition-colors"
                          >
                            Resolve
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* DNS Anomalies Panel */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-card">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">🔍 DNS Anomalies</h2>
            {dnsAnomalies.length === 0 ? (
              <div className="text-green-600 text-sm flex items-center gap-2">
                <span>✅</span> No DNS anomalies detected
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Device</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Loc</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Domain</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Reason</th>
                      <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Count</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dnsAnomalies.map(a => (
                      <tr key={a.id} className={`border-b border-gray-50 hover:bg-gray-50 ${a.flagged ? 'bg-red-50' : ''}`}>
                        <td className="px-3 py-2 text-gray-400 text-[10px] whitespace-nowrap font-mono">{timeAgo(a.timestamp)}</td>
                        <td className="px-3 py-2 text-indigo-600 text-[10px] font-medium">{a.device_name || a.mac}</td>
                        <td className="px-3 py-2">
                          {a.location && <LocationBadge location={a.location} />}
                        </td>
                        <td className="px-3 py-2 text-gray-700 max-w-[200px] truncate font-mono text-[10px]">{a.domain}</td>
                        <td className="px-3 py-2 text-amber-600 text-[10px]">{a.flag_reason || '—'}</td>
                        <td className="px-3 py-2 text-gray-500">{a.query_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
              {(['all', 'MSP', 'PHX', 'CBN'] as LocationFilter[]).map(loc => (
                <button
                  key={loc}
                  onClick={() => { setLocFilter(loc); setPage(0) }}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    locFilter === loc
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {loc === 'all' ? 'All Locations' : LOC_CONFIG[loc]?.btn ?? loc}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm">
              {(['all', 'active', 'idle', 'stale', 'gone', 'guest'] as LifecycleFilter[]).map(lc => (
                <button
                  key={lc}
                  onClick={() => { setLcFilter(lc); setPage(0) }}
                  className={`px-2.5 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                    lcFilter === lc
                      ? 'bg-indigo-600 text-white'
                      : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {lc === 'all' ? 'All' : lc.charAt(0).toUpperCase() + lc.slice(1)}
                  {lc !== 'all' && lifecycle && lifecycle[lc as keyof LifecycleSummary] !== undefined && (
                    <span className="ml-1 opacity-70">
                      ({lifecycle[lc as keyof LifecycleSummary] as number})
                    </span>
                  )}
                </button>
              ))}
            </div>

            <input
              type="text"
              placeholder="Search IP, hostname, MAC…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="flex-1 min-w-40 bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:border-indigo-400 shadow-sm"
            />

            {osList.length > 0 && (
              <select
                value={osFilter}
                onChange={e => { setOsFilter(e.target.value); setPage(0) }}
                className="bg-white border border-gray-200 rounded-xl px-3 py-2 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-indigo-300 shadow-sm"
              >
                <option value="">All OS</option>
                {osList.map(os => <option key={os} value={os}>{os}</option>)}
              </select>
            )}

            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newOnly}
                onChange={e => { setNewOnly(e.target.checked); setPage(0) }}
                className="accent-indigo-600 w-4 h-4 rounded"
              />
              New only (5 days)
            </label>

            <span className="ml-auto text-sm text-gray-400">{filtered.length} device{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Device Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
              <span className="animate-spin-fast mr-2">◌</span>Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-gray-400 text-sm">
              No devices match the current filters.
              {locFilter !== 'all' && (
                <div className="mt-2">
                  <button
                    onClick={() => { setLocFilter('all'); setPage(0) }}
                    className="text-indigo-600 underline hover:no-underline"
                  >
                    Show all locations
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-xl overflow-hidden shadow-card">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th
                      className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                      onClick={() => toggleSort('ip')}
                    >IP <SortArrow k="ip" /></th>
                    <th
                      className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                      onClick={() => toggleSort('hostname')}
                    >Hostname / Name <SortArrow k="hostname" /></th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden md:table-cell">MAC</th>
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Location</th>
                    <th
                      className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none"
                      onClick={() => toggleSort('status')}
                    >Status <SortArrow k="status" /></th>
                    <th
                      className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none hidden lg:table-cell"
                      onClick={() => toggleSort('last_seen')}
                    >Last Seen <SortArrow k="last_seen" /></th>
                    <th
                      className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider cursor-pointer hover:text-gray-600 select-none hidden xl:table-cell"
                      onClick={() => toggleSort('bandwidth')}
                    >Bandwidth 24h <SortArrow k="bandwidth" /></th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(({ loc, rows }) => (
                    <>
                      {loc && locFilter === 'all' && (
                        <tr key={`header-${loc}`}>
                          <td colSpan={7} className={`px-4 py-2 text-[10px] text-gray-500 font-semibold uppercase tracking-widest bg-gray-50 border-b border-gray-100 border-l-2 ${LOC_CONFIG[loc]?.border ?? 'border-l-gray-300'}`}>
                            {LOC_CONFIG[loc]?.label ?? loc} <span className="font-normal text-gray-400">({rows.length} shown)</span>
                          </td>
                        </tr>
                      )}
                      {rows.map((d) => (
                        <tr
                          key={d.identity_id || d.ip}
                          className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => window.location.href = `/device?identity_id=${encodeURIComponent(d.identity_id)}`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <OnlineDot isOnline={d.is_online} downtimeSince={d.downtime_since} />
                              <span className="text-indigo-600 font-mono text-xs font-medium">{d.ip}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-800">
                            <div className="font-medium flex items-center gap-1.5 flex-wrap">
                              {d.display_name || <span className="text-gray-400 italic text-xs">unknown</span>}
                              {d.is_new && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 tracking-wide uppercase shrink-0">NEW</span>
                              )}
                              {d.mac_randomized && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded border border-amber-300 bg-amber-50 text-amber-700 shrink-0">Private</span>
                              )}
                            </div>
                            {d.canonical_hostname && d.canonical_friendly_name && d.canonical_friendly_name !== d.canonical_hostname && (
                              <div className="text-[10px] text-gray-400 mt-0.5">{d.canonical_friendly_name}</div>
                            )}
                            {d.flagged_dns && (
                              <div className="text-[10px] text-red-500 font-medium mt-0.5">⚠ DNS flag</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden md:table-cell">
                            <div>{d.current_mac ?? d.mac}</div>
                            {d.all_macs.length > 1 && (
                              <div
                                className="inline-block mt-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-500 cursor-default"
                                title={d.all_macs.join('\n')}
                              >
                                +{d.all_macs.length - 1} more
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {d.location ? <LocationBadge location={d.location} /> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <StatusBadge status={d.status} />
                              <LifecyclePill state={(d as DeviceIdentity & { lifecycle_state?: LifecycleState }).lifecycle_state} />
                              {d.is_online === false && d.downtime_since && (
                                <span className="text-[10px] text-gray-400">↓ {timeAgo(d.downtime_since)}</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-500 text-sm hidden lg:table-cell">
                            <div>{timeAgo(d.last_seen)}</div>
                            <div className="text-[10px] text-gray-400">{fmtDate(d.first_seen).split(',')[0]}</div>
                          </td>
                          <td className="px-4 py-3 hidden xl:table-cell">
                            <BandwidthPill bytesIn={d.bytes_in_24h} bytesOut={d.bytes_out_24h} />
                          </td>
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {pageCount > 1 && (
            <div className="flex items-center justify-center gap-2 mt-5">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 bg-white"
              >
                ← Prev
              </button>
              <span className="text-sm text-gray-400">{page + 1} / {pageCount}</span>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={page === pageCount - 1}
                className="px-4 py-1.5 text-sm border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 hover:border-gray-300 disabled:opacity-30 bg-white"
              >
                Next →
              </button>
            </div>
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
