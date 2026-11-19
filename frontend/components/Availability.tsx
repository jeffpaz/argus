'use client'

import { useState } from 'react'
import {
  fmtDate, timeAgo,
  type AvailabilityStatus, type DeviceAvailability, type AlwaysOnSuggestion, type DeviceIdentity,
} from '@/lib/argus'

// Same palette as the dashboard's location badges.
const LOC_BADGE: Record<string, string> = {
  MSP: 'bg-blue-50 text-blue-600 border-blue-200',
  PHX: 'bg-orange-50 text-orange-600 border-orange-200',
  CBN: 'bg-green-50 text-green-600 border-green-200',
}
const PILL = 'inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider whitespace-nowrap'

/** Small switch. Stops click propagation so it works inside clickable rows. */
export function AlwaysOnToggle({ checked, onChange, disabled, label, ariaLabel, title, onClass }: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
  ariaLabel?: string
  title?: string
  onClass?: string
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label ?? ariaLabel ?? 'Always on'}
      title={title ?? (checked ? 'Always on: Argus alerts when it goes offline' : 'Mark as always on')}
      disabled={disabled}
      onClick={e => { e.stopPropagation(); onChange(!checked) }}
      className="inline-flex items-center gap-2 disabled:opacity-50 disabled:cursor-wait"
    >
      <span className={`relative inline-flex h-4 w-7 shrink-0 rounded-full transition-colors ${checked ? (onClass ?? 'bg-indigo-500') : 'bg-gray-200'}`}>
        <span className={`absolute top-0.5 h-3 w-3 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
      </span>
      {label && <span className="text-xs text-gray-600">{label}</span>}
    </button>
  )
}

/** Switch for the per-device unusual-hours override. */
export function UnusualHoursToggle({ checked, onChange, disabled, label }: {
  checked: boolean
  onChange: (next: boolean) => void
  disabled?: boolean
  label?: string
}) {
  return (
    <AlwaysOnToggle
      checked={checked}
      onChange={onChange}
      disabled={disabled}
      label={label}
      ariaLabel="Any hours"
      onClass="bg-amber-500"
      title={checked
        ? 'Any hours: activity at unusual hours is not alerted for this device'
        : 'Allow activity at any hour (no unusual-hours alerts)'}
    />
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

type CountFilter = 'all' | 'online' | 'offline' | 'unknown'

/** Readable form of device_availability.last_source. */
function sourceLabel(src: string): string {
  if (src.startsWith('firewalla:') && src.endsWith(':online')) return 'Firewalla: online'
  return ({
    'firewalla:offline': 'Firewalla: offline',
    not_reported_by_firewalla: 'Not in Firewalla',
    last_seen: 'Recently seen',
    site_check: 'Site check',
    poll_failed: 'Poll failed',
    no_site: 'No site',
  } as Record<string, string>)[src] ?? src
}

/** Dashboard card: per-site up/down plus always-on device counts.
 *  Clicking a count opens the list of those devices inside the card. */
export function AvailabilitySummary({ status, devices, onFilterAlwaysOn }: {
  status: AvailabilityStatus | null
  devices?: DeviceIdentity[]
  onFilterAlwaysOn?: () => void
}) {
  const [open, setOpen] = useState<CountFilter | null>(null)
  if (!status) return null
  const { summary, sites, config } = status
  const byId = new Map((devices ?? []).map(d => [d.identity_id, d]))
  const tagged = status.devices.filter(d => !d.is_gateway)
  const shown = open === null ? [] : tagged
    .filter(d => open === 'all' || d.state === open)
    // offline first, then longest-offline first, then name
    .sort((a, b) => (a.state === 'offline' ? 0 : 1) - (b.state === 'offline' ? 0 : 1)
      || (a.state_since ?? '').localeCompare(b.state_since ?? '')
      || (a.name ?? '').localeCompare(b.name ?? ''))

  const counts: { key: CountFilter; label: string; value: number; cls: string; ring: string }[] = [
    { key: 'all', label: 'Always on', value: summary.always_on_total, cls: 'text-indigo-600', ring: 'ring-indigo-200 bg-indigo-50/60' },
    { key: 'online', label: 'Online', value: summary.online, cls: 'text-green-600', ring: 'ring-green-200 bg-green-50/60' },
    { key: 'offline', label: 'Offline', value: summary.offline, cls: summary.offline ? 'text-red-600' : 'text-gray-300', ring: 'ring-red-200 bg-red-50/60' },
  ]
  if (summary.unknown > 0) {
    counts.push({ key: 'unknown', label: 'Pending', value: summary.unknown, cls: 'text-gray-400', ring: 'ring-gray-200 bg-gray-50' })
  }
  const openLabel = counts.find(c => c.key === open)?.label

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
        <div className="flex items-center gap-1">
          {counts.map(c => (
            <button
              key={c.key}
              type="button"
              aria-expanded={open === c.key}
              onClick={() => setOpen(prev => prev === c.key ? null : c.key)}
              title={`Show ${c.label.toLowerCase()} devices`}
              className={`text-left rounded-lg px-3 py-1.5 transition-colors hover:bg-gray-50 ${open === c.key ? `ring-1 ${c.ring}` : ''}`}
            >
              <div className="text-[10px] text-gray-400 uppercase tracking-wider">{c.label}</div>
              <div className={`text-2xl font-bold ${c.cls}`}>{c.value}</div>
            </button>
          ))}
        </div>
      </div>

      {open !== null && (
        <div className="mt-5 border-t border-gray-100 pt-4">
          <div className="flex items-center justify-between gap-3 mb-2 flex-wrap">
            <h3 className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider">
              {openLabel} · {shown.length} device{shown.length === 1 ? '' : 's'}
            </h3>
            <div className="flex items-center gap-3">
              {onFilterAlwaysOn && (
                <button type="button" onClick={onFilterAlwaysOn} className="text-[11px] text-indigo-600 hover:underline">
                  Show in device table
                </button>
              )}
              <button type="button" onClick={() => setOpen(null)} className="text-gray-400 hover:text-gray-600 text-xs" title="Close">✕</button>
            </div>
          </div>
          {shown.length === 0 ? (
            <p className="text-xs text-gray-400 py-3">No {openLabel?.toLowerCase()} devices.</p>
          ) : (
            <div className="overflow-x-auto border border-gray-100 rounded-lg">
              <table className="w-full text-xs">
                <thead className="bg-gray-50">
                  <tr className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
                    <th className="text-left px-3 py-2">Device</th>
                    <th className="text-left px-3 py-2">Status</th>
                    <th className="text-left px-3 py-2 hidden md:table-cell">IP / MAC</th>
                    <th className="text-left px-3 py-2 hidden lg:table-cell">Type</th>
                    <th className="text-left px-3 py-2">Last seen</th>
                    <th className="text-left px-3 py-2 hidden md:table-cell">Checked</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {shown.map(a => {
                    const d = byId.get(a.device_id)
                    const type = [d?.device_type, d?.manufacturer].filter(x => x && x !== 'Unknown').join(' · ')
                    const mac = d?.current_mac ?? d?.mac
                    return (
                      <tr key={a.device_id}
                          onClick={() => { window.location.href = `/device?identity_id=${encodeURIComponent(a.device_id)}` }}
                          className={`cursor-pointer hover:bg-gray-50 ${a.state === 'offline' ? 'bg-red-50/40' : ''}`}>
                        <td className="px-3 py-2">
                          <div className="flex items-center gap-2 min-w-0">
                            {a.location && <span className={`${PILL} ${LOC_BADGE[a.location] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>{a.location}</span>}
                            <span className="font-medium text-gray-800 truncate">{a.name || a.device_id}</span>
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <AvailabilityBadge avail={a} location={a.location} />
                          {a.state === 'offline' && a.state_since && (
                            <div className="text-[10px] text-gray-400 mt-0.5">since {fmtDate(a.state_since)}</div>
                          )}
                          {a.state !== 'offline' && a.consecutive_misses > 0 && (
                            <div className="text-[10px] text-amber-600 mt-0.5">missed {a.consecutive_misses} check{a.consecutive_misses === 1 ? '' : 's'}</div>
                          )}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell font-mono text-[11px]">
                          <div className="text-indigo-600">{d?.ip || '—'}</div>
                          {mac && <div className="text-gray-400">{mac}</div>}
                        </td>
                        <td className="px-3 py-2 hidden lg:table-cell text-gray-600 max-w-[220px] truncate" title={type}>{type || '—'}</td>
                        <td className="px-3 py-2 text-gray-600 whitespace-nowrap" title={a.last_seen ? fmtDate(a.last_seen) : undefined}>
                          {a.last_seen ? timeAgo(a.last_seen) : '—'}
                        </td>
                        <td className="px-3 py-2 hidden md:table-cell text-gray-400 whitespace-nowrap"
                            title={a.last_checked_at ? fmtDate(a.last_checked_at) : undefined}>
                          {a.last_checked_at ? timeAgo(a.last_checked_at) : 'Not yet'}
                          {a.source && <span className="ml-1">· {sourceLabel(a.source)}</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Dismissible list of devices device_classifier thinks are always-on. Never auto-tags. */
export function AlwaysOnSuggestions({
  suggestions, onTag, onDismiss, onHide,
  title = 'Suggested always-on devices',
  blurb = 'These look like infrastructure (routers, cameras, servers, IoT sensors). Nothing is tagged until you choose.',
  actionLabel = (n: number) => `Mark ${n} always on`,
  accent = 'border-l-indigo-500',
  icon = '💡',
}: {
  suggestions: AlwaysOnSuggestion[]
  onTag: (ids: string[]) => Promise<void>
  onDismiss: (ids: string[]) => Promise<void>
  onHide: () => void
  title?: string
  blurb?: string
  actionLabel?: (n: number) => string
  accent?: string
  icon?: string
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
    <div className={`bg-white border border-gray-200 border-l-4 ${accent} rounded-xl p-5 mb-8 shadow-card`}>
      <div className="flex items-start justify-between gap-3 mb-3 flex-wrap">
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{icon} {title}</h2>
          <p className="text-xs text-gray-500 mt-1">{blurb}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            disabled={busy || ids.length === 0}
            onClick={() => run(() => onTag(ids))}
            className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-40"
          >
            {actionLabel(ids.length)}
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
          <div
            key={s.device_id}
            onClick={() => { window.location.href = `/device?identity_id=${encodeURIComponent(s.device_id)}` }}
            title="Open device details"
            className="group flex items-center gap-3 px-3 py-2 text-xs hover:bg-gray-50 cursor-pointer"
          >
            <input
              type="checkbox"
              className="accent-indigo-600 w-3.5 h-3.5 cursor-pointer"
              checked={picked.has(s.device_id)}
              onChange={() => toggle(s.device_id)}
              onClick={e => e.stopPropagation()}
              aria-label={`Select ${s.name || s.device_id}`}
            />
            {s.location && <span className={`${PILL} ${LOC_BADGE[s.location] ?? 'bg-gray-50 text-gray-500 border-gray-200'}`}>{s.location}</span>}
            <span className="font-medium text-gray-800 min-w-0 truncate group-hover:text-indigo-600 group-hover:underline">{s.name || s.device_id}</span>
            {s.ip && <span className="font-mono text-[11px] text-indigo-600">{s.ip}</span>}
            <span className="ml-auto text-[11px] text-gray-400 truncate">{s.reason}</span>
            <button
              type="button"
              title="Don't suggest this device again"
              onClick={e => { e.stopPropagation(); run(() => onDismiss([s.device_id])) }}
              className="text-gray-300 hover:text-gray-600 px-1"
            >
              ✕
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
