'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getDeviceDetail, getDevicePortHistory, getDeviceAnomalies, getDeviceUptime,
  getDeviceBandwidthHistory, getDeviceDnsAnomalies, getIdentityDnsAnomalies,
  getIdentityDetail, getIdentityBandwidth, getIdentityUptime,
  getLifecycleEvents, getDeviceCves, resolveCve,
  fmtDate, fmtBytes, timeAgo,
  type DeviceDetail, type DeviceIdentity, type PortScanSnapshot, type Anomaly,
  type PortInfo, type UptimeDetail, type DeviceBandwidthPoint, type DnsAnomaly,
  type MacObservation, type LifecycleEvent, type CveMatch,
} from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'
import {
  AreaChart, Area, XAxis, YAxis, Tooltip as ReTooltip,
  ResponsiveContainer, CartesianGrid,
} from 'recharts'

const DEVICE_TYPE_ICONS: Record<string, string> = {
  'Mac': '💻', 'iOS Device': '📱', 'Android Device': '📱',
  'Router / Firewall': '🔥', 'Network Device': '📡', 'Security Camera': '📷',
  'Smart Speaker': '🔊', 'Thermostat': '🌡️', 'Streaming / TV': '📺',
  'Printer': '🖨️', 'NAS': '🗄️', 'Gaming Console': '🎮',
  'Linux / SBC': '🐧', 'Linux Device': '🐧', 'Windows PC': '🪟',
  'Laptop': '💻', 'Apple Device': '🍎', 'Smart Home Device': '🏠',
}

const LC_PILL: Record<string, string> = {
  active: 'bg-green-50 text-green-700 border-green-200',
  idle:   'bg-amber-50 text-amber-700 border-amber-200',
  stale:  'bg-orange-50 text-orange-600 border-orange-200',
  gone:   'bg-red-50 text-red-600 border-red-200',
  guest:  'bg-purple-50 text-purple-600 border-purple-200',
}

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-700 text-white',
  high:     'bg-red-500 text-white',
  medium:   'bg-amber-500 text-white',
  low:      'bg-gray-400 text-white',
}

const BW_DL: Record<string, string> = { MSP: '#3B82F6', PHX: '#F97316', CBN: '#22C55E' }
const BW_UL: Record<string, string> = { MSP: '#93C5FD', PHX: '#FED7AA', CBN: '#86EFAC' }

function fmtHour(ts: string) {
  const d = new Date(ts)
  const mo = d.toLocaleString('en-US', { month: 'short', day: 'numeric' })
  const h = d.getHours()
  const ampm = h >= 12 ? 'PM' : 'AM'
  return `${mo} ${h % 12 || 12}${ampm}`
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
  const identityId = searchParams.get('identity_id') ?? ''
  const macParam   = searchParams.get('mac') ?? ''

  const [device,        setDevice]        = useState<DeviceDetail | DeviceIdentity | null>(null)
  const [macHistory,    setMacHistory]    = useState<MacObservation[]>([])
  const [history,       setHistory]       = useState<PortScanSnapshot[]>([])
  const [anomalies,     setAnomalies]     = useState<Anomaly[]>([])
  const [uptime,        setUptime]        = useState<UptimeDetail | null>(null)
  const [bwHistory,     setBwHistory]     = useState<DeviceBandwidthPoint[]>([])
  const [dnsAnomalies,  setDnsAnomalies]  = useState<DnsAnomaly[]>([])
  const [lcEvents,      setLcEvents]      = useState<LifecycleEvent[]>([])
  const [cves,          setCves]          = useState<CveMatch[]>([])
  const [loading,       setLoading]       = useState(true)
  const [error,         setError]         = useState('')

  useEffect(() => {
    if (!identityId && !macParam) return

    if (identityId) {
      // Identity-based fetch
      Promise.allSettled([
        getIdentityDetail(identityId),
        getIdentityBandwidth(identityId, 48),
        getIdentityUptime(identityId),
        getLifecycleEvents(identityId, 20),
        getDeviceCves(identityId),
        getIdentityDnsAnomalies(identityId, 50),
      ]).then(([d, bw, u, lc, cv, dns]) => {
        // Chained (not fire-and-forget) so `finally` below waits for it too —
        // otherwise the loading spinner clears before Port History/Anomaly
        // Log actually have data, and they briefly render empty.
        let portAnomalyPromise: Promise<void> | undefined
        if (d.status === 'fulfilled') {
          setDevice(d.value)
          setMacHistory(d.value.mac_history ?? [])
          // Fetch port history + anomalies using current MAC
          const currentMac = d.value.current_mac ?? ''
          if (currentMac) {
            portAnomalyPromise = Promise.allSettled([
              getDevicePortHistory(currentMac),
              getDeviceAnomalies(currentMac),
            ]).then(([h, a]) => {
              if (h.status === 'fulfilled') setHistory(h.value.slice(0, 20))
              if (a.status === 'fulfilled') setAnomalies(a.value)
            })
          }
        } else {
          setError(String(d.reason))
        }
        if (bw.status === 'fulfilled')  setBwHistory(bw.value)
        if (u.status === 'fulfilled')   setUptime(u.value)
        if (lc.status === 'fulfilled')  setLcEvents(lc.value)
        if (cv.status === 'fulfilled')  setCves(cv.value)
        if (dns.status === 'fulfilled') setDnsAnomalies(dns.value)
        return portAnomalyPromise
      }).finally(() => setLoading(false))
    } else {
      // Legacy MAC-based fetch
      Promise.allSettled([
        getDeviceDetail(macParam),
        getDevicePortHistory(macParam),
        getDeviceAnomalies(macParam),
        getDeviceUptime(macParam),
        getDeviceBandwidthHistory(macParam, 48),
        getDeviceDnsAnomalies(macParam, 20),
      ]).then(([d, h, a, u, bw, dns]) => {
        if (d.status === 'fulfilled')   setDevice(d.value)
        if (h.status === 'fulfilled')   setHistory(h.value.slice(0, 20))
        if (a.status === 'fulfilled')   setAnomalies(a.value)
        if (u.status === 'fulfilled')   setUptime(u.value)
        if (bw.status === 'fulfilled')  setBwHistory(bw.value)
        if (dns.status === 'fulfilled') setDnsAnomalies(dns.value)
        if (d.status === 'rejected')    setError(String(d.reason))
      }).finally(() => setLoading(false))
    }
  }, [identityId, macParam])

  if (!identityId && !macParam) return (
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
  ;('open_port_details' in device ? device.open_port_details : undefined)?.forEach((p: PortInfo) => { portDetailMap[p.port] = p })

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
              {('display_name' in device ? device.display_name : null) || device.hostname || device.firewalla_name || device.ip}
              {!device.hostname && device.firewalla_name && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 border rounded border-indigo-200 bg-indigo-50 text-indigo-600">FW</span>
              )}
              {onlineDot}
              <OsAccuracyBadge accuracy={device.os_accuracy} />
            </h1>
            <div className="text-xs text-a-muted mt-1 flex flex-wrap items-center gap-x-4 gap-y-1">
              <span className="text-indigo-600 font-medium font-mono">{device.ip}</span>
              <span className="font-mono">{device.mac}</span>
              {device.mac_randomized && (
                <span className="inline-block px-1.5 py-0.5 text-[10px] font-semibold border rounded border-amber-300 bg-amber-50 text-amber-700">
                  Private Address
                </span>
              )}
              {!device.mac_randomized && (device.vendor || device.manufacturer) && (
                <span>{device.vendor || device.manufacturer}</span>
              )}
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

      {/* Lifecycle */}
      {'lifecycle_state' in device && device.lifecycle_state && (
        <div className="bg-a-surface border border-a-border rounded-lg px-6 py-4 mb-6">
          <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-3">Device Lifecycle</h2>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className={`inline-block px-2.5 py-1 text-[11px] font-semibold border rounded-full uppercase tracking-wider ${LC_PILL[device.lifecycle_state] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>
              {device.lifecycle_state}
            </span>
            {device.is_guest ? (
              <span className="inline-block px-2.5 py-1 text-[11px] font-semibold border rounded-full uppercase tracking-wider bg-purple-50 text-purple-600 border-purple-200">
                Guest Device
              </span>
            ) : null}
          </div>
          {lcEvents.length > 0 && (
            <div className="space-y-1.5 max-h-40 overflow-y-auto">
              {lcEvents.map(ev => (
                <div key={ev.id} className="flex items-start gap-2 text-[11px]">
                  <span className="text-a-muted mt-0.5 shrink-0">{timeAgo(ev.timestamp)}</span>
                  <span className="text-gray-700">
                    <span className="font-medium">{ev.event}</span>
                    {ev.previous_state && ev.new_state && (
                      <span className="text-a-muted ml-1">{ev.previous_state} → {ev.new_state}</span>
                    )}
                    {ev.detail && <span className="text-a-muted ml-1">— {ev.detail}</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

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
            {(device.manufacturer || device.mac_randomized) && (
              <div>
                <div className="text-[10px] text-a-muted uppercase tracking-wider mb-1">Manufacturer</div>
                {device.mac_randomized ? (
                  <div className="text-a-muted italic">Unknown (Randomized MAC)</div>
                ) : (
                  <div className="text-a-text">{device.manufacturer}</div>
                )}
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

      {/* MAC History (identity layer — only shown when device has multiple MACs) */}
      {macHistory.length > 1 && (
        <div className="bg-a-surface border border-a-border rounded-lg px-6 py-4 mb-6">
          <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-3">MAC History</h2>
          <div className="space-y-2">
            {macHistory.map((obs) => (
              <div key={obs.mac} className="flex items-center justify-between text-xs gap-4">
                <div className="flex items-center gap-2">
                  {obs.is_current ? (
                    <span className="w-2 h-2 rounded-full bg-a-green shrink-0" title="Current MAC" />
                  ) : (
                    <span className="w-2 h-2 rounded-full bg-a-muted shrink-0" title="Previous MAC" />
                  )}
                  <span className={`font-mono ${obs.is_current ? 'font-bold text-a-text' : 'text-a-muted'}`}>{obs.mac}</span>
                  {obs.is_current && (
                    <span className="text-[10px] font-semibold px-1 py-0.5 rounded bg-a-green/10 text-a-green border border-a-green/30">current</span>
                  )}
                </div>
                <div className="text-a-muted text-right shrink-0">
                  <span>First: {fmtDate(obs.first_seen)}</span>
                  {obs.last_seen && <span className="ml-3">Last: {timeAgo(obs.last_seen)}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uptime Timeline */}
      {uptime && (
        <div className="mb-6">
          <UptimeTimeline uptime={uptime} />
        </div>
      )}

      {/* Bandwidth — Last 48h */}
      <div className="bg-a-surface border border-a-border rounded-lg p-5 mb-6">
        <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-4">📶 Bandwidth — Last 48h</h2>
        {bwHistory.length === 0 ? (
          <div className="text-a-muted text-xs">No bandwidth data collected yet.</div>
        ) : (() => {
          const loc = device?.location ?? ''
          const dl = BW_DL[loc] ?? '#9CA3AF'
          const ul = BW_UL[loc] ?? '#D1D5DB'
          return (
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={bwHistory} margin={{ top: 4, right: 8, left: -10, bottom: 0 }}>
                <defs>
                  <linearGradient id="bwDl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={dl} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={dl} stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="bwUl" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={ul} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={ul} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="timestamp" tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={fmtHour} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 9, fill: '#9CA3AF' }} tickFormatter={v => fmtBytes(v)} />
                <ReTooltip
                  contentStyle={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: unknown, name?: string | number) => [fmtBytes(Number(v)), name === 'bytes_in' ? '↓ Download' : '↑ Upload'] as [string, string]}
                  labelFormatter={(label: unknown) => fmtHour(String(label))}
                />
                <Area type="monotone" dataKey="bytes_in"  stroke={dl} fill="url(#bwDl)" strokeWidth={2} name="bytes_in"  dot={false} />
                <Area type="monotone" dataKey="bytes_out" stroke={ul} fill="url(#bwUl)" strokeWidth={2} name="bytes_out" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )
        })()}
        <div className="flex items-center gap-4 mt-2 pl-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-0.5 rounded" style={{ background: BW_DL[device?.location ?? ''] ?? '#9CA3AF' }} />
            <span className="text-[11px] text-a-muted">↓ Download</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-0.5 rounded" style={{ background: BW_UL[device?.location ?? ''] ?? '#D1D5DB' }} />
            <span className="text-[11px] text-a-muted">↑ Upload</span>
          </div>
        </div>
      </div>

      {/* DNS Activity */}
      <div className="bg-a-surface border border-a-border rounded-lg p-5 mb-6">
        <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-4">🔍 DNS Activity</h2>
        {dnsAnomalies.length === 0 ? (
          <div className="flex items-center gap-2 text-a-green text-sm">
            <span>✅</span>
            <span>No DNS anomalies detected for this device.</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-a-border text-a-muted">
                  <th className="text-left pb-2 text-[10px] uppercase tracking-wider">Time</th>
                  <th className="text-left pb-2 text-[10px] uppercase tracking-wider pl-3">Domain</th>
                  <th className="text-right pb-2 text-[10px] uppercase tracking-wider px-3">Queries</th>
                  <th className="text-left pb-2 text-[10px] uppercase tracking-wider">Reason</th>
                  <th className="text-center pb-2 text-[10px] uppercase tracking-wider w-8">Flag</th>
                </tr>
              </thead>
              <tbody>
                {dnsAnomalies.map((a, i) => (
                  <tr key={a.id ?? i} className={`border-b border-a-border/40 ${a.flagged ? 'bg-red-50' : ''}`}>
                    <td className="py-2 pr-2 text-a-muted whitespace-nowrap" title={fmtDate(a.timestamp)}>
                      {timeAgo(a.timestamp)}
                    </td>
                    <td className="py-2 px-3 font-mono text-[10px] text-a-text max-w-[240px] truncate">{a.domain}</td>
                    <td className="py-2 px-3 text-a-muted text-right tabular-nums">{a.query_count}</td>
                    <td className="py-2 pr-3 text-a-muted text-[10px]">{a.flag_reason || '—'}</td>
                    <td className="py-2 text-center">{a.flagged ? <span title="Flagged">⚠️</span> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
        <div className="bg-a-surface border border-a-border rounded-lg p-5 mb-6">
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

      {/* CVE Vulnerabilities */}
      {identityId && (
        <div className="bg-a-surface border border-a-border rounded-lg p-5">
          <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-4">
            CVE Vulnerabilities
            {cves.length > 0 && (
              <span className="ml-2 px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px]">{cves.length}</span>
            )}
          </h2>
          {cves.length === 0 ? (
            <div className="flex items-center gap-2 text-a-green text-sm">
              <span>✅</span>
              <span>No known vulnerabilities detected for this device.</span>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-a-border text-a-muted">
                    <th className="text-left pb-2 text-[10px] uppercase tracking-wider">CVE ID</th>
                    <th className="text-left pb-2 text-[10px] uppercase tracking-wider pl-3">Service</th>
                    <th className="text-left pb-2 text-[10px] uppercase tracking-wider pl-3">CVSS</th>
                    <th className="text-left pb-2 text-[10px] uppercase tracking-wider pl-3">Severity</th>
                    <th className="text-left pb-2 text-[10px] uppercase tracking-wider pl-3">Published</th>
                    <th className="text-left pb-2 text-[10px] uppercase tracking-wider pl-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {cves.map(cve => (
                    <tr key={cve.id} className="border-b border-a-border/40">
                      <td className="py-2 pr-3">
                        {cve.reference_url ? (
                          <a href={cve.reference_url} target="_blank" rel="noopener noreferrer"
                            className="font-mono text-[11px] text-indigo-600 hover:underline">
                            {cve.cve_id}
                          </a>
                        ) : (
                          <span className="font-mono text-[11px] text-a-text">{cve.cve_id}</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-a-muted">
                        {cve.service}{cve.port ? `:${cve.port}` : ''}
                      </td>
                      <td className="py-2 px-3 font-semibold text-a-text">{cve.cvss_score?.toFixed(1)}</td>
                      <td className="py-2 px-3">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${SEV_BADGE[cve.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {cve.severity}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-a-muted text-[10px] font-mono whitespace-nowrap">
                        {cve.published_date ? cve.published_date.slice(0, 10) : '—'}
                      </td>
                      <td className="py-2 px-3">
                        <button
                          onClick={async () => {
                            const note = window.prompt('Resolution note (optional):')
                            if (note === null) return
                            await resolveCve(cve.id, note)
                            setCves(prev => prev.filter(c => c.id !== cve.id))
                          }}
                          className="px-2 py-1 text-[11px] border border-a-border rounded hover:bg-green-50 hover:text-green-600 text-a-muted transition-colors"
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
      )}
    </>
  )
}

export default function DevicePage() {
  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-900 font-bold text-sm tracking-tight">🛡️ Argus</Link>
            <span className="text-gray-200 select-none">|</span>
            <span className="text-gray-400 text-xs">Device Detail</span>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/guests" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">👥 Guests</Link>
            <Link href="/alerts" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">🔔 Alerts</Link>
            <Link href="/map" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">🗺️ Map</Link>
            <Link href="/" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">← Dashboard</Link>
          </div>
        </div>
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
