'use client'

import { useState } from 'react'
import {
  fmtDate, timeAgo,
  type AvailabilityStatus, type DeviceAvailability, type AlwaysOnSuggestion,
} from '@/lib/argus'

// Same palette as the dashboard's location badges.
const LOC_BADGE: Record<string, string> = {
  MSP: 'bg-blue-50 text-blue-600 border-blue-200',
  PHX: 'bg-orange-50 text-orange-600 border-orange-200',
  CBN: 'bg-green-50 text-green-600 border-green-200',
}
const PILL = 'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider whitespace-nowrap'

/** Small switch. Stops click propagation so it works inside clickable rows. */
export function AlwaysOnToggle({ checked, onChange, disabled, label }: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? 'Always on'}
      title={checked ? 'Always on: Argus alerts when it goes offline' : 'Mark as always on'}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      className="inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
    >
      <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? 'bg-indigo-500' : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
      {label && <span className="text-xs text-gray-600">{label}</span>}
    </button>
  )
}

/** Online / Offline since X / Unknown, for always-on devices. */
export function AvailabilityBadge({ avail, location }: { avail?: DeviceAvailability; location?: string | null }) {
  if (!avail || avail.state === 'unknown') {
    return <span className={`${PILL} bg-gray-50 text-gray-500 border-gray-200`} title="Not checked yet">Unknown</span>
  }
  if (avail.state === 'offline') {
    return (
      <span className={`${PILL} bg-red-50 text-red-600 border-red-200`}
            title={avail.state_since ? `Offline since ${fmtDate(avail.state_since)}` : 'Offline'}>
        <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
        Offline{avail.state_since ? ` since ${timeAgo(avail.state_since).replace(' ago', '')}` : ''}
        {avail.muted && <span className="normal-case font-normal opacity-70">· muted</span>}
      </span>
    )
  }
  const loc = LOC_BADGE[location ?? avail.location ?? ''] ?? 'bg-green-50 text-green-600 border-green-200'
  return (
    <span className={`${PILL} ${loc}`} title={avail.last_checked_at ? `Checked ${timeAgo(avail.last_checked_at)}` : undefined}>
      <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
      Online
    </span>
  )
}

/** Dashboard card: per-site up/down plus always-on device counts. */
export function AvailabilitySummary({ status, onFilterAlwaysOn }: {
  status: AvailabilityStatus | null
  onFilterAlwaysOn?: () => void
}) {
  if (!status) return null
  const { summary, sites, config } = status
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-5 mb-8 shadow-card">
      <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">📡 Availability</h2>
        <span className="text-[11px] text-gray-400">
          Checked every {config.check_interval_min} min
          {!config.notifications_configured && <span className="ml-2 text-amber-600">· Push notifications off (NTFY_TOPIC not set)</span>}
        </span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-5 items-center">
        <div className="flex flex-wrap gap-2">
          {sites.map(s => {
            const down = s.state === 'down'
            const blind = !s.polling_ok
            const cls = down ? 'border-red-300 bg-red-50' : blind ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-white'
            return (
              <div key={s.location} className={`flex items-center gap-2.5 border rounded-xl px-3 py-2 ${cls}`}
                   title={s.last_poll_error ?? (s.last_checked_at ? `Checked ${timeAgo(s.last_checked_at)}` : 'Not checked yet')}>
                <span className={`${PILL} ${LOC_BADGE[s.location] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>{s.location}</span>
                <span className={`w-2 h-2 rounded-full ${down ? 'bg-red-500' : s.state === 'up' ? 'bg-green-500 pulse-dot' : 'bg-gray-300'}`} />
                <span className={`text-xs font-semibold ${down ? 'text-red-700' : 'text-gray-700'}`}>
                  {down ? 'Down' : s.state === 'up' ? 'Up' : 'Unknown'}
                </span>
                {down && s.state_since && <span className="text-[11px] text-red-600">since {fmtDate(s.state_since)}</span>}
                {blind && <span className="text-[11px] text-amber-700">not polling ({s.consecutive_poll_failures}×)</span>}
                <span className="font-mono text-[10px] text-gray-400">{s.gateway}</span>
              </div>
            )
          })}
        </div>
        <button
          type="button"
          onClick={onFilterAlwaysOn}
          className="flex items-center gap-4 text-left rounded-xl px-1 hover:opacity-80"
          title="Show always-on devices"
        >
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Always on</div>
            <div className="text-2xl font-bold text-indigo-600">{summary.always_on_total}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Online</div>
            <div className="text-2xl font-bold text-green-600">{summary.online}</div>
          </div>
          <div>
            <div className="text-[10px] text-gray-400 uppercase tracking-wider">Offline</div>
            <div className={`text-2xl font-bold ${summary.offline ? 'text-red-600' : 'text-gray-300'}`}>{summary.offline}</div>
          </div>
          {summary.unknown > 0 && (
            <div>
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">Pending</div>
              <div className="text-2xl font-bold text-gray-400">{summary.unknown}</div>
            </div>
          )}
        </button>
      </div>
    </div>
  )
}

/** Dismissible list of devices device_classifier thinks are always-on. Never auto-tags. */
export function AlwaysOnSuggestions({ suggestions, onTag, onDismiss, onHide }: {
  suggestions: AlwaysOnSuggestion[]
  onTag: (ids: string[]) => Promise<void>
  onDismiss: (ids: string[]) => Promise<void>
  onHide: () => void
}) {
  const [picked, setPicked] = useState<Set<string>>(() => new Set(suggestions.map(s => s.device_id)))
  const [busy, setBusy] = useState(false)
  if (suggestions.length === 0) return null
  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev)
    if (next.has(id)) next.delete(id); else next.add(id)
    return next
  })
  const run = async (fn: () => Promise<void>) => { setBusy(true); try { await fn() } finally { setBusy(false) } }
  const ids = suggestions.map(s => s.device_id).filter(id => picked.has(id))

  return (
    <div className="bg-white border border-gray-200 border-l-4 border-l-indigo-500 rounded-xl p-5 mb-8 shadow-card">
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">💡 Suggested always-on devices</h2>
          <p className="text-xs text-gray-500 mt-1">
            These look like infrastructure (routers, cameras, servers, IoT sensors). Nothing is tagged until you choose.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={busy || ids.length === 0}
            onClick={() => run(() => onTag(ids))}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-40"
          >
            Mark {ids.length} always on
          </button>
          <button
            disabled={busy || ids.length === 0}
            onClick={() => run(() => onDismiss(ids))}
            className="px-3 py-1.5 bg-white border border-gray-200 text-gray-600 text-xs font-medium rounded-lg hover:bg-gray-50 disabled:opacity-40"
          >
            Dismiss selected
          </button>
          <button onClick={onHide} className="px-2 py-1.5 text-gray-400 hover:text-gray-600 text-xs" title="Hide this list">✕</button>
        </div>
      </div>
      <div className="max-h-64 overflow-y-auto divide-y divide-gray-50 border border-gray-100 rounded-lg">
        {suggestions.map(s => (
          <label key={s.device_id} className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer">
            <input type="checkbox" className="accent-indigo-600 w-3.5 h-3.5" checked={picked.has(s.device_id)} onChange={() => toggle(s.device_id)} />
            {s.location && <span className={`${PILL} ${LOC_BADGE[s.location] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>{s.location}</span>}
            <span className="font-medium text-gray-800 min-w-0 truncate">{s.name || s.device_id}</span>
            {s.ip && <span className="font-mono text-[11px] text-indigo-600">{s.ip}</span>}
            <span className="ml-auto text-[11px] text-gray-400 truncate">{s.reason}</span>
            <button
              type="button"
              title="Don't suggest this device again"
              onClick={e => { e.preventDefault(); run(() => onDismiss([s.device_id])) }}
              className="text-gray-300 hover:text-gray-600 px-1"
            >
              ✕
            </button>
          </label>
        ))}
      </div>
    </div>
  )
}
