'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  getLatestReport, listReports, generateReport,
  fmtDate,
  type EnhancedReport, type ReportHistoryEntry,
} from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'

function GradeBadge({ grade, score }: { grade: string; score: number }) {
  const cls =
    grade === 'A' ? 'bg-green-100 text-green-700 border-green-300' :
    grade === 'B' ? 'bg-teal-100 text-teal-700 border-teal-300' :
    grade === 'C' ? 'bg-yellow-100 text-yellow-700 border-yellow-300' :
    grade === 'D' ? 'bg-orange-100 text-orange-700 border-orange-300' :
                    'bg-red-100 text-red-700 border-red-300'
  return (
    <div className={`inline-flex flex-col items-center justify-center w-20 h-20 rounded-2xl border-2 ${cls}`}>
      <span className="text-3xl font-bold leading-none">{grade}</span>
      <span className="text-[11px] font-semibold mt-0.5">{score}/100</span>
    </div>
  )
}

function HistoryScore({ score, grade }: { score: number | null; grade: string | null }) {
  if (score === null || grade === null) return <span className="text-gray-400 text-xs">—</span>
  const color =
    grade === 'A' ? 'text-green-600' :
    grade === 'B' ? 'text-teal-600' :
    grade === 'C' ? 'text-yellow-600' :
    grade === 'D' ? 'text-orange-600' : 'text-red-600'
  return <span className={`text-xs font-bold ${color}`}>{grade} {score}</span>
}

export default function ReportPage() {
  const [report,      setReport]      = useState<EnhancedReport | null>(null)
  const [history,     setHistory]     = useState<ReportHistoryEntry[]>([])
  const [loading,     setLoading]     = useState(true)
  const [generating,  setGenerating]  = useState(false)
  const [error,       setError]       = useState('')
  const [genError,    setGenError]    = useState('')

  useEffect(() => {
    Promise.allSettled([getLatestReport(), listReports(20)]).then(([r, h]) => {
      if (r.status === 'fulfilled') setReport(r.value)
      else setError(String(r.reason))
      if (h.status === 'fulfilled') setHistory(h.value)
    }).finally(() => setLoading(false))
  }, [])

  async function handleGenerate() {
    setGenerating(true)
    setGenError('')
    try {
      await generateReport()
      const [r, h] = await Promise.all([getLatestReport(), listReports(20)])
      setReport(r)
      setHistory(h)
    } catch (e) {
      setGenError(String(e))
    } finally {
      setGenerating(false)
    }
  }

  function handleDownload() {
    if (!report?.html_content) return
    const blob = new Blob([report.html_content], { type: 'text/html' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `argus-report-${report.report_date}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  const s = report?.summary

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-500 hover:text-indigo-600 text-sm transition-colors font-medium">← Dashboard</Link>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-gray-900 font-bold text-sm">🛡️ Argus</span>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-gray-400 text-xs">Security Report</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
          >
            {generating ? <span className="animate-spin-fast">◌</span> : '⚡'}
            {generating ? 'Generating…' : 'Generate Now'}
          </button>
          {report?.html_content && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-3 py-1.5 bg-white hover:bg-indigo-50 border border-indigo-200 text-indigo-600 text-xs font-semibold rounded-lg transition-colors"
            >
              ↓ Download HTML
            </button>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8 flex gap-6">
        {/* ── Sidebar: history ─────────────────────────────── */}
        <aside className="w-52 shrink-0">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden sticky top-20">
            <div className="px-4 py-3 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Report History</span>
            </div>
            {history.length === 0 ? (
              <div className="px-4 py-3 text-xs text-gray-400">No reports yet</div>
            ) : (
              <ul className="divide-y divide-gray-100 max-h-[70vh] overflow-y-auto">
                {history.map(h => (
                  <li
                    key={h.report_date}
                    className={`px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      report?.report_date === h.report_date ? 'bg-indigo-50 border-l-2 border-indigo-400' : ''
                    }`}
                    onClick={async () => {
                      if (report?.report_date === h.report_date) return
                      const r = await getLatestReport()
                      setReport(r)
                    }}
                  >
                    <div className="text-xs font-semibold text-gray-700">{h.report_date}</div>
                    <div className="mt-0.5">
                      <HistoryScore score={h.health_score} grade={h.health_grade} />
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">{fmtDate(h.generated_at)}</div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* ── Main content ─────────────────────────────────── */}
        <div className="flex-1 min-w-0">
          <ErrorBoundary label="Security Report">
            {loading && (
              <div className="flex items-center justify-center min-h-[50vh] text-a-muted text-sm">
                <span className="animate-spin-fast mr-2">◌</span>Loading report…
              </div>
            )}

            {error && (
              <div className="border border-red-200 bg-red-50 text-red-700 rounded px-4 py-3 text-sm mb-6">
                ⚠ Could not load report: {error}
              </div>
            )}

            {genError && (
              <div className="border border-red-200 bg-red-50 text-red-700 rounded px-4 py-3 text-sm mb-6">
                ⚠ Generate failed: {genError}
              </div>
            )}

            {!loading && !report && !error && (
              <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4 text-center">
                <div className="text-5xl">📊</div>
                <p className="text-gray-500 text-sm">No report generated yet.</p>
                <button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg disabled:opacity-50"
                >
                  {generating ? 'Generating…' : 'Generate First Report'}
                </button>
              </div>
            )}

            {s && report && (
              <>
                {/* ── Health Score Header ── */}
                <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-6 mb-6 flex items-start gap-6">
                  <GradeBadge grade={s.health_grade} score={s.health_score} />
                  <div className="flex-1 min-w-0">
                    <h1 className="text-lg font-bold text-gray-900 mb-0.5">Security Health Score</h1>
                    <div className="text-xs text-gray-500 mb-3">
                      Week of {s.week} · Generated {fmtDate(report.generated_at)}
                    </div>
                    {s.health_deductions.length > 0 && (
                      <ul className="space-y-0.5 mb-2">
                        {s.health_deductions.map((d, i) => (
                          <li key={i} className="text-xs text-red-600 flex items-center gap-1.5">
                            <span>▼</span>{d}
                          </li>
                        ))}
                      </ul>
                    )}
                    {s.health_bonuses.length > 0 && (
                      <ul className="space-y-0.5">
                        {s.health_bonuses.map((b, i) => (
                          <li key={i} className="text-xs text-green-600 flex items-center gap-1.5">
                            <span>▲</span>{b}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                </div>

                {/* ── Summary Stats ── */}
                <div className="grid grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
                  {[
                    { label: 'Total Threats',   value: s.total_threats,        color: s.total_threats > 0 ? 'text-red-600' : 'text-green-600' },
                    { label: 'Unresolved',       value: s.unresolved_threats,   color: s.unresolved_threats > 0 ? 'text-red-600' : 'text-green-600' },
                    { label: 'Critical CVEs',    value: s.critical_cves,        color: s.critical_cves > 0 ? 'text-red-600' : 'text-green-600' },
                    { label: 'New Devices',      value: s.new_devices,          color: 'text-indigo-600' },
                    { label: 'VLAN Recs',        value: s.vlan_recommendations, color: s.vlan_recommendations > 0 ? 'text-amber-600' : 'text-green-600' },
                    { label: 'Outages',          value: s.outages,              color: s.outages > 0 ? 'text-red-600' : 'text-green-600' },
                  ].map(c => (
                    <div key={c.label} className="bg-white rounded-lg border border-gray-200 px-3 py-3">
                      <div className="text-[9px] text-gray-400 uppercase tracking-wider mb-1">{c.label}</div>
                      <div className={`text-xl font-bold ${c.color}`}>{c.value}</div>
                    </div>
                  ))}
                </div>

                {/* ── Full HTML Report ── */}
                {report.html_content && (
                  <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-3 border-b border-gray-100">
                      <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Full Report</span>
                    </div>
                    <iframe
                      srcDoc={report.html_content}
                      className="w-full border-0"
                      style={{ minHeight: '80vh' }}
                      onLoad={e => {
                        const iframe = e.currentTarget
                        const height = iframe.contentDocument?.body?.scrollHeight
                        if (height) iframe.style.height = `${height + 40}px`
                      }}
                      title="Weekly Security Report"
                    />
                  </div>
                )}
              </>
            )}
          </ErrorBoundary>
        </div>
      </main>
    </div>
  )
}
