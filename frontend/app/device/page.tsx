'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getDeviceDetail, getDevicePortHistory, getDeviceAnomalies, getDeviceUptime,
  fmtDate, fmtBytes, timeAgo,
  type DeviceDetail, type PortScanSnapshot, type Anomaly, type PortInfo, type UptimeDetail,
} from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'

const DEVICE_TYPE_ICONS: Record<string, string> = {
  'Mac': '💻', 'iOS Device': '📱', 'Android Device': '📱',
  'Router / Firewall': '🔥', 'Network Device': '📡', 'Security Camera': '📷',
  'Smart Speaker': '🔊', 'Thermostat': '🌡️', 'Streaming / TV': '📺',
  'Printer': '🖨️', 'NAS': '🗄️', 'Gaming Console': '🎮',
  'Linux / SBC': '🐧', 'Linux Device': '🐧', 'Windows PC': '🪟',
  'Laptop': '💻', 'Apple Device': '🍎', 'Smart Home Device': '🏠',
}

const HIGH_RISK_PORTS   = new Set([21, 23, 445, 3389, 135, 139])
const MEDIUM_RISK_PORTS = new Set([22, 3306, 5432, 6379, 27017, 5900])
const SAFE_PORTS        = new Set([80, 443, 8080, 8443])

function portRisk(port: number) {
  if (HIGH_RISK_PORTS.has(port))   return 'high'
  if (MEDIUM_RISK_PORTS.has(port)) return 'medium'
  if (SAFE_PORTS.has(port))        return 'safe'
  return 'neutral'
}

function OsAccuracyBadge({ accuracy }: { accuracy?: number }) {
  if (accuracy === undefined) return null
  const cls = accuracy >= 90 ? 'text-a-green border-a-green/40 bg-a-green/10'
            : accuracy >= 70 ? 'text-a-amber border-a-amber/40 bg-a-amber/10'
                             : 'text-a-muted border-a-border'
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border rounded uppercase tracking-wider ml-2 ${cls}`}>
      {accuracy}% conf.
    </span>
  )
}

function PortChip({ port, info }: { port: number; info?: PortInfo }) {
  const risk = portRisk(port)
  const cls  = risk === 'high'    ? 'border-a-red/40   bg-a-red/10   text-a-red'
             : risk === 'medium'  ? 'border-a-amber/40 bg-a-amber/10 text-a-amber'
             : risk === 'safe'    ? 'border-a-green/40 bg-a-green/10 text-a-green'
             :                     'border-a-border/40 bg-a-surface  text-a-muted'
  return (
    <div className={`border rounded px-3 py-2 text-xs ${cls}`}>
      <div className="font-semibold">{port}</div>
      {info?.service && <div className="text-[10px] opacity-70 mt-0.5">{info.service}</div>}
    </div>
  )
}

function UptimeTimeline({ uptime }: { uptime: UptimeDetail }) {
  const events = [...uptime.uptime_events].reverse() // oldest first
  const now = Date.now()
  const windowMs = 7 * 24 * 60 * 60 * 1000
  const start = now - windowMs

  // Build segments: [{from, to, online}]
  const segments: Array<{ from: number; to: number; online: boolean }> = []
  let cursor = start
  let curState = uptime.is_online

  // Work backwards through events to find initial state at window start
  const eventsInWindow = events.filter(e => new Date(e.timestamp).getTime() >= start)

  if (eventsInWindow.length === 0) {
    segments.push({ from: start, to: now, online: uptime.is_online })
  } else {
    // Initial state before first event in window
    const firstEventState = eventsInWindow[0].event === 'online' ? false : true
    let prevState = firstEventState

    for (const ev of eventsInWindow) {
      const evMs = new Date(ev.timestamp).getTime()
      segments.push({ from: cursor, to: evMs, online: prevState })
      cursor = evMs
      prevState = ev.event === 'online'
    }
    segments.push({ from: cursor, to: now, online: prevState })
  }

  const onlineMs = segments.filter(s => s.online).reduce((acc, s) => acc + (s.to - s.from), 0)
  const uptimePct = Math.round((onlineMs / windowMs) * 100 * 10) / 10

  return (
    <div className="bg-a-surface border border-a-border rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-[10px] text-a-muted uppercase tracking-wider">Uptime — Last 7 Days</h2>
        <span className={`text-xs font-semibold ${uptimePct >= 99 ? 'text-a-green' : uptimePct >= 90 ? 'text-a-amber' : 'text-a-red'}`}>
          {uptimePct}% uptime
        </span>
      </div>
      {/* Timeline bar */}
      <div className="flex h-5 rounded overflow-hidden border border-a-border/40 mb-3">
        {segments.map((seg, i) => {
          const pct = ((seg.to - seg.from) / windowMs) * 100
          return (
            <div
              key={i}
              style={{ width: `${pct}%` }}
              className={seg.online ? 'bg-a-green' : 'bg-a-border'}
              title={`${seg.online ? 'Online' : 'Offline'}: ${fmtDate(new Date(seg.from).toISOString())} – ${fmtDate(new Date(seg.to).toISOString())}`}
            />
          )
        })}
      </div>
      <div className="flex justify-between text-[10px] text-a-muted">
        <span>7 days ago</span>
        <span className="flex items-center gap-2">
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-a-green rounded-sm inline-block" /> Online</span>
          <span className="flex items-center gap-1"><span className="w-2 h-2 bg-a-border rounded-sm inline-block" /> Offline</span>
        </span>
        <span>Now</span>
      </div>
      {/* Recent events */}
      {uptime.uptime_events.length > 0 && (
        <div className="mt-4 space-y-1 max-h-32 overflow-y-auto">
          {uptime.uptime_events.slice(0, 10).map(ev => (
            <div key={ev.id} className="flex items-center gap-2 text-[10px]">
              <span className={ev.event === 'online' ? 'text-a-green' : 'text-a-muted'}>
                {ev.event === 'online' ? '▲ Online' : '▼ Offline'}
              </span>
              <span className="text-a-muted">{timeAgo(ev.timestamp)}</span>
              <span className="text-a-muted opacity-60">{fmtDate(ev.timestamp)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DeviceContent() {
  const searchParams = useSearchParams()
  const mac = searchParams.get('mac') ?? ''

  const [device,   setDevice]   = useState<DeviceDetail | null>(null)
  const [history,  setHistory]  = useState<PortScanSnapshot[]>([])
  const [anomalies,setAnomalies]= useState<Anomaly[]>([])
  const [uptime,   setUptime]   = useState<UptimeDetail | null>(null)
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!mac) return
    Promise.allSettled([
      getDeviceDetail(mac),
      getDevicePortHistory(mac),
      getDeviceAnomalies(mac),
      getDeviceUptime(mac),
    ]).then(([d, h, a, u]) => {
      if (d.status === 'fulfilled') setDevice(d.value)
      if (h.status === 'fulfilled') setHistory(h.value.slice(0, 20))
      if (a.status === 'fulfilled') setAnomalies(a.value)
      if (u.status === 'fulfilled') setUptime(u.value)
      if (d.status === 'rejected')  setError(String(d.reason))
    }).finally(() => setLoading(false))
  }, [mac])

  if (!mac) return (
    <div className="flex items-center justify-center min-h-[60vh] text-a-muted text-sm">
      No device selected. <Link href="/" className="ml-2 text-a-teal hover:underline">← Back to dashboard</Link>
    </div>
  )

  if (loading) return (
    <div className="flex items-center justify-center min-h-[60vh] text-a-muted text-sm">
      <span className="animate-spin-fast mr-2">◌</span>Loading device…
    </div>
  )

  if (error || !device) return (
    <div className="flex items-center justify-center min-h-[60vh] text-a-red text-sm">
      ⚠ {error || 'Device not found.'} <Link href="/" className="ml-3 text-a-teal hover:underline">← Dashboard</Link>
    </div>
  )

  const portDetailMap: Record<number, PortInfo> = {}
  device.open_port_details?.forEach(p => { portDetailMap[p.port] = p })

  const statusColor = device.status === 'NEW'     ? 'text-a-teal'
                    : device.status === 'CHANGED' ? 'text-a-amber'
                    :                              'text-a-green'

  const isOnline = device.is_online
  const onlineDot = isOnline === true
    ? <span className="inline-block w-2 h-2 rounded-full bg-a-green pulse-dot align-middle ml-2" title="Online" />
    : isOnline === false
    ? <span className="inline-block w-2 h-2 rounded-full bg-a-muted align-middle ml-2" title="Offline" />
    : null

  return (
    <>
      {/* Device Header */}
      <div className="bg-a-surface border border-a-border rounded-lg px-6 py-5 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-lg font-bold text-a-text flex items-center flex-wrap gap-2">
              {device.device_type && DEVICE_TYPE_ICONS[device.device_type] && (
                <span title={device.device_type}>{DEVICE_TYPE_ICONS[device.device_type]}</span>
              )}
              {device.hostname || device.firewalla_name || device.ip}
              {!device.hostname && device.firewalla_name && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 border rounded border-indigo-200 bg-indigo-50 text-indigo-600">FW</span>
              )}
              {onlineDot}
              <OsAccuracyBadge accuracy={device.os_accuracy} />
            </h1>
            <div className="text-xs text-a-muted mt-1 space-x-4">
              <span className="text-indigo-600 font-medium font-mono">{device.ip}</span>
              <span className="font-mono">{device.mac}</span>
              {(device.vendor || device.manufacturer) && <span>{device.vendor || device.manufacturer}</span>}
            </div>
            {device.os && <div className="text-xs text-a-muted mt-1">{device.os}</div>}
            {isOnline === false && device.downtime_since && (
              <div className="text-xs text-a-muted mt-1">
                Offline since {fmtDate(device.downtime_since)} ({timeAgo(device.downtime_since)})
              </div>
            )}
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 border rounded ${statusColor} border-current/40 bg-current/5`}>
            {device.status}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-5 text-xs">
          {[
            { label: 'First Seen',  value: fmtDate(device.first_seen) },
            { label: 'Last Seen',   value: timeAgo(device.last_seen)  },
            { label: 'Open Ports',  value: device.open_ports.length   },
            { label: 'Bandwidth ↓', value: fmtBytes(device.bytes_in_24h ?? 0)  },
            { label: 'Bandwidth ↑', value: fmtBytes(device.bytes_out_24h ?? 0) },
          ].map(({ label, value }) => (
            <div key={label}>
              <div className="text-[10px] text-a-muted uppercase tracking-wider mb-1">{label}</div>
              <div className="text-a-text font-medium">{value}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Firewalla Enrichment */}
      {(device.firewalla_name || device.manufacturer || device.device_type || device.firewalla_group) && (
        <div className="bg-a-surface border border-a-border border-l-4 border-l-indigo-500 rounded-lg px-6 py-4 mb-6">
          <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-3">🔥 Firewalla</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs">
            {device.firewalla_name && (
              <div>
                <div className="text-[10px] text-a-muted uppercase tracking-wider mb-1">Device Name</div>
                <div className="text-a-text font-medium">{device.firewalla_name}</div>
              </div>
            )}
            {device.manufacturer && (
              <div>
                <div className="text-[10px] text-a-muted uppercase tracking-wider mb-1">Manufacturer</div>
                <div className="text-a-text">{device.manufacturer}</div>
              </div>
            )}
            {device.device_type && (
              <div>
                <div className="text-[10px] text-a-muted uppercase tracking-wider mb-1">Type</div>
                <div className="text-a-text capitalize">{device.device_type}</div>
              </div>
            )}
            {device.firewalla_group && (
              <div>
                <div className="text-[10px] text-a-muted uppercase tracking-wider mb-1">Group</div>
                <div className="text-a-text">{device.firewalla_group}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Uptime Timeline */}
      {uptime && (
        <div className="mb-6">
          <UptimeTimeline uptime={uptime} />
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-6 mb-6">
        {/* Port History Timeline */}
        <div className="bg-a-surface border border-a-border rounded-lg p-5">
          <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-4">Port History</h2>
          {history.length === 0 ? (
            <p className="text-a-muted text-xs">No scan history available.</p>
          ) : (
            <div className="space-y-3 max-h-80 overflow-y-auto pr-1">
              {history.map((snap) => (
                <div key={snap.scan_id} className="border-l-2 border-a-border pl-3 text-xs">
                  <div className="text-a-muted text-[10px]">{fmtDate(snap.scanned_at)}</div>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(snap.added ?? []).map(p => (
                      <span key={p} className="px-1.5 py-0.5 bg-a-green/10 border border-a-green/30 text-a-green rounded text-[10px]">+{p}</span>
                    ))}
                    {(snap.removed ?? []).map(p => (
                      <span key={p} className="px-1.5 py-0.5 bg-a-red/10 border border-a-red/30 text-a-red rounded text-[10px]">−{p}</span>
                    ))}
                    {(snap.added ?? []).length === 0 && (snap.removed ?? []).length === 0 && (
                      <span className="text-a-muted text-[10px]">{snap.ports.length} ports, no change</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Open Ports Grid */}
        <div className="bg-a-surface border border-a-border rounded-lg p-5">
          <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-4">Open Ports</h2>
          {device.open_ports.length === 0 ? (
            <p className="text-a-muted text-xs">No open ports detected.</p>
          ) : (
            <div className="grid grid-cols-4 sm:grid-cols-5 gap-2">
              {device.open_ports.map(p => (
                <PortChip key={p} port={p} info={portDetailMap[p]} />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Anomaly Log */}
      {anomalies.length > 0 && (
        <div className="bg-a-surface border border-a-border rounded-lg p-5">
          <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-4">Anomaly Log</h2>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-a-border text-a-muted">
                <th className="text-left pb-2 text-[10px] uppercase tracking-wider">Type</th>
                <th className="text-left pb-2 text-[10px] uppercase tracking-wider">Description</th>
                <th className="text-left pb-2 text-[10px] uppercase tracking-wider">Severity</th>
                <th className="text-left pb-2 text-[10px] uppercase tracking-wider">When</th>
                <th className="text-left pb-2 text-[10px] uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody>
              {anomalies.map(a => (
                <tr key={a.id} className="border-b border-a-border/40">
                  <td className="py-2 pr-3 font-semibold uppercase text-[10px] tracking-wide text-a-text">{a.type}</td>
                  <td className="py-2 pr-3 text-a-muted">{a.description}</td>
                  <td className="py-2 pr-3">
                    <span className={`text-[10px] font-semibold uppercase ${
                      a.severity === 'high' ? 'text-a-red' : a.severity === 'medium' ? 'text-a-amber' : 'text-a-muted'
                    }`}>{a.severity}</span>
                  </td>
                  <td className="py-2 pr-3 text-a-muted">{fmtDate(a.created_at)}</td>
                  <td className="py-2">
                    <span className={`text-[10px] uppercase ${a.resolved ? 'text-a-muted' : 'text-a-amber'}`}>
                      {a.resolved ? 'Resolved' : 'Open'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )
}

export default function DevicePage() {
  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-3 shadow-sm">
        <Link href="/" className="text-gray-500 hover:text-indigo-600 text-sm transition-colors font-medium">← Dashboard</Link>
        <span className="text-gray-200 select-none">|</span>
        <span className="text-gray-900 font-bold text-sm">🛡️ Argus</span>
        <span className="text-gray-200 select-none">|</span>
        <span className="text-gray-400 text-xs">Device Detail</span>
      </header>
      <main className="max-w-5xl mx-auto px-6 py-8">
        <ErrorBoundary label="Device Detail">
          <Suspense fallback={
            <div className="flex items-center justify-center min-h-[60vh] text-a-muted text-sm">
              <span className="animate-spin-fast mr-2">◌</span>Loading…
            </div>
          }>
            <DeviceContent />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  )
}
