'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import {
  getDeviceDetail, getDevicePortHistory, getDeviceAnomalies,
  fmtDate, type DeviceDetail, type PortScanSnapshot, type Anomaly, type PortInfo,
} from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'

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

function DeviceContent() {
  const searchParams = useSearchParams()
  const mac = searchParams.get('mac') ?? ''

  const [device,   setDevice]   = useState<DeviceDetail | null>(null)
  const [history,  setHistory]  = useState<PortScanSnapshot[]>([])
  const [anomalies,setAnomalies]= useState<Anomaly[]>([])
  const [loading,  setLoading]  = useState(true)
  const [error,    setError]    = useState('')

  useEffect(() => {
    if (!mac) return
    Promise.allSettled([
      getDeviceDetail(mac),
      getDevicePortHistory(mac),
      getDeviceAnomalies(mac),
    ]).then(([d, h, a]) => {
      if (d.status === 'fulfilled') setDevice(d.value)
      if (h.status === 'fulfilled') setHistory(h.value.slice(0, 20))
      if (a.status === 'fulfilled') setAnomalies(a.value)
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

  return (
    <>
      {/* Device Header */}
      <div className="bg-a-surface border border-a-border rounded-lg px-6 py-5 mb-6">
        <div className="flex items-start justify-between flex-wrap gap-4">
          <div>
            <h1 className="text-lg font-bold text-a-text flex items-center flex-wrap gap-2">
              {device.hostname || device.firewalla_name || device.ip}
              {!device.hostname && device.firewalla_name && (
                <span className="text-[10px] font-semibold px-1.5 py-0.5 border rounded border-orange-400/40 bg-orange-400/10 text-orange-400">FW</span>
              )}
              <OsAccuracyBadge accuracy={device.os_accuracy} />
            </h1>
            <div className="text-xs text-a-muted mt-1 space-x-4">
              <span className="text-a-teal font-medium">{device.ip}</span>
              <span>{device.mac}</span>
              {(device.vendor || device.manufacturer) && <span>{device.vendor || device.manufacturer}</span>}
            </div>
            {device.os && <div className="text-xs text-a-muted mt-1">{device.os}</div>}
          </div>
          <span className={`text-xs font-semibold uppercase tracking-wider px-2.5 py-1 border rounded ${statusColor} border-current/40 bg-current/5`}>
            {device.status}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-5 text-xs">
          {[
            { label: 'First Seen',  value: fmtDate(device.first_seen) },
            { label: 'Last Seen',   value: fmtDate(device.last_seen)  },
            { label: 'Open Ports',  value: device.open_ports.length   },
            { label: 'Anomalies',   value: anomalies.filter(a => !a.resolved).length },
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
        <div className="bg-a-surface border border-a-border border-l-4 border-l-orange-500/60 rounded-lg px-6 py-4 mb-6">
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
    <div className="min-h-screen bg-a-bg text-a-text font-mono">
      <header className="sticky top-0 z-10 bg-a-surface/95 backdrop-blur border-b border-a-border px-6 py-3 flex items-center gap-3">
        <Link href="/" className="text-a-muted hover:text-a-text text-sm transition-colors">← Dashboard</Link>
        <span className="text-a-border">|</span>
        <span className="text-a-teal font-semibold text-sm">🛡️ Argus</span>
        <span className="text-a-border">|</span>
        <span className="text-a-muted text-xs">Device Detail</span>
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
