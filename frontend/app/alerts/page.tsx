'use client'

import { Fragment, useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import {
  getAlertRules, createAlertRule, updateAlertRule,
  deleteAlertRule, evaluateRules,
  getCveSummary, getCveMatches, resolveCve, triggerCveScan,
  getThreats, getOutageHistory, getVlanRecommendations, updateVlanRecommendation,
  runVlanAnalysis, getSslIssues, triggerSslScan,
  getGroupedAlerts, getAlertMutes, createAlertMute, deleteAlertMute,
  getIncidents, getIncidentDetail, updateIncident,
  fmtDate, timeAgo,
  type AlertRule, type AlertHistoryEntry, type CveSummary, type CveMatch,
  type Threat, type OutageEvent, type VlanRecommendation, type SslIssue,
  type AlertMute, type GroupedAlert, type Incident, type IncidentDetail,
} from '@/lib/argus'

const TRIGGER_LABELS: Record<string, string> = {
  threat:         'Threat Detected',
  new_device:     'New Device',
  device_offline: 'Device Offline',
  device_online:  'Device Online',
  bandwidth:      'Bandwidth Spike',
  dns_anomaly:    'DNS Anomaly',
  port_change:    'Port Change',
  scan_complete:  'Scan Complete',
}

const LOCATION_COLORS: Record<string, string> = {
  MSP: 'bg-blue-100 text-blue-700 border border-blue-200',
  PHX: 'bg-orange-100 text-orange-700 border border-orange-200',
  CBN: 'bg-green-100 text-green-700 border border-green-200',
}

const SEVERITY_OPTIONS = ['low', 'medium', 'high', 'critical']
const THREAT_TYPE_OPTIONS = [
  'malicious_ip', 'port_scan', 'cleartext',
  'unusual_hours', 'rogue_dhcp', 'internal_scan', 'dns_anomaly',
]
const PRIORITY_OPTIONS = ['min', 'low', 'default', 'high', 'urgent']

const BLANK_RULE: Partial<AlertRule> = {
  name: '',
  description: '',
  enabled: true,
  trigger_type: 'threat',
  filter_location: null,
  filter_severity: null,
  filter_threat_type: null,
  filter_device_type: null,
  threshold_bytes: null,
  active_hours_start: null,
  active_hours_end: null,
  ntfy_server: 'https://ntfy.sh',
  ntfy_topic: '',
  ntfy_priority: 'default',
  ntfy_tags: 'shield',
  cooldown_minutes: 60,
}

function LocationBadge({ location }: { location: string | null | undefined }) {
  if (!location) return <span className="text-gray-400">—</span>
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
      LOCATION_COLORS[location] ?? 'bg-gray-100 text-gray-600'
    }`}>
      {location}
    </span>
  )
}

function RuleBadge({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">
      <span className="text-gray-400">{label}:</span>{value}
    </span>
  )
}

function ToggleSwitch({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
        checked ? 'bg-indigo-600' : 'bg-gray-200'
      }`}
    >
      <span className={`inline-block h-4 w-4 rounded-full bg-white shadow-sm transform transition-transform mt-0.5 ${
        checked ? 'translate-x-4' : 'translate-x-0.5'
      }`} />
    </button>
  )
}

const SEV_BADGE: Record<string, string> = {
  critical: 'bg-red-700 text-white',
  high:     'bg-red-500 text-white',
  medium:   'bg-amber-500 text-white',
  low:      'bg-gray-400 text-white',
}

interface MuteTarget {
  device_identifier: string
  device_name: string
  trigger_type: string
  mute_all?: boolean
}

const INCIDENT_STATUS_FILTER_DEFAULT = 'open,monitoring'

const SEV_BORDER: Record<string, string> = {
  critical: 'border-l-[#DC2626]',
  high:     'border-l-[#EF4444]',
  medium:   'border-l-[#F59E0B]',
  low:      'border-l-[#6B7280]',
}

const THREAT_TYPE_LABELS: Record<string, string> = {
  malicious_ip:   'Malicious IP Contact',
  port_scan:      'Port Scan',
  cleartext:      'Cleartext Protocol',
  unusual_hours:  'Unusual Hours',
  ssl_cert_change:'Certificate Change',
  ssl_expired:    'Expired Certificate',
  ssl_self_signed:'Self-Signed Cert',
  dns_anomaly:    'DNS Anomaly',
  vulnerability:  'Vulnerability',
  rogue_dhcp:     'Rogue DHCP',
}

const SEV_DOT: Record<string, string> = {
  critical: 'bg-red-600',
  high:     'bg-red-400',
  medium:   'bg-amber-400',
  low:      'bg-gray-400',
}

export default function AlertsPage() {
  const [rules, setRules] = useState<AlertRule[]>([])
  const [grouped, setGrouped] = useState<GroupedAlert[]>([])
  const [mutes, setMutes] = useState<AlertMute[]>([])
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [editRule, setEditRule] = useState<Partial<AlertRule> | null>(null)
  const [editMode, setEditMode] = useState<'create' | 'edit'>('create')
  const [saving, setSaving] = useState(false)
  const [cveSummary, setCveSummary] = useState<CveSummary | null>(null)
  const [cves, setCves] = useState<CveMatch[]>([])
  const [cveFilter, setCveFilter] = useState<string>('all')
  const [cveScanning, setCveScanning] = useState(false)
  const [showResolvedCves, setShowResolvedCves] = useState(false)
  const [resolvedCves, setResolvedCves] = useState<CveMatch[]>([])
  const [cleartextThreats, setCleartextThreats] = useState<Threat[]>([])
  const [sslIssues, setSslIssues] = useState<SslIssue[]>([])
  const [sslScanning, setSslScanning] = useState(false)
  const [outages, setOutages] = useState<OutageEvent[]>([])
  const [vlanRecs, setVlanRecs] = useState<VlanRecommendation[]>([])
  const [vlanAnalyzing, setVlanAnalyzing] = useState(false)

  // Incidents state
  const [incidents, setIncidents] = useState<Incident[]>([])
  const [incidentFilter, setIncidentFilter] = useState<'all' | 'open' | 'monitoring' | 'resolved'>('open')
  const [expandedIncidents, setExpandedIncidents] = useState<Set<number>>(new Set())
  const [incidentTimelines, setIncidentTimelines] = useState<Record<number, IncidentDetail>>({})
  const [resolveTarget, setResolveTarget] = useState<Incident | null>(null)
  const [resolveNote, setResolveNote] = useState('')
  const [resolvingSaving, setResolvingSaving] = useState(false)

  // Mute modal state
  const [muteTarget, setMuteTarget] = useState<MuteTarget | null>(null)
  const [muteAll, setMuteAll] = useState(false)
  const [muteReason, setMuteReason] = useState('')
  const [muteExpiry, setMuteExpiry] = useState<'permanent' | '24h' | '7d' | '30d'>('permanent')
  const [muteSaving, setMuteSaving] = useState(false)

  const loadIncidents = useCallback(async (filter: string) => {
    const statusParam = filter === 'all' ? undefined : filter === 'open' ? 'open,monitoring' : filter
    const data = await getIncidents(statusParam, 50).catch(() => [] as Incident[])
    setIncidents(data)
  }, [])

  const load = useCallback(async () => {
    const [r, g, m, cs, cm, ct, ssl, outg, vlan, inc] = await Promise.allSettled([
      getAlertRules(), getGroupedAlerts(24), getAlertMutes(),
      getCveSummary(), getCveMatches({ resolved: false, limit: 100 }),
      getThreats(false, 100),
      getSslIssues(),
      getOutageHistory(30),
      getVlanRecommendations(undefined, 'open'),
      getIncidents('open,monitoring', 50),
    ])
    if (r.status === 'fulfilled') setRules(r.value)
    if (g.status === 'fulfilled') setGrouped(g.value)
    if (m.status === 'fulfilled') setMutes(m.value)
    if (cs.status === 'fulfilled') setCveSummary(cs.value)
    if (cm.status === 'fulfilled') setCves(cm.value)
    if (ct.status === 'fulfilled') setCleartextThreats(ct.value.filter(t => t.threat_type === 'cleartext'))
    if (ssl.status === 'fulfilled') setSslIssues(ssl.value)
    if (outg.status === 'fulfilled') setOutages(outg.value)
    if (vlan.status === 'fulfilled') setVlanRecs(vlan.value)
    if (inc.status === 'fulfilled') setIncidents(inc.value)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    const id = setInterval(() => {
      getGroupedAlerts(24).then(setGrouped).catch(() => {})
      getAlertMutes().then(setMutes).catch(() => {})
    }, 60_000)
    return () => clearInterval(id)
  }, [])

  function toggleExpand(key: string) {
    setExpandedKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

  function openMute(target: MuteTarget) {
    setMuteTarget(target)
    setMuteAll(target.mute_all ?? false)
    setMuteReason('')
    setMuteExpiry('permanent')
  }

  function calcExpiresAt(expiry: 'permanent' | '24h' | '7d' | '30d'): string | null {
    if (expiry === 'permanent') return null
    const now = new Date()
    if (expiry === '24h') now.setHours(now.getHours() + 24)
    else if (expiry === '7d') now.setDate(now.getDate() + 7)
    else if (expiry === '30d') now.setDate(now.getDate() + 30)
    return now.toISOString().replace('T', ' ').slice(0, 19)
  }

  async function handleMuteConfirm() {
    if (!muteTarget) return
    setMuteSaving(true)
    try {
      await createAlertMute({
        device_identifier: muteTarget.device_identifier,
        alert_type: muteAll ? '*' : muteTarget.trigger_type,
        reason: muteReason || undefined,
        expires_at: calcExpiresAt(muteExpiry),
      })
      const updated = await getAlertMutes()
      setMutes(updated)
      setMuteTarget(null)
    } catch (e) {
      alert(`Mute failed: ${e}`)
    } finally {
      setMuteSaving(false)
    }
  }

  async function handleRemoveMute(id: number) {
    await deleteAlertMute(id)
    setMutes(prev => prev.filter(m => m.id !== id))
  }

  async function handleToggle(rule: AlertRule) {
    const updated = await updateAlertRule(rule.id, { enabled: !rule.enabled })
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, ...updated } : r))
  }

  async function handleDelete(rule: AlertRule) {
    if (!confirm(`Delete rule "${rule.name}"?`)) return
    await deleteAlertRule(rule.id)
    setRules(prev => prev.filter(r => r.id !== rule.id))
  }

  function openCreate() {
    const firstTopic = rules[0]?.ntfy_topic || ''
    setEditRule({ ...BLANK_RULE, ntfy_topic: firstTopic })
    setEditMode('create')
  }

  function openEdit(rule: AlertRule) {
    setEditRule({ ...rule })
    setEditMode('edit')
  }

  async function handleResolveCve(id: number) {
    const note = window.prompt('Resolution note (optional):')
    if (note === null) return
    await resolveCve(id, note)
    setCves(prev => prev.filter(c => c.id !== id))
    if (cveSummary) setCveSummary({ ...cveSummary, total_unresolved: Math.max(0, cveSummary.total_unresolved - 1) })
  }

  async function handleCveScan() {
    setCveScanning(true)
    try {
      await triggerCveScan()
      const [cs, cm] = await Promise.allSettled([getCveSummary(), getCveMatches({ resolved: false, limit: 100 })])
      if (cs.status === 'fulfilled') setCveSummary(cs.value)
      if (cm.status === 'fulfilled') setCves(cm.value)
    } finally {
      setCveScanning(false)
    }
  }

  const filteredCves = cveFilter === 'all' ? cves : cves.filter(c => c.severity === cveFilter)

  async function handleSslScan() {
    setSslScanning(true)
    try {
      await triggerSslScan()
      const issues = await getSslIssues()
      setSslIssues(issues)
    } finally {
      setSslScanning(false)
    }
  }

  async function handleVlanAction(id: number, status: 'implemented' | 'dismissed') {
    await updateVlanRecommendation(id, status)
    setVlanRecs(prev => prev.filter(r => r.id !== id))
  }

  async function handleVlanAnalyze() {
    setVlanAnalyzing(true)
    try {
      await runVlanAnalysis()
      const recs = await getVlanRecommendations(undefined, 'open')
      setVlanRecs(recs)
    } finally {
      setVlanAnalyzing(false)
    }
  }

  async function handleIncidentFilterChange(f: 'all' | 'open' | 'monitoring' | 'resolved') {
    setIncidentFilter(f)
    const statusParam = f === 'all' ? undefined : f === 'open' ? 'open,monitoring' : f
    const data = await getIncidents(statusParam, 50).catch(() => [] as Incident[])
    setIncidents(data)
  }

  async function toggleIncidentTimeline(incident: Incident) {
    const next = new Set(expandedIncidents)
    if (next.has(incident.id)) {
      next.delete(incident.id)
    } else {
      next.add(incident.id)
      if (!incidentTimelines[incident.id]) {
        const detail = await getIncidentDetail(incident.id).catch(() => null)
        if (detail) setIncidentTimelines(prev => ({ ...prev, [incident.id]: detail }))
      }
    }
    setExpandedIncidents(next)
  }

  async function handleResolveConfirm() {
    if (!resolveTarget) return
    setResolvingSaving(true)
    try {
      await updateIncident(resolveTarget.id, { status: 'resolved', resolved_note: resolveNote || undefined })
      setIncidents(prev => prev.filter(i => incidentFilter === 'all' ? true : i.id !== resolveTarget.id))
      setResolveTarget(null)
      setResolveNote('')
    } catch (e) {
      alert(`Failed to resolve: ${e}`)
    } finally {
      setResolvingSaving(false)
    }
  }

  async function handleShowResolvedCves(show: boolean) {
    setShowResolvedCves(show)
    if (show && resolvedCves.length === 0) {
      const all = await getCveMatches({ resolved: true, limit: 100 }).catch(() => [] as CveMatch[])
      setResolvedCves(all)
    }
  }

  async function handleSave() {
    if (!editRule) return
    setSaving(true)
    try {
      if (editMode === 'create') {
        const created = await createAlertRule(editRule)
        setRules(prev => [...prev, created])
      } else {
        const updated = await updateAlertRule(editRule.id!, editRule)
        setRules(prev => prev.map(r => r.id === editRule.id ? { ...r, ...updated } : r))
      }
      setEditRule(null)
    } catch (e) {
      alert(`Save failed: ${e}`)
    } finally {
      setSaving(false)
    }
  }

  const thresholdGB = editRule?.threshold_bytes
    ? (editRule.threshold_bytes / 1_073_741_824).toFixed(1)
    : ''

  // Total alert count across all groups
  const totalAlerts = grouped.reduce((sum, g) => sum + g.count, 0)

  if (loading) {
    return (
      <div className="min-h-screen bg-a-bg flex items-center justify-center text-gray-400 text-sm">
        Loading…
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      {/* Navbar */}
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-900 font-bold text-sm tracking-tight">🛡️ Argus</Link>
            <span className="text-gray-200">|</span>
            <Link href="/alerts" className="text-indigo-600 font-semibold text-sm">🔔 Alerts</Link>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/guests" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">👥 Guests</Link>
            <Link href="/map" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">🗺️ Map</Link>
            <Link href="/" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">← Dashboard</Link>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8">

        {/* ── INCIDENTS ───────────────────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              Incidents
              {incidents.filter(i => i.status !== 'resolved').length > 0 && (
                <span className="px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px]">
                  {incidents.filter(i => i.status !== 'resolved').length}
                </span>
              )}
            </h2>
            <div className="flex gap-1">
              {(['open', 'monitoring', 'resolved', 'all'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => handleIncidentFilterChange(f)}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                    incidentFilter === f
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  {f === 'open' ? 'Open' : f === 'monitoring' ? 'Monitoring' : f === 'resolved' ? 'Resolved' : 'All'}
                </button>
              ))}
            </div>
          </div>

          {incidents.length === 0 ? (
            <div className="text-green-600 text-sm flex items-center gap-2">
              <span>✅</span> No incidents
            </div>
          ) : (
            <div className="space-y-3">
              {incidents.map(inc => {
                const isExpanded = expandedIncidents.has(inc.id)
                const timeline = incidentTimelines[inc.id]?.timeline ?? []
                const statusDot =
                  inc.status === 'open' ? 'bg-red-500' :
                  inc.status === 'monitoring' ? 'bg-amber-400' : 'bg-green-500'
                const statusLabel =
                  inc.status === 'open' ? 'OPEN' :
                  inc.status === 'monitoring' ? 'MONITORING' : 'RESOLVED'
                return (
                  <div
                    key={inc.id}
                    className={`border-l-4 border border-gray-200 rounded-xl p-4 ${SEV_BORDER[inc.severity] ?? 'border-l-gray-300'} ${
                      inc.status === 'resolved' ? 'opacity-60' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold uppercase ${SEV_BADGE[inc.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                            {inc.severity}
                          </span>
                          <span className="font-semibold text-sm text-gray-900 truncate">{inc.title}</span>
                        </div>
                        <div className="text-[11px] text-gray-500 flex items-center gap-2 flex-wrap">
                          {inc.location && <LocationBadge location={inc.location} />}
                          <span>{inc.threat_count} alert{inc.threat_count !== 1 ? 's' : ''}</span>
                          {inc.first_threat_at && <span>· Started {timeAgo(inc.first_threat_at)}</span>}
                          {inc.last_threat_at && <span>· Last: {timeAgo(inc.last_threat_at)}</span>}
                        </div>
                        {inc.summary && (
                          <p className="text-xs text-gray-600 mt-2 leading-relaxed">{inc.summary}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-gray-500">
                          <span className={`w-1.5 h-1.5 rounded-full ${statusDot}`} />
                          {statusLabel}
                        </span>
                      </div>
                    </div>

                    {/* Timeline */}
                    {isExpanded && (
                      <div className="mt-4 pl-2 border-l-2 border-gray-100 ml-1">
                        {timeline.length === 0 ? (
                          <div className="text-gray-400 text-xs py-2">Loading timeline…</div>
                        ) : (
                          <div className="space-y-2">
                            {timeline.map(t => (
                              <div key={t.id} className="flex items-start gap-2 text-xs">
                                <span className={`w-2 h-2 rounded-full mt-0.5 shrink-0 ${SEV_DOT[t.severity] ?? 'bg-gray-400'}`} />
                                <div>
                                  <span className="text-gray-400 font-mono mr-2">
                                    {t.timestamp ? new Date(t.timestamp + 'Z').toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                                  </span>
                                  <span className="font-medium text-gray-700">
                                    {THREAT_TYPE_LABELS[t.threat_type] ?? t.threat_type}
                                  </span>
                                  {t.detail && (
                                    <span className="text-gray-500 ml-2 truncate max-w-xs inline-block align-bottom">{t.detail}</span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => toggleIncidentTimeline(inc)}
                        className="px-2.5 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-indigo-50 hover:text-indigo-600 text-gray-500 transition-colors"
                      >
                        {isExpanded ? 'Hide Timeline' : 'View Timeline'}
                      </button>
                      {inc.status !== 'resolved' && (
                        <button
                          onClick={() => { setResolveTarget(inc); setResolveNote('') }}
                          className="px-2.5 py-1 text-[11px] border border-gray-200 rounded-lg hover:bg-green-50 hover:text-green-600 text-gray-500 transition-colors"
                        >
                          Mark Resolved
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── Alert History (grouped) ─────────────────────────────────────── */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
              Recent Alerts (24h)
              {totalAlerts > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px]">
                  {totalAlerts}
                </span>
              )}
            </h2>
          </div>
          {grouped.length === 0 ? (
            <div className="text-green-600 text-sm flex items-center gap-2">
              <span>✅</span> No alerts fired yet
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="w-6 px-2 py-2" />
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Time</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Rule</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Device</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Location</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Type</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {grouped.map(g => {
                    const isExpanded = expandedKeys.has(g.group_key)
                    const isGrouped = g.count > 1
                    return (
                      <Fragment key={g.group_key}>
                        {/* Parent row */}
                        <tr
                          className={`border-b border-gray-50 hover:bg-gray-50 transition-colors ${isGrouped ? 'cursor-pointer' : ''}`}
                          onClick={isGrouped ? () => toggleExpand(g.group_key) : undefined}
                        >
                          <td className="px-2 py-2 text-gray-400 text-[11px] w-6">
                            {isGrouped && (
                              <span className="transition-transform inline-block select-none">
                                {isExpanded ? '▼' : '▶'}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-gray-400 text-[10px] whitespace-nowrap font-mono">
                            {timeAgo(g.last_seen)}
                          </td>
                          <td className="px-3 py-2 text-indigo-600 text-[10px] font-medium">{g.rule_name}</td>
                          <td className="px-3 py-2 text-gray-700 text-[10px]">{g.device_name || '—'}</td>
                          <td className="px-3 py-2 text-[10px]">
                            <LocationBadge location={g.location} />
                          </td>
                          <td className="px-3 py-2 text-gray-500 text-[10px]">
                            {TRIGGER_LABELS[g.trigger_type] ?? g.trigger_type}
                            {isGrouped && (
                              <span className="ml-2 px-1.5 py-0.5 rounded text-xs font-semibold bg-gray-100 text-gray-600">
                                ×{g.count}
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                            <button
                              title="Mute alerts for this device"
                              onClick={() => openMute({
                                device_identifier: g.device_identifier,
                                device_name: g.device_name || g.device_identifier,
                                trigger_type: g.trigger_type,
                              })}
                              className="px-1.5 py-1 text-[11px] border border-gray-200 rounded hover:bg-amber-50 hover:text-amber-600 text-gray-400 transition-colors"
                            >
                              🔇
                            </button>
                          </td>
                        </tr>

                        {/* Expanded sub-rows */}
                        {isGrouped && isExpanded && g.alerts.map(a => (
                          <tr key={a.id} className="border-b border-gray-50 bg-gray-50/60">
                            <td className="w-6" />
                            <td className="px-3 py-1.5 pl-8 text-gray-400 text-[10px] whitespace-nowrap font-mono">
                              {timeAgo(a.fired_at)}
                            </td>
                            <td className="px-3 py-1.5 text-indigo-500 text-[10px]">{a.rule_name}</td>
                            <td className="px-3 py-1.5 text-gray-600 text-[10px]">{a.device_name || '—'}</td>
                            <td className="px-3 py-1.5 text-[10px]">
                              <LocationBadge location={a.location} />
                            </td>
                            <td className="px-3 py-1.5 text-gray-500 text-[10px]">
                              {TRIGGER_LABELS[a.trigger_type] ?? a.trigger_type}
                            </td>
                            <td className="px-3 py-1.5">
                              <button
                                title="Mute this alert type for this device"
                                onClick={() => openMute({
                                  device_identifier: g.device_identifier,
                                  device_name: a.device_name || g.device_identifier,
                                  trigger_type: a.trigger_type,
                                })}
                                className="px-1.5 py-0.5 text-[10px] border border-gray-200 rounded hover:bg-amber-50 hover:text-amber-600 text-gray-400 transition-colors"
                              >
                                🔇
                              </button>
                            </td>
                          </tr>
                        ))}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Active Mutes ────────────────────────────────────────────────── */}
        {mutes.length > 0 && (
          <div className="bg-white border border-amber-200 rounded-xl p-5 mb-8 shadow-card">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">
              🔇 Muted Devices
              <span className="ml-2 px-1.5 py-0.5 bg-amber-50 text-amber-600 rounded text-[10px]">
                {mutes.length}
              </span>
            </h2>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Device</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Alert Type</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Reason</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Expires</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Remove</th>
                  </tr>
                </thead>
                <tbody>
                  {mutes.map(m => (
                    <tr key={m.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 text-gray-700 font-mono text-[10px]">{m.device_identifier}</td>
                      <td className="px-3 py-2">
                        {m.alert_type === '*'
                          ? <span className="px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded text-[10px] font-semibold">All alerts</span>
                          : <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-medium">{TRIGGER_LABELS[m.alert_type] ?? m.alert_type}</span>
                        }
                      </td>
                      <td className="px-3 py-2 text-gray-500 text-[10px] max-w-xs truncate">{m.reason || '—'}</td>
                      <td className="px-3 py-2 text-gray-400 text-[10px]">
                        {m.expires_at ? fmtDate(m.expires_at) : <span className="text-gray-500">Permanent</span>}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleRemoveMute(m.id)}
                          className="px-2 py-1 text-[11px] border border-gray-200 rounded hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Alert Rules */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-card">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Alert Rules</h2>
            <button
              onClick={openCreate}
              className="px-3 py-1.5 bg-indigo-600 text-white text-[13px] font-medium rounded-lg hover:bg-indigo-700 transition-colors"
            >
              + Add Rule
            </button>
          </div>

          <div className="space-y-3">
            {rules.length === 0 && (
              <div className="text-gray-400 text-sm text-center py-8">No alert rules configured.</div>
            )}
            {rules.map(rule => {
              const lastFired = grouped.find(g => g.rule_name === rule.name)?.last_seen
              return (
                <div
                  key={rule.id}
                  className={`border rounded-xl p-4 transition-colors ${
                    rule.enabled ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 opacity-60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <ToggleSwitch checked={rule.enabled} onChange={() => handleToggle(rule)} />
                      <div className="min-w-0">
                        <div className="font-semibold text-sm text-gray-900 truncate">{rule.name}</div>
                        {rule.description && (
                          <div className="text-[11px] text-gray-500 mt-0.5">{rule.description}</div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => openEdit(rule)}
                        className="px-2 py-1 text-[11px] border border-gray-200 rounded hover:bg-gray-50 text-gray-500 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(rule)}
                        className="px-2 py-1 text-[11px] border border-gray-200 rounded hover:bg-red-50 hover:text-red-500 text-gray-400 transition-colors"
                      >
                        🗑
                      </button>
                    </div>
                  </div>

                  <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                    <span className="px-1.5 py-0.5 bg-indigo-50 text-indigo-600 rounded text-[10px] font-semibold">
                      {TRIGGER_LABELS[rule.trigger_type] ?? rule.trigger_type}
                    </span>
                    <RuleBadge label="severity" value={rule.filter_severity} />
                    <RuleBadge label="type" value={rule.filter_threat_type} />
                    <RuleBadge label="loc" value={rule.filter_location} />
                    <RuleBadge label="device" value={rule.filter_device_type} />
                    {rule.threshold_bytes && (
                      <RuleBadge label="threshold" value={`${(rule.threshold_bytes / 1_073_741_824).toFixed(1)} GB`} />
                    )}
                    <span className="text-[10px] text-gray-400">cooldown {rule.cooldown_minutes}m</span>
                    {lastFired && (
                      <span className="text-[10px] text-gray-400 ml-auto">last fired {timeAgo(lastFired)}</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {/* Vulnerabilities */}
        <div className="bg-white border border-gray-200 rounded-xl p-5 mt-8 shadow-card">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center gap-2">
              Vulnerabilities (CVE)
              {cveSummary && cveSummary.total_unresolved > 0 && (
                <span className="ml-2 px-1.5 py-0.5 bg-red-50 text-red-600 rounded text-[10px]">
                  {cveSummary.total_unresolved} unresolved
                </span>
              )}
              <button
                onClick={() => handleShowResolvedCves(!showResolvedCves)}
                className={`ml-2 px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                  showResolvedCves
                    ? 'bg-gray-800 text-white border-gray-800'
                    : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                }`}
              >
                {showResolvedCves ? 'Hide Resolved' : 'Show Resolved'}
              </button>
            </h2>
            <button
              onClick={handleCveScan}
              disabled={cveScanning}
              className="px-3 py-1.5 bg-indigo-600 text-white text-[13px] font-medium rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-60 flex items-center gap-1.5"
            >
              {cveScanning ? (
                <><span className="animate-spin inline-block">◌</span> Scanning…</>
              ) : 'Run Scan Now'}
            </button>
          </div>

          {cveSummary && (
            <div className="flex flex-wrap items-center gap-2 mb-4">
              {(['all', 'critical', 'high', 'medium', 'low'] as const).map(sev => {
                const count = sev === 'all'
                  ? cveSummary.total_unresolved
                  : cveSummary[sev as keyof CveSummary] as number
                if (sev !== 'all' && !count) return null
                return (
                  <button
                    key={sev}
                    onClick={() => setCveFilter(sev)}
                    className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-colors ${
                      cveFilter === sev
                        ? sev === 'all'
                          ? 'bg-gray-800 text-white border-gray-800'
                          : `${SEV_BADGE[sev]} border-transparent`
                        : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'
                    }`}
                  >
                    {sev === 'all' ? `All (${count})` : (
                      <>
                        {sev === 'critical' && '🔴 '}
                        {sev === 'high' && '🟠 '}
                        {sev === 'medium' && '🟡 '}
                        {sev === 'low' && '⚪ '}
                        {count} {sev.charAt(0).toUpperCase() + sev.slice(1)}
                      </>
                    )}
                  </button>
                )
              })}
              {cveSummary.most_vulnerable_device && (
                <span className="ml-auto text-[11px] text-gray-400">
                  Most vulnerable: <span className="text-gray-700 font-medium">{cveSummary.most_vulnerable_device}</span>
                </span>
              )}
            </div>
          )}

          {filteredCves.length === 0 && !showResolvedCves ? (
            <div className="text-green-600 text-sm flex items-center gap-2 py-4">
              <span>✅</span>
              {cves.length === 0 ? 'No vulnerabilities detected. Run a scan to check.' : 'No CVEs match the selected filter.'}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Device</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Service</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">CVE ID</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">CVSS</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Severity</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Published</th>
                    <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredCves.map(cve => (
                    <tr key={cve.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-3 py-2">
                        <Link
                          href={`/device?identity_id=${encodeURIComponent(cve.identity_id)}`}
                          className="text-indigo-600 font-medium hover:underline"
                        >
                          {cve.device_name}
                        </Link>
                        {cve.location && (
                          <span className="ml-1.5">
                            <LocationBadge location={cve.location} />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-600">
                        {cve.service}
                        {cve.port && <span className="text-gray-400 ml-1">:{cve.port}</span>}
                      </td>
                      <td className="px-3 py-2">
                        {cve.reference_url ? (
                          <a
                            href={cve.reference_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 font-mono hover:underline text-[11px]"
                          >
                            {cve.cve_id}
                          </a>
                        ) : (
                          <span className="font-mono text-[11px] text-gray-700">{cve.cve_id}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 font-semibold text-gray-800">{cve.cvss_score?.toFixed(1)}</td>
                      <td className="px-3 py-2">
                        <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${SEV_BADGE[cve.severity] ?? 'bg-gray-100 text-gray-600'}`}>
                          {cve.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-[10px] font-mono whitespace-nowrap">
                        {cve.published_date ? cve.published_date.slice(0, 10) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleResolveCve(cve.id)}
                          className="px-2 py-1 text-[11px] border border-gray-200 rounded hover:bg-green-50 hover:text-green-600 text-gray-500 transition-colors whitespace-nowrap"
                        >
                          Resolve
                        </button>
                      </td>
                    </tr>
                  ))}
                  {showResolvedCves && resolvedCves.map(cve => (
                    <tr key={`resolved-${cve.id}`} className="border-b border-gray-50 bg-gray-50/50 opacity-70">
                      <td className="px-3 py-2">
                        <Link
                          href={`/device?identity_id=${encodeURIComponent(cve.identity_id)}`}
                          className="text-indigo-600 font-medium hover:underline"
                        >
                          {cve.device_name}
                        </Link>
                        {cve.location && (
                          <span className="ml-1.5">
                            <LocationBadge location={cve.location} />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2 text-gray-500">{cve.service}{cve.port ? `:${cve.port}` : ''}</td>
                      <td className="px-3 py-2">
                        <span className="font-mono text-[11px] text-gray-500">{cve.cve_id}</span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{cve.cvss_score?.toFixed(1)}</td>
                      <td className="px-3 py-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold uppercase bg-gray-100 text-gray-500">
                          {cve.severity}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-400 text-[10px] font-mono">
                        {cve.published_date ? cve.published_date.slice(0, 10) : '—'}
                      </td>
                      <td className="px-3 py-2">
                        {(cve as any).resolved_note?.includes('Auto-resolved') ? (
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: '#F0FDF4', color: '#16A34A' }}>
                            🔄 Auto-patched
                          </span>
                        ) : (
                          <span className="text-[10px] text-gray-400">Resolved</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Cleartext Protocol Usage ─────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6 mt-8">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">🔓 Cleartext Protocol Usage</span>
              {cleartextThreats.length > 0 && (
                <span className="px-2 py-0.5 bg-amber-100 text-amber-700 text-[11px] font-semibold rounded-full">
                  {cleartextThreats.length}
                </span>
              )}
            </div>
          </div>
          {cleartextThreats.length === 0 ? (
            <div className="px-5 py-4 text-sm text-green-600">✅ All monitored traffic using encrypted protocols</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Device', 'Location', 'Protocol', 'Port', 'Detail'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {cleartextThreats.map(t => (
                    <tr key={t.id} className="border-b border-gray-50 hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium text-gray-800">{t.device_name || t.src_ip || '—'}</td>
                      <td className="px-3 py-2"><LocationBadge location={t.location} /></td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded text-[10px] font-semibold uppercase">
                          {t.detail.match(/using (\w+)/)?.[1] ?? 'cleartext'}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{t.dst_port ?? '—'}</td>
                      <td className="px-3 py-2 text-gray-500 max-w-xs truncate">{t.detail}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── SSL/TLS Issues ───────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">🔒 SSL/TLS Issues</span>
              {sslIssues.length > 0 && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[11px] font-semibold rounded-full">
                  {sslIssues.length}
                </span>
              )}
            </div>
            <button
              onClick={handleSslScan}
              disabled={sslScanning}
              className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              {sslScanning ? 'Scanning…' : 'Run SSL Scan'}
            </button>
          </div>
          {sslIssues.length === 0 ? (
            <div className="px-5 py-4 text-sm text-green-600">✅ No SSL/TLS issues detected</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Device', 'Location', 'Issue', 'Port', 'Detail'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {sslIssues.map(s => {
                    const issueColors: Record<string, string> = {
                      ssl_expired:     'bg-red-100 text-red-700',
                      ssl_expiring:    'bg-amber-100 text-amber-700',
                      ssl_self_signed: 'bg-yellow-100 text-yellow-700',
                      ssl_weak_cipher: 'bg-orange-100 text-orange-700',
                      ssl_cert_change: 'bg-red-200 text-red-800',
                    }
                    return (
                      <tr key={s.id} className="border-b border-gray-50 hover:bg-gray-50">
                        <td className="px-3 py-2 font-medium text-gray-800">{s.display_name || '—'}</td>
                        <td className="px-3 py-2"><LocationBadge location={s.location} /></td>
                        <td className="px-3 py-2">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${issueColors[s.threat_type] || 'bg-gray-100 text-gray-600'}`}>
                            {s.threat_type.replace('ssl_', '').replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-gray-500">{s.dst_port ?? '—'}</td>
                        <td className="px-3 py-2 text-gray-500 max-w-xs truncate">{s.detail}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Network Outages ──────────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">🔴 Network Outages (Last 30 Days)</span>
              {outages.some(o => !o.resolved_at) && (
                <span className="px-2 py-0.5 bg-red-100 text-red-700 text-[11px] font-semibold rounded-full animate-pulse">
                  ACTIVE
                </span>
              )}
            </div>
          </div>
          {outages.length === 0 ? (
            <div className="px-5 py-4 text-sm text-green-600">✅ No outage events in the last 30 days</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-100">
                    {['Location', 'Type', 'Started', 'Resolved', 'Duration', 'Status'].map(h => (
                      <th key={h} className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {outages.map(o => (
                    <tr key={o.id} className={`border-b border-gray-50 hover:bg-gray-50 ${!o.resolved_at ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2 font-medium text-gray-800">{o.location || 'All Sites'}</td>
                      <td className="px-3 py-2">
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 rounded text-[10px] font-semibold uppercase">
                          {o.outage_type.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-gray-500">{fmtDate(o.started_at)}</td>
                      <td className="px-3 py-2 text-gray-500">{o.resolved_at ? fmtDate(o.resolved_at) : '—'}</td>
                      <td className="px-3 py-2 text-gray-500">{o.duration_minutes ? `${o.duration_minutes}m` : '—'}</td>
                      <td className="px-3 py-2">
                        {o.resolved_at
                          ? <span className="text-green-600 text-[11px]">Resolved</span>
                          : <span className="text-red-600 font-semibold text-[11px] animate-pulse">Ongoing</span>
                        }
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── VLAN Recommendations ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-6">
          <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-gray-800">🔀 VLAN Recommendations</span>
              {vlanRecs.length > 0 && (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-[11px] font-semibold rounded-full">
                  {vlanRecs.length}
                </span>
              )}
            </div>
            <button
              onClick={handleVlanAnalyze}
              disabled={vlanAnalyzing}
              className="px-3 py-1.5 bg-indigo-50 text-indigo-600 border border-indigo-200 text-xs font-semibold rounded-lg hover:bg-indigo-100 transition-colors disabled:opacity-50"
            >
              {vlanAnalyzing ? 'Analyzing…' : 'Re-analyze'}
            </button>
          </div>
          {vlanRecs.length === 0 ? (
            <div className="px-5 py-4 text-sm text-gray-500">No open VLAN recommendations</div>
          ) : (
            <div className="divide-y divide-gray-100">
              {vlanRecs.map(rec => {
                const priColors: Record<string, string> = {
                  high:   'border-red-400 bg-red-50',
                  medium: 'border-amber-400 bg-amber-50',
                  low:    'border-gray-300 bg-gray-50',
                }
                return (
                  <div key={rec.id} className={`p-5 border-l-4 ${priColors[rec.priority] || 'border-gray-300'}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm text-gray-900">{rec.recommendation}</span>
                          <LocationBadge location={rec.location} />
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase ${
                            rec.priority === 'high' ? 'bg-red-100 text-red-700' :
                            rec.priority === 'medium' ? 'bg-amber-100 text-amber-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{rec.priority}</span>
                        </div>
                        <p className="text-xs text-gray-600 mb-2">{rec.rationale}</p>
                        <div className="bg-white border border-gray-200 rounded px-3 py-2 text-xs font-mono text-gray-700">
                          💡 {rec.firewalla_rule}
                        </div>
                      </div>
                      <div className="flex flex-col gap-2 shrink-0">
                        <button
                          onClick={() => handleVlanAction(rec.id, 'implemented')}
                          className="px-3 py-1.5 bg-green-50 text-green-700 border border-green-200 text-xs font-semibold rounded-lg hover:bg-green-100 transition-colors whitespace-nowrap"
                        >
                          ✅ Implemented
                        </button>
                        <button
                          onClick={() => handleVlanAction(rec.id, 'dismissed')}
                          className="px-3 py-1.5 bg-gray-50 text-gray-500 border border-gray-200 text-xs font-semibold rounded-lg hover:bg-gray-100 transition-colors"
                        >
                          ❌ Dismiss
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

      </main>

      {/* ── Resolve Incident Modal ───────────────────────────────────────────── */}
      {resolveTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">✅ Resolve Incident</h3>
              <button onClick={() => setResolveTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-xs text-gray-500">
                Incident: <span className="font-medium text-gray-800">{resolveTarget.title}</span>
              </p>
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Resolution note (optional)</label>
                <input
                  type="text"
                  value={resolveNote}
                  onChange={e => setResolveNote(e.target.value)}
                  placeholder="e.g. False positive, firewall rule added"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-300"
                />
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button onClick={() => setResolveTarget(null)} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors">
                Cancel
              </button>
              <button
                onClick={handleResolveConfirm}
                disabled={resolvingSaving}
                className="px-5 py-2 bg-green-600 text-white text-sm font-semibold rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50"
              >
                {resolvingSaving ? 'Resolving…' : 'Mark Resolved'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Mute Modal ───────────────────────────────────────────────────────── */}
      {muteTarget && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-5 pt-5 pb-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900 text-sm">🔇 Mute Alerts</h3>
              <button onClick={() => setMuteTarget(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-5 py-4 space-y-4">
              <div className="text-xs text-gray-500">
                Device: <span className="font-medium text-gray-800">{muteTarget.device_name}</span>
              </div>

              {/* Scope */}
              <div className="space-y-2">
                <label className="block text-xs font-semibold text-gray-500">Scope</label>
                <button
                  onClick={() => setMuteAll(false)}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    !muteAll ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Mute <strong>{TRIGGER_LABELS[muteTarget.trigger_type] ?? muteTarget.trigger_type}</strong> for this device
                </button>
                <button
                  onClick={() => setMuteAll(true)}
                  className={`w-full text-left px-3 py-2 rounded-lg border text-xs transition-colors ${
                    muteAll ? 'border-indigo-400 bg-indigo-50 text-indigo-700' : 'border-gray-200 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  Mute <strong>all alerts</strong> for this device
                </button>
              </div>

              {/* Reason */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Reason (optional)</label>
                <input
                  type="text"
                  value={muteReason}
                  onChange={e => setMuteReason(e.target.value)}
                  placeholder="e.g. TV phones home, expected"
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-300"
                />
              </div>

              {/* Expiry */}
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Duration</label>
                <div className="flex gap-2 flex-wrap">
                  {(['permanent', '24h', '7d', '30d'] as const).map(opt => (
                    <button
                      key={opt}
                      onClick={() => setMuteExpiry(opt)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                        muteExpiry === opt
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      {opt === 'permanent' ? 'Permanent' : opt}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-gray-100">
              <button
                onClick={() => setMuteTarget(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleMuteConfirm}
                disabled={muteSaving}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {muteSaving ? 'Muting…' : 'Confirm Mute'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add/Edit Rule Modal ───────────────────────────────────────────── */}
      {editRule && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-gray-100">
              <h3 className="font-semibold text-gray-900">
                {editMode === 'create' ? 'New Alert Rule' : 'Edit Rule'}
              </h3>
              <button onClick={() => setEditRule(null)} className="text-gray-400 hover:text-gray-600 text-xl leading-none">×</button>
            </div>

            <div className="px-6 py-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Name *</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={editRule.name || ''}
                  onChange={e => setEditRule(r => ({ ...r!, name: e.target.value }))}
                  placeholder="e.g. New Device at Cabin"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Description</label>
                <input
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={editRule.description || ''}
                  onChange={e => setEditRule(r => ({ ...r!, description: e.target.value || null }))}
                  placeholder="Optional description"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Trigger Type *</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={editRule.trigger_type || 'threat'}
                  onChange={e => setEditRule(r => ({ ...r!, trigger_type: e.target.value }))}
                >
                  {Object.entries(TRIGGER_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>

              {editRule.trigger_type === 'threat' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Min Severity</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={editRule.filter_severity || ''}
                        onChange={e => setEditRule(r => ({ ...r!, filter_severity: e.target.value || null }))}
                      >
                        <option value="">Any</option>
                        {SEVERITY_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Threat Type</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={editRule.filter_threat_type || ''}
                        onChange={e => setEditRule(r => ({ ...r!, filter_threat_type: e.target.value || null }))}
                      >
                        <option value="">Any</option>
                        {THREAT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                    </div>
                  </div>
                </>
              )}

              {editRule.trigger_type === 'bandwidth' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-500 mb-1">Threshold (GB per day)</label>
                  <input
                    type="number"
                    min="0.1"
                    step="0.5"
                    className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    value={thresholdGB}
                    onChange={e => setEditRule(r => ({
                      ...r!,
                      threshold_bytes: e.target.value ? Math.round(parseFloat(e.target.value) * 1_073_741_824) : null
                    }))}
                    placeholder="5"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Location Filter</label>
                <select
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                  value={editRule.filter_location || ''}
                  onChange={e => setEditRule(r => ({ ...r!, filter_location: e.target.value || null }))}
                >
                  <option value="">All Locations</option>
                  <option value="MSP">MSP (Minneapolis)</option>
                  <option value="PHX">PHX (Phoenix)</option>
                  <option value="CBN">CBN (Cabin)</option>
                </select>
              </div>

              <div className="border-t border-gray-100 pt-4">
                <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">NTFY Settings</div>
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Topic *</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      value={editRule.ntfy_topic || ''}
                      onChange={e => setEditRule(r => ({ ...r!, ntfy_topic: e.target.value }))}
                      placeholder="argus-pazlabs"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Priority</label>
                      <select
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={editRule.ntfy_priority || 'default'}
                        onChange={e => setEditRule(r => ({ ...r!, ntfy_priority: e.target.value }))}
                      >
                        {PRIORITY_OPTIONS.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-500 mb-1">Cooldown (minutes)</label>
                      <input
                        type="number"
                        min="1"
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                        value={editRule.cooldown_minutes ?? 60}
                        onChange={e => setEditRule(r => ({ ...r!, cooldown_minutes: parseInt(e.target.value) || 60 }))}
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Tags (comma-separated)</label>
                    <input
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-300"
                      value={editRule.ntfy_tags || ''}
                      onChange={e => setEditRule(r => ({ ...r!, ntfy_tags: e.target.value || null }))}
                      placeholder="shield,warning"
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-500 mb-1">Active Hours (UTC, optional)</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number" min="0" max="23"
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="0"
                    value={editRule.active_hours_start ?? ''}
                    onChange={e => setEditRule(r => ({ ...r!, active_hours_start: e.target.value ? parseInt(e.target.value) : null }))}
                  />
                  <span className="text-gray-400 text-sm">to</span>
                  <input
                    type="number" min="0" max="23"
                    className="w-20 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-300"
                    placeholder="23"
                    value={editRule.active_hours_end ?? ''}
                    onChange={e => setEditRule(r => ({ ...r!, active_hours_end: e.target.value ? parseInt(e.target.value) : null }))}
                  />
                  <span className="text-gray-400 text-xs">(leave blank for always)</span>
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-100">
              <button
                onClick={() => setEditRule(null)}
                className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !editRule.name}
                className="px-5 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'Saving…' : 'Save Rule'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
