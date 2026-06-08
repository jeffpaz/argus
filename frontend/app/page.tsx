'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  getHealth, getDevices, getAnomalies, triggerScan,
  fmtDate, type HealthStatus, type Device, type Anomaly,
} from '@/lib/argus'

type SortKey = 'ip' | 'hostname' | 'last_seen' | 'status'
type SortDir = 'asc' | 'desc'
type ScanState = 'idle' | 'running' | 'done' | 'error'

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

export default function DashboardPage() {
  const [health,    setHealth]    = useState<HealthStatus | null>(null)
  const [devices,   setDevices]   = useState<Device[]>([])
  const [anomalies, setAnomalies] = useState<Anomaly[]>([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')

  const [search,   setSearch]   = useState('')
  const [osFilter, setOsFilter] = useState('')
  const [newOnly,  setNewOnly]  = useState(false)
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

  async function handleTriggerScan() {
    setScanState('running')
    setScanMsg('Scan triggered…')
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

  const osList = [...new Set(devices.map(d => d.os).filter(Boolean))].sort()

  const filtered = devices
    .filter(d => {
      const q = search.toLowerCase()
      if (q && !d.ip.includes(q) && !d.hostname.toLowerCase().includes(q) && !d.mac.toLowerCase().includes(q)) return false
      if (osFilter && d.os !== osFilter) return false
      if (newOnly && d.status !== 'NEW') return false
      return true
    })
    .sort((a, b) => {
      let cmp = 0
      if (sortKey === 'ip')       cmp = sortIp(a.ip).localeCompare(sortIp(b.ip))
      if (sortKey === 'hostname') cmp = a.hostname.localeCompare(b.hostname)
      if (sortKey === 'last_seen') cmp = a.last_seen.localeCompare(b.last_seen)
      if (sortKey === 'status')   cmp = a.status.localeCompare(b.status)
      return sortDir === 'asc' ? cmp : -cmp
    })

  const pageCount  = Math.ceil(filtered.length / PAGE_SIZE)
  const pageSlice  = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE)
  const openAnoms  = anomalies.filter(a => !a.resolved)
  const newCount   = newThisWeek(devices)

  const summaryCards = [
    { label: 'Active Devices', value: health?.device_count ?? devices.length, icon: '🖥️',  accent: 'text-a-green' },
    { label: 'New This Week',  value: newCount,               icon: '✨',  accent: 'text-a-teal'  },
    { label: 'Open Anomalies', value: openAnoms.length,        icon: '⚠️',  accent: openAnoms.length > 0 ? 'text-a-red' : 'text-a-green' },
    { label: 'Last Scan',      value: fmtDate(health?.last_scan?.finished_at), icon: '🔍', accent: 'text-a-muted', small: true },
  ]

  const SortArrow = ({ k }: { k: SortKey }) =>
    sortKey === k ? <span className="ml-1 opacity-60">{sortDir === 'asc' ? '↑' : '↓'}</span> : null

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-mono">
      {/* Header */}
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
                  <span>{a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🔵'}</span>
                  <div className="min-w-0">
                    <span className="font-semibold uppercase text-[10px] tracking-wide mr-2">{a.type}</span>
                    <span className="text-a-text">{a.description}</span>
                    <div className="text-[10px] text-a-muted mt-0.5">{fmtDate(a.created_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-4">
          <input
            type="text"
            placeholder="Search IP, hostname, MAC…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(0) }}
            className="bg-a-surface border border-a-border rounded px-3 py-1.5 text-xs text-a-text placeholder-a-muted focus:outline-none focus:border-a-teal/60 w-56"
          />
          {osList.length > 0 && (
            <select
              value={osFilter}
              onChange={e => { setOsFilter(e.target.value); setPage(0) }}
              className="bg-a-surface border border-a-border rounded px-3 py-1.5 text-xs text-a-text focus:outline-none focus:border-a-teal/60"
            >
              <option value="">All OS</option>
              {osList.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          )}
          <label className="flex items-center gap-2 text-xs text-a-muted cursor-pointer">
            <input
              type="checkbox"
              checked={newOnly}
              onChange={e => { setNewOnly(e.target.checked); setPage(0) }}
              className="accent-teal-400"
            />
            New only
          </label>
          <span className="ml-auto text-xs text-a-muted self-center">
            {filtered.length} device{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Device Table */}
        {loading ? (
          <div className="bg-a-surface border border-a-border rounded-lg px-6 py-12 text-center text-a-muted text-sm">
            <span className="animate-spin-fast inline-block mr-2">◌</span>Loading devices…
          </div>
        ) : filtered.length === 0 ? (
          <div className="bg-a-surface border border-a-border rounded-lg px-6 py-12 text-center text-a-muted text-sm">
            No devices found.
          </div>
        ) : (
          <>
            <div className="bg-a-surface border border-a-border rounded-lg overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-a-border text-a-muted">
                    {([ ['ip','IP'], ['hostname','Hostname'], ['last_seen','Last Seen'], ['status','Status'] ] as [SortKey, string][]).map(([k, label]) => (
                      <th
                        key={k}
                        onClick={() => toggleSort(k)}
                        className="text-left px-4 py-3 cursor-pointer hover:text-a-text select-none uppercase tracking-wider text-[10px]"
                      >
                        {label}<SortArrow k={k} />
                      </th>
                    ))}
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider">MAC</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider">OS</th>
                    <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider">Ports</th>
                  </tr>
                </thead>
                <tbody>
                  {pageSlice.map((d, i) => (
                    <tr
                      key={d.mac}
                      className={`border-b border-a-border/40 hover:bg-a-border/20 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-a-bg/30'}`}
                      onClick={() => window.location.href = `/device?mac=${encodeURIComponent(d.mac)}`}
                    >
                      <td className="px-4 py-3 text-a-teal font-medium">{d.ip}</td>
                      <td className="px-4 py-3 text-a-text">{d.hostname || <span className="text-a-muted italic">unknown</span>}</td>
                      <td className="px-4 py-3 text-a-muted">{fmtDate(d.last_seen)}</td>
                      <td className="px-4 py-3"><StatusBadge status={d.status} /></td>
                      <td className="px-4 py-3 text-a-muted">{d.mac}</td>
                      <td className="px-4 py-3 text-a-muted max-w-[160px] truncate" title={d.os}>{d.os || '—'}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {d.open_ports.slice(0, 6).map(p => (
                            <span key={p} className="px-1.5 py-0.5 bg-a-border/40 rounded text-[10px] text-a-muted">{p}</span>
                          ))}
                          {d.open_ports.length > 6 && (
                            <span className="text-[10px] text-a-muted">+{d.open_ports.length - 6}</span>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {pageCount > 1 && (
              <div className="flex items-center justify-between mt-4 text-xs text-a-muted">
                <span>Page {page + 1} of {pageCount}</span>
                <div className="flex gap-2">
                  <button
                    disabled={page === 0}
                    onClick={() => setPage(p => p - 1)}
                    className="px-3 py-1.5 border border-a-border rounded hover:border-a-teal/40 hover:text-a-teal disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >← Prev</button>
                  <button
                    disabled={page >= pageCount - 1}
                    onClick={() => setPage(p => p + 1)}
                    className="px-3 py-1.5 border border-a-border rounded hover:border-a-teal/40 hover:text-a-teal disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >Next →</button>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
