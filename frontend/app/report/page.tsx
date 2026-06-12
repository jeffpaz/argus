'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { getWeeklyReport, fmtDate, fmtBytes, type WeeklySummary } from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'

const PRINT_CSS = `
@media print {
  body { background: white !important; color: #111 !important; }
  header, .no-print { display: none !important; }
  * { border-color: #ccc !important; }
  [class*="bg-a-"] { background: white !important; }
  [class*="text-a-teal"], [class*="text-a-green"] { color: #0a7a5c !important; }
  [class*="text-a-red"]   { color: #c0392b !important; }
  [class*="text-a-amber"] { color: #b7770d !important; }
  [class*="text-a-muted"] { color: #555 !important; }
  [class*="text-a-text"]  { color: #111 !important; }
}
`

function SeverityBadge({ severity }: { severity: string }) {
  const cls = severity === 'high'   ? 'text-a-red   border-a-red/40   bg-a-red/10'
            : severity === 'medium' ? 'text-a-amber border-a-amber/40 bg-a-amber/10'
            :                        'text-a-muted border-a-border'
  return (
    <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border rounded uppercase tracking-wider ${cls}`}>
      {severity}
    </span>
  )
}

export default function ReportPage() {
  const [report,  setReport]  = useState<WeeklySummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [error,   setError]   = useState('')

  useEffect(() => {
    getWeeklyReport()
      .then(setReport)
      .catch(e => setError(String(e)))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      <style dangerouslySetInnerHTML={{ __html: PRINT_CSS }} />

      <header className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-indigo-600 text-sm transition-colors font-medium">← Dashboard</Link>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-gray-900 font-bold text-sm">🛡️ Argus</span>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-gray-400 text-xs">Weekly Report</span>
        </div>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-600 text-xs font-semibold rounded-lg transition-colors"
        >
          ↓ Download as PDF
        </button>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">
        <ErrorBoundary label="Weekly Report">
        {loading && (
          <div className="flex items-center justify-center min-h-[50vh] text-a-muted text-sm">
            <span className="animate-spin-fast mr-2">◌</span>Loading report…
          </div>
        )}

        {error && (
          <div className="border border-a-red/40 bg-a-red/5 text-a-red rounded px-4 py-3 text-sm mb-6">
            ⚠ Could not load report: {error}
          </div>
        )}

        {report && (
          <>
            {/* Report Header */}
            <div className="mb-8">
              <h1 className="text-xl font-bold text-a-text mb-1">Weekly Security Report</h1>
              <div className="text-xs text-a-muted">
                {report.period.start
                  ? `${fmtDate(report.period.start)} → ${fmtDate(report.period.end)}`
                  : fmtDate(report.generated_at)
                }
                <span className="ml-4 text-a-border">Generated {fmtDate(report.generated_at)}</span>
              </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
              {[
                { label: 'Active Devices', value: report.active_devices,         accent: 'text-a-green' },
                { label: 'New This Week',  value: report.new_devices.length,      accent: 'text-a-teal'  },
                { label: 'Open Anomalies', value: report.open_anomalies,          accent: report.open_anomalies > 0 ? 'text-a-red' : 'text-a-green' },
                { label: 'Recommendations',value: report.recommendations.length,  accent: 'text-a-amber' },
              ].map(c => (
                <div key={c.label} className="bg-a-surface border border-a-border rounded-lg px-5 py-4">
                  <div className="text-[10px] text-a-muted uppercase tracking-wider mb-2">{c.label}</div>
                  <div className={`text-2xl font-semibold ${c.accent}`}>{c.value}</div>
                </div>
              ))}
            </div>

            {/* New Devices */}
            {report.new_devices.length > 0 && (
              <section className="mb-8">
                <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-3">New Devices This Week</h2>
                <div className="bg-a-surface border border-a-border rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-a-border text-a-muted">
                        {['IP', 'Hostname', 'MAC', 'First Seen'].map(h => (
                          <th key={h} className="text-left px-4 py-3 text-[10px] uppercase tracking-wider">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {report.new_devices.map((d, i) => (
                        <tr
                          key={d.mac}
                          className={`border-b border-a-border/40 hover:bg-a-border/20 cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-a-bg/30'}`}
                          onClick={() => window.location.href = `/device?mac=${encodeURIComponent(d.mac)}`}
                        >
                          <td className="px-4 py-3 text-a-teal font-medium">{d.ip}</td>
                          <td className="px-4 py-3 text-a-text">{d.hostname || <span className="text-a-muted italic">unknown</span>}</td>
                          <td className="px-4 py-3 text-a-muted">{d.mac}</td>
                          <td className="px-4 py-3 text-a-muted">{fmtDate(d.first_seen)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            {/* Threat Events */}
            <section className="mb-8">
              <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-3">Threat Events</h2>
              {report.anomalies.length === 0 ? (
                <div className="bg-a-surface border border-a-green/30 rounded-lg px-5 py-4 text-a-green text-sm">
                  ✓ Clean week — no threat events detected.
                </div>
              ) : (
                <div className="space-y-2">
                  {report.anomalies.map(a => (
                    <div
                      key={a.id}
                      className={`flex items-start gap-3 border rounded px-4 py-3 text-sm ${
                        a.severity === 'high'   ? 'border-a-red/40   bg-a-red/5'
                      : a.severity === 'medium' ? 'border-a-amber/40 bg-a-amber/5'
                      :                          'border-a-border    bg-a-surface'
                      }`}
                    >
                      <span>{a.severity === 'high' ? '🔴' : a.severity === 'medium' ? '🟡' : '🔵'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-semibold uppercase text-[10px] tracking-wide text-a-text">{a.type}</span>
                          <SeverityBadge severity={a.severity} />
                          {a.resolved && <span className="text-[10px] text-a-muted uppercase">Resolved</span>}
                        </div>
                        <div className="text-xs text-a-muted mt-0.5">{a.description}</div>
                        <div className="text-[10px] text-a-muted mt-0.5">{fmtDate(a.created_at)}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Recommendations */}
            {report.recommendations.length > 0 && (
              <section>
                <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-3">Recommendations</h2>
                <div className="space-y-3">
                  {report.recommendations.map((r, i) => (
                    <div key={r.id} className="bg-a-surface border border-a-border rounded-lg px-5 py-4 flex gap-4">
                      <div className="text-a-teal font-bold text-sm w-6 flex-shrink-0 mt-0.5">
                        {r.icon || String(i + 1).padStart(2, '0')}
                      </div>
                      <div>
                        <div className="text-sm font-semibold text-a-text mb-1">{r.title}</div>
                        <div className="text-xs text-a-muted">{r.description}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
