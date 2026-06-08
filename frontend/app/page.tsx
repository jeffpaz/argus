'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  getHealth, getDevices, getAnomalies, triggerScan,
  fmtDate, type HealthStatus, type Device, type Anomaly,
} from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'

type SortKey = 'ip' | 'hostname' | 'last_seen' | 'status'
type SortDir = 'asc' | 'desc'
type ScanState = 'idle' | 'running' | 'done' | 'error'
type LocationFilter = 'all' | 'MSP' | 'PHX' | 'CBN'

const LOC_CONFIG: Record<string, { label: string; btn: string; dot: string; badge: string; border: string }> = {
  MSP: { label: 'Minneapolis', btn: 'MSP',   dot: '🔵', badge: 'text-blue-400  border-blue-400/40  bg-blue-400/10',  border: 'border-l-blue-500'  },
  PHX: { label: 'Phoenix',     btn: 'PHX',   dot: '🔴', badge: 'text-red-400   border-red-400/40   bg-red-400/10',   border: 'border-l-red-500'   },
  CBN: { label: 'Cabin',       btn: 'Cabin', dot: '🟢', badge: 'text-green-400 border-green-400/40 bg-green-400/10', border: 'border-l-green-500' },
}

function sortIp(ip: string) {
  return ip.split('.').map(n => n.padStart(3, '0')).join('.')
}

function newThisWeek(devices: Device[]) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000
  return devices.filter(d => {
    const t = new Date(d.first_seen).getTime()
    return !isNaN(t) && t >= cutoff
  }).length
}

function StatusBadge({ status }: { status: Device['status'] }) {
  const cls = status === 'NEW'     ? 'text-a-teal  border-a-teal/40  bg-a-teal/10'
            : status === 'CHANGED' ? 'text-a-amber border-a-amber/40 bg-a-amber/10'
                                   : 'text-a-muted border-a-border/40'
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border rounded uppercase tracking-wider ${cls}`}>
      {status}
    </span>
  )
}

function LocationBadge({ location }: { location: string }) {
  const cfg = LOC_CONFIG[location]
  if (!cfg) return null
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border rounded uppercase tracking-wider ${cfg.badge}`}>
      {cfg.dot} {location}
    </span>
  )
}

export default function DashboardPage() {
  const [health,    setHealth]    = useState<HealthStatus | null>(null)
  const [devices,   setDevices]   = useState<Device[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  const [search,   setSearch]   = useState('')
  const [osFilter, setOsFilter] = useState('')
  const [newOnly,  setNewOnly]  = useState(false)
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
      const [h, d, a] = await Promise.allSettled([getHealth(), getDevices(), getAnomalies()])
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

  useEffect(() => { load() }, [load])

  // Persist location filter choice
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('argus_loc_filter', locFilter)
    }
  }, [locFilter])

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

  // Apply location filter first (before search/sort)
  const locFiltered = locFilter === 'all'
    ? devices
    : devices.filter(d => d.location === locFilter)

  const osList = [...new Set(locFiltered.map(d => d.os).filter(Boolean))].sort()

  const filtered = locFiltered
    .filter(d => {
      const q = search.toLowerCase()
      if (q && !d.ip.includes(q) && !d.hostname.toLowerCase().includes(q) && !d.mac.toLowerCase().includes(q) && !(d.firewalla_name?.toLowerCase() ?? '').includes(q)) return false
      if (osFilter && d.os !== osFilter) return false
      if (newOnly && d.status !== 'NEW') return false
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

  // Stats derived from the location-filtered set
  const summaryCards = [
    { label: 'Active Devices', value: health && locFilter === 'all' ? health.device_count : locFiltered.length, icon: '🖥️',  accent: 'text-a-green' },
    { label: 'New This Week',  value: newCount,            icon: '✨',  accent: 'text-a-teal'  },
    { label: 'Open Anomalies', value: openAnoms.filter(a => locFilter === 'all' || locFiltered.some(d => d.ip === a.device_id)).length, icon: '⚠️', accent: openAnoms.length > 0 ? 'text-a-red' : 'text-a-green' },
    { label: 'Last Scan', value: fmtDate(health?.last_scan?.finished_at), icon: '🔍', accent: 'text-a-muted', small: true },
  ]

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  // When "all", group devices by location for display
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

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-mono">
      <header className="sticky top-0 z-10 bg-a-surface/95 backdrop-blur border-b border-a-border px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-a-teal font-bold text-sm tracking-wide">🛡️ ARGUS</span>
          <span className="text-a-border">|</span>
          <span className="text-xs text-a-muted">
            {health?.status === 'ok'
              ? <><span className="inline-block w-1.5 h-1.5 rounded-full bg-a-green mr-1.5 align-middle pulse-dot" />Online</>
              : loading ? 'Connecting…'
              : <><span className="inline-block w-1.5 h-1.5 rounded-full bg-a-red mr-1.5 align-middle" />Offline</>
            }
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/report" className="text-xs text-a-muted hover:text-a-teal transition-colors">
            Weekly Report →
          </Link>
          {scanMsg && (
            <span className={`text-xs ${scanState === 'error' ? 'text-a-red' : scanState === 'done' ? 'text-a-green' : 'text-a-amber'}`}>
              {scanMsg}
            </span>
          )}
          <button
            onClick={handleTriggerScan}
            disabled={scanState === 'running'}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-a-teal/10 hover:bg-a-teal/20 border border-a-teal/40 text-a-teal text-xs font-semibold rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
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
            <div className="mb-6 border border-a-red/40 bg-a-red/5 text-a-red rounded px-4 py-3 text-sm">
              ⚠ Could not reach Argus API: {error}
            </div>
          )}

          {/* Summary Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            {summaryCards.map(c => (
              <div key={c.label} className="bg-a-surface border border-a-border rounded-lg px-5 py-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] text-a-muted uppercase tracking-wider">{c.label}</span>
                  <span className="text-base">{c.icon}</span>
                </div>
                <div className={`font-semibold ${c.small ? 'text-sm' : 'text-2xl'} ${c.accent}`}>
                  {typeof c.value === 'number' ? c.value.toLocaleString() : c.value}
                </div>
              </div>
            ))}
          </div>

          {/* Open Anomalies */}
          {openAnoms.length > 0 && (
            <div className="mb-8">
              <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-3">Open Anomalies</h2>
              <div className="space-y-2">
                {openAnoms.slice(0, 5).map(a => (
                  <div
                    key={a.id}
                    className={`flex items-start gap-3 border rounded px-4 py-3 text-sm ${
                      a.severity === 'high'   ? 'border-a-red/40   bg-a-red/5   text-a-red'
                    : a.severity === 'medium' ? 'border-a-amber/40 bg-a-amber/5 text-a-amber'
                    :                          'border-a-border/40 bg-a-surface  text-a-muted'
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

          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 mb-4">
            {/* Location filter */}
            <div className="flex items-center gap-1 bg-a-surface border border-a-border rounded-lg p-1">
              {(['all', 'MSP', 'PHX', 'CBN'] as LocationFilter[]).map(loc => (
                <button
                  key={loc}
                  onClick={() => { setLocFilter(loc); setPage(0) }}
                  className={`px-3 py-1 text-xs font-semibold rounded transition-colors ${
                    locFilter === loc
                      ? 'bg-a-teal/20 text-a-teal border border-a-teal/40'
                      : 'text-a-muted hover:text-a-text'
                  }`}
                >
                  {loc === 'all' ? 'All' : `${LOC_CONFIG[loc]?.dot} ${LOC_CONFIG[loc]?.btn ?? loc}`}
                </button>
              ))}
            </div>

            {/* Search */}
            <input
              type="text"
              placeholder="Search IP, hostname, MAC…"
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(0) }}
              className="flex-1 min-w-40 bg-a-surface border border-a-border rounded px-3 py-1.5 text-xs text-a-text placeholder-a-muted focus:outline-none focus:border-a-teal"
            />

            {/* OS filter */}
            {osList.length > 0 && (
              <select
                value={osFilter}
                onChange={e => { setOsFilter(e.target.value); setPage(0) }}
                className="bg-a-surface border border-a-border rounded px-2 py-1.5 text-xs text-a-muted focus:outline-none focus:border-a-teal"
              >
                <option value="">All OS</option>
                {osList.map(os => <option key={os} value={os}>{os}</option>)}
              </select>
            )}

            {/* New only toggle */}
            <label className="flex items-center gap-1.5 text-xs text-a-muted cursor-pointer select-none">
              <input
                type="checkbox"
                checked={newOnly}
                onChange={e => { setNewOnly(e.target.checked); setPage(0) }}
                className="accent-a-teal"
              />
              New only
            </label>

            <span className="ml-auto text-xs text-a-muted">{filtered.length} device{filtered.length !== 1 ? 's' : ''}</span>
          </div>

          {/* Device Table */}
          {loading ? (
            <div className="flex items-center justify-center py-16 text-a-muted text-sm">
              <span className="animate-spin-fast mr-2">◌</span>Loading…
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16 text-a-muted text-sm">
              No devices match the current filters.
              {locFilter !== 'all' && (
                <div className="mt-2">
                  <button
                    onClick={() => { setLocFilter('all'); setPage(0) }}
                    className="text-a-teal underline hover:no-underline"
                  >
                    Show all locations
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="bg-a-surface border border-a-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-a-border text-a-muted">
                    <th
                      className="text-left px-4 py-3 text-[10px] uppercase tracking-wider cursor-pointer hover:text-a-text select-none"
                      onClick={() => toggleSort('ip')}
                    >IP <SortArrow k="ip" /></th>
                    <th
                      className="text-left px-4 py-3 text-[10px] uppercase tracking-wider cursor-pointer hover:text-a-text select-none"
                      onClick={() => toggleSort('hostname')}
                    >Hostname <SortArrow k="hostname" /></th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider">MAC</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider">Location</th>
                    <th
                      className="text-left px-4 py-3 text-[10px] uppercase tracking-wider cursor-pointer hover:text-a-text select-none"
                      onClick={() => toggleSort('status')}
                    >Status <SortArrow k="status" /></th>
                    <th
                      className="text-left px-4 py-3 text-[10px] uppercase tracking-wider cursor-pointer hover:text-a-text select-none hidden lg:table-cell"
                      onClick={() => toggleSort('last_seen')}
                    >Last Seen <SortArrow k="last_seen" /></th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider hidden xl:table-cell">Ports</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.map(({ loc, rows }) => (
                    <>
                      {loc && locFilter === 'all' && (
                        <tr key={`header-${loc}`}>
                          <td colSpan={7} className={`px-4 py-2 text-[10px] text-a-muted uppercase tracking-widest border-b border-a-border/60 border-l-2 ${LOC_CONFIG[loc]?.border ?? 'border-l-a-border'}`}>
                            {LOC_CONFIG[loc]?.dot ?? '📍'} {LOC_CONFIG[loc]?.label ?? loc} ({rows.length} shown)
                          </td>
                        </tr>
                      )}
                      {rows.map((d, i) => (
                        <tr
                          key={d.mac || d.ip}
                          className={`border-b border-a-border/40 hover:bg-a-border/20 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-a-bg/30'}`}
                          onClick={() => window.location.href = `/device?mac=${encodeURIComponent(d.mac)}`}
                        >
                          <td className="px-4 py-3 text-a-teal font-medium">{d.ip}</td>
                          <td className="px-4 py-3 text-a-text">
                            {d.hostname ? d.hostname
                             : d.firewalla_name ? (
                                <span className="flex flex-col gap-0.5">
                                  <span className="flex items-center gap-1">
                                    <span className="text-[10px] font-semibold px-1 py-0.5 border rounded border-orange-400/40 bg-orange-400/10 text-orange-400 shrink-0">FW</span>
                                    {d.firewalla_name}
                                  </span>
                                  {d.manufacturer && <span className="text-a-muted text-[10px]">{d.manufacturer}</span>}
                                </span>
                              ) : <span className="text-a-muted italic">unknown</span>
                            }
                          </td>
                          <td className="px-4 py-3 text-a-muted">{d.mac}</td>
                          <td className="px-4 py-3">
                            {d.location ? <LocationBadge location={d.location} /> : <span className="text-a-muted">—</span>}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                          <td className="px-4 py-3 text-a-muted hidden lg:table-cell">{fmtDate(d.last_seen)}</td>
                          <td className="px-4 py-3 text-a-muted hidden xl:table-cell">
                            {d.open_ports.length > 0
                              ? <span className="text-a-teal">{d.open_ports.slice(0, 5).join(', ')}{d.open_ports.length > 5 ? `…+${d.open_ports.length - 5}` : ''}</span>
                              : '—'
                            }
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
            <div className="flex items-center justify-center gap-2 mt-4">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="px-3 py-1 text-xs border border-a-border rounded text-a-muted hover:text-a-text disabled:opacity-30"
              >
                ← Prev
              </button>
              <span className="text-xs text-a-muted">{page + 1} / {pageCount}</span>
              <button
                onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                disabled={page === pageCount - 1}
                className="px-3 py-1 text-xs border border-a-border rounded text-a-muted hover:text-a-text disabled:opacity-30"
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
