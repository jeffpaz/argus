'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  getHealth, getAllDevices, getAnomalies, triggerScan, getCountHistory,
  getBandwidthSummary, getDnsAnomalies,
  fmtDate, fmtBytes, timeAgo,
  type HealthStatus, type Device, type Anomaly,
  type CountHistoryPoint, type TopBandwidthDevice, type DnsAnomaly,
} from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip,
  Legend, ResponsiveContainer, CartesianGrid, Cell,
} from 'recharts'

type SortKey = 'ip' | 'hostname' | 'last_seen' | 'status'
type SortDir = 'asc' | 'desc'
type ScanState = 'idle' | 'running' | 'done' | 'error'
type LocationFilter = 'all' | 'MSP' | 'PHX' | 'CBN'

const LOC_CONFIG: Record<string, { label: string; btn: string; badge: string; border: string; color: string; rowBorder: string }> = {
  MSP: { label: 'Minneapolis', btn: 'MSP',   badge: 'bg-blue-50   text-blue-600   border-blue-200',  border: 'border-l-blue-400',  color: '#3B82F6', rowBorder: 'border-l-blue-300'  },
  PHX: { label: 'Phoenix',     btn: 'PHX',   badge: 'bg-orange-50 text-orange-600 border-orange-200', border: 'border-l-orange-400', color: '#F97316', rowBorder: 'border-l-orange-300' },
  CBN: { label: 'Cabin',       btn: 'Cabin', badge: 'bg-green-50  text-green-600  border-green-200',  border: 'border-l-green-400',  color: '#22C55E', rowBorder: 'border-l-green-300'  },
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

function newThisWeek(devices: Device[]) {
  return devices.filter(d => d.is_new).length
}

function StatusBadge({ status }: { status: Device['status'] }) {
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

function fmtTick(ts: string) {
  const d = new Date(ts)
  return `${d.getMonth() + 1}/${d.getDate()}`
}

export default function DashboardPage() {
  const [health,    setHealth]    = useState<HealthStatus | null>(null)
  const [devices,   setDevices]   = useState<Device[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  const [countHistory, setCountHistory] = useState<CountHistoryPoint[]>([])
  const [bwTop,        setBwTop]        = useState<TopBandwidthDevice[]>([])
  const [dnsAnomalies, setDnsAnomalies] = useState<DnsAnomaly[]>([])

  const [search,    setSearch]    = useState('')
  const [osFilter,  setOsFilter]  = useState('')
  const [newOnly,   setNewOnly]   = useState(false)
  const [locFilter, setLocFilter] = useState<LocationFilter>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem('argus_loc_filter') as LocationFilter) ?? 'all'
    }
    return 'all'
  })
  const [sortKey,  setSortKey]  = useState<SortKey>('ip')
  const [sortDir,  setSortDir]  = useState<SortDir>('asc')
  const [page,     setPage]     = useState(0)

  const [scanState, setScanState] = useState<ScanState>('idle')
  const [scanMsg,   setScanMsg]   = useState('')

  const PAGE_SIZE = 25

  const load = useCallback(async () => {
    try {
      const [h, d, a] = await Promise.allSettled([getHealth(), getAllDevices(), getAnomalies()])
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
    const [ch, bw, dns] = await Promise.allSettled([
      getCountHistory(30),
      getBandwidthSummary(),
      getDnsAnomalies(true, 20),
    ])
    if (ch.status === 'fulfilled')  setCountHistory(ch.value)
    if (bw.status === 'fulfilled')  setBwTop(bw.value)
    if (dns.status === 'fulfilled') setDnsAnomalies(dns.value)
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
    if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    else { setSortKey(key); setSortDir('asc') }
    setPage(0)
  }

  const locFiltered = locFilter === 'all'
    ? devices
    : devices.filter(d => d.location === locFilter)

  const osList = [...new Set(locFiltered.map(d => d.os).filter(Boolean))].sort()

  const filtered = locFiltered
    .filter(d => {
      const q = search.toLowerCase()
      if (q && !d.ip.includes(q) && !d.hostname.toLowerCase().includes(q) && !d.mac.toLowerCase().includes(q) && !(d.firewalla_name?.toLowerCase() ?? '').includes(q)) return false
      if (osFilter && d.os !== osFilter) return false
      if (newOnly && !d.is_new) return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'ip')        cmp = sortIp(a.ip).localeCompare(sortIp(b.ip))
      if (sortKey === 'hostname')  cmp = a.hostname.localeCompare(b.hostname)
      if (sortKey === 'last_seen') cmp = a.last_seen.localeCompare(b.last_seen)
      if (sortKey === 'status')    cmp = a.status.localeCompare(b.status)
      return sortDir === 'asc' ? cmp : -cmp
    })

  const pageCount = Math.ceil(filtered.length / PAGE_SIZE)
  const pageSlice = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const openAnoms = anomalies.filter(a => !a.resolved)
  const newCount  = newThisWeek(locFiltered)
  const onlineCount = locFiltered.filter(d => d.is_online).length

  const summaryCards = [
    { label: 'Active Devices', value: locFiltered.length, icon: '🖥️',  accent: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Online Now',     value: onlineCount,        icon: '🟢',  accent: 'text-green-600',  bg: 'bg-green-50'  },
    { label: 'New (5 days)',   value: newCount,           icon: '✨',  accent: 'text-indigo-600', bg: 'bg-indigo-50' },
    { label: 'Open Anomalies', value: openAnoms.filter(a => locFilter === 'all' || locFiltered.some(d => d.ip === a.device_id)).length, icon: '⚠️', accent: openAnoms.length > 0 ? 'text-red-600' : 'text-green-600', bg: openAnoms.length > 0 ? 'bg-red-50' : 'bg-green-50' },
  ]

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span className="ml-1 text-indigo-400">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  const groups: Array<{ loc: string | null; rows: Device[] }> =
    locFilter !== 'all'
      ? [{ loc: null, rows: pageSlice }]
      : (() => {
          const byLoc: Record<string, Device[]> = {}
          for (const d of pageSlice) {
            const k = d.location || 'Unknown'
            if (!byLoc[k]) byLoc[k] = []
            byLoc[k].push(d)
          }
          return Object.entries(byLoc).map(([loc, rows]) => ({ loc, rows }))
        })()

  const chartDates = [...new Set(countHistory.map(p => p.timestamp.slice(0, 10)))].sort()
  const countChartData = chartDates.map(date => {
    const row: Record<string, string | number> = { date }
    for (const loc of ['MSP', 'PHX', 'CBN']) {
      const pts = countHistory.filter(p => p.timestamp.slice(0, 10) === date && p.location === loc)
      if (pts.length) {
        row[`${loc}_total`]  = pts[pts.length - 1].device_count
        row[`${loc}_online`] = pts[pts.length - 1].online_count
      }
    }
    return row
  })

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      {/* Navbar */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap shadow-sm">
        <div className="flex items-center gap-3">
          <span className="text-gray-900 font-bold text-sm tracking-tight">🛡️ Argus</span>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-xs text-gray-500">
            {health?.status === 'ok'
              ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 mr-1.5 align-middle pulse-dot" />Online</>
              : loading ? 'Connecting…'
              : <><span className="inline-block w-1.5 h-1.5 rounded-full bg-red-400 mr-1.5 align-middle" />Offline</>
            }
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/map" className="text-xs text-gray-500 hover:text-indigo-600 transition-colors font-medium">
            🗺️ Map
          </Link>
          <Link href="/report" className="text-xs text-gray-500 hover:text-indigo-600 transition-colors font-medium">
            Report
          </Link>
          {scanMsg && (
            <span className={`text-xs ${scanState === 'error' ? 'text-red-500' : scanState === 'done' ? 'text-green-600' : 'text-amber-600'}`}>
              {scanMsg}
            </span>
          )}
          <button
            onClick={handleTriggerScan}
            disabled={scanState === 'running'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {scanState === 'running'
              ? <><span className="animate-spin-fast">◌</span> Scanning…</>
              : <>⟳ Trigger Scan</>
            }
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-6 py-8">
        <ErrorBoundary label="Dashboard">
          {error && (
            <div className="mb-6 border border-red-200 bg-red-50 text-red-600 rounded-xl px-4 py-3 text-sm">
              ⚠ Could not reach Argus API: {error}
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {summaryCards.map(c => (
              <div key={c.label} className="bg-white border border-gray-200 rounded-xl px-5 py-4 shadow-card hover:shadow-card-hover transition-shadow">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-gray-400 font-medium uppercase tracking-wider">{c.label}</span>
                  <span className={`text-lg w-8 h-8 flex items-center justify-center rounded-lg ${c.bg}`}>{c.icon}</span>
                </div>
                <div className={`font-bold text-2xl ${c.accent}`}>
                  {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                </div>
              </div>
            ))}
          </div>

          {/* Device History Chart */}
          <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-card">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">📊 Device History — Last 30 Days</h2>
            {countChartData.length < 2 ? (
              <div className="flex items-center justify-center h-32 text-gray-400 text-sm">
                Collecting history — check back tomorrow
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={countChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={fmtTick} />
                  <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} />
                  <Tooltip
                    contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 11 }}
                    labelStyle={{ color: '#111827' }}
                  />
                  <Legend wrapperStyle={{ fontSize: 10, color: '#6B7280' }} />
                  {(['MSP', 'PHX', 'CBN'] as const).map(loc => (
                    <>
                      <Line key={`${loc}_total`}  dataKey={`${loc}_total`}  name={`${loc} Total`}  stroke={LOC_CONFIG[loc].color} strokeWidth={2} dot={false} />
                      <Line key={`${loc}_online`} dataKey={`${loc}_online`} name={`${loc} Online`} stroke={LOC_CONFIG[loc].color} strokeWidth={1.5} dot={false} strokeDasharray="4 2" />
                    </>
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
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
              <ResponsiveContainer width="100%" height={220}>
                <BarChart
                  data={bwTop.slice(0, 10).map(d => ({
                    name: (d.device_name || d.friendly_name || d.mac).substring(0, 22),
                    total: d.total_bytes,
                    location: d.location,
                  }))}
                  layout="vertical"
                  margin={{ top: 0, right: 20, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" horizontal={false} />
                  <XAxis type="number" tickFormatter={v => fmtBytes(v)} tick={{ fontSize: 9, fill: '#9CA3AF' }} />
                  <YAxis type="category" dataKey="name" width={150} tick={{ fontSize: 9, fill: '#6B7280' }} />
                  <Tooltip
                    formatter={(v: unknown) => fmtBytes(Number(v))}
                    contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 11 }}
                  />
                  <Bar dataKey="total" radius={[0, 4, 4, 0]}>
                    {bwTop.slice(0, 10).map((entry, i) => (
                      <Cell key={i} fill={LOC_CONFIG[entry.location]?.color ?? '#9CA3AF'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

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
                    <th className="text-left px-4 py-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider hidden xl:table-cell">Bandwidth 24h</th>
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
                          key={d.mac || d.ip}
                          className="border-b border-gray-50 hover:bg-gray-50 cursor-pointer transition-colors"
                          onClick={() => window.location.href = `/device?mac=${encodeURIComponent(d.mac)}`}
                        >
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <OnlineDot isOnline={d.is_online} downtimeSince={d.downtime_since} />
                              <span className="text-indigo-600 font-mono text-xs font-medium">{d.ip}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-800">
                            <div className="font-medium flex items-center gap-1.5 flex-wrap">
                              {d.hostname || d.firewalla_name || <span className="text-gray-400 italic text-xs">unknown</span>}
                              {d.is_new && (
                                <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-600 tracking-wide uppercase shrink-0">NEW</span>
                              )}
                            </div>
                            {d.flagged_dns && (
                              <div className="text-[10px] text-red-500 font-medium mt-0.5">⚠ DNS flag</div>
                            )}
                          </td>
                          <td className="px-4 py-3 text-gray-400 font-mono text-xs hidden md:table-cell">{d.mac}</td>
                          <td className="px-4 py-3">
                            {d.location ? <LocationBadge location={d.location} /> : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex flex-col gap-0.5">
                              <StatusBadge status={d.status} />
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
