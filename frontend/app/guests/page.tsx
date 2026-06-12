'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import {
  getGuestDevices, getGuestVisits,
  fmtDate, timeAgo,
  type GuestDevice, type GuestVisit,
} from '@/lib/argus'

type LocFilter = 'all' | 'MSP' | 'PHX' | 'CBN'

const LOC_BADGE: Record<string, string> = {
  MSP: 'bg-blue-50 text-blue-600 border-blue-200',
  PHX: 'bg-orange-50 text-orange-600 border-orange-200',
  CBN: 'bg-green-50 text-green-600 border-green-200',
}

function fmtDuration(mins: number): string {
  if (mins < 60) return `${mins}m`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function NavBar() {
  return (
    <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-900 font-bold text-sm tracking-tight shrink-0">🛡️ Argus</Link>
          <span className="text-gray-200 select-none">|</span>
          <span className="text-[13px] text-gray-500">Guest Devices</span>
        </div>
        <div className="flex items-center gap-2">
          <Link href="/alerts" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">🔔 Alerts</Link>
          <Link href="/guests" className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 text-white text-[13px] font-medium rounded-lg">👥 Guests</Link>
          <Link href="/map" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">🗺️ Map</Link>
          <Link href="/report" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">📋 Report</Link>
        </div>
        <a href="https://pazlabs.io" className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors shrink-0">← Dashboard</a>
      </div>
    </header>
  )
}

const DEVICE_ICONS: Record<string, string> = {
  'iOS Device': '📱', 'Android Device': '📱', 'Mac': '💻',
  'Laptop': '💻', 'Windows PC': '🪟', 'Smart Speaker': '🔊',
  'Streaming / TV': '📺', 'Gaming Console': '🎮',
}

export default function GuestsPage() {
  const [guests, setGuests] = useState<GuestDevice[]>([])
  const [visits, setVisits] = useState<GuestVisit[]>([])
  const [locFilter, setLocFilter] = useState<LocFilter>('all')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const [g, v] = await Promise.allSettled([
      getGuestDevices(locFilter === 'all' ? undefined : locFilter),
      getGuestVisits(locFilter === 'all' ? undefined : locFilter, 20),
    ])
    if (g.status === 'fulfilled') setGuests(g.value.guests)
    if (v.status === 'fulfilled') setVisits(v.value)
    setLoading(false)
  }, [locFilter])

  useEffect(() => { load() }, [load])

  const devIcon = (t?: string | null) => DEVICE_ICONS[t ?? ''] ?? '📟'

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      <NavBar />
      <main className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Guest Devices</h1>
          <p className="text-sm text-gray-500 mt-1">Devices seen briefly — visitors, contractors, temporary connections</p>
        </div>

        {/* Location filter */}
        <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 shadow-sm mb-8 w-fit">
          {(['all', 'MSP', 'PHX', 'CBN'] as LocFilter[]).map(loc => (
            <button
              key={loc}
              onClick={() => setLocFilter(loc)}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                locFilter === loc ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              {loc === 'all' ? 'All Locations' : loc}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-16 text-gray-400 text-sm">
            <span className="animate-spin-fast mr-2">◌</span>Loading…
          </div>
        ) : guests.length === 0 ? (
          <div className="text-center py-16 text-gray-400 text-sm">
            <div className="text-4xl mb-3">👥</div>
            <div>No guest devices detected yet.</div>
            <div className="text-xs mt-1 text-gray-300">Guests are classified after 5+ days of tracking.</div>
          </div>
        ) : (
          <>
            {/* Guest cards grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-10">
              {guests.map(g => {
                const locBadge = LOC_BADGE[g.location] ?? 'bg-gray-50 text-gray-500 border-gray-200'
                return (
                  <div key={g.identity_id} className="bg-white border border-gray-200 rounded-xl p-5 shadow-card hover:shadow-card-hover transition-shadow">
                    <div className="flex items-start justify-between gap-2 mb-3">
                      <div className="flex items-center gap-2">
                        <span className="text-2xl">{devIcon(g.device_type)}</span>
                        <div>
                          <Link
                            href={`/device?identity_id=${encodeURIComponent(g.identity_id)}`}
                            className="font-semibold text-sm text-gray-900 hover:text-indigo-600 transition-colors"
                          >
                            {g.display_name}
                          </Link>
                          {g.device_type && g.device_type !== 'Unknown' && (
                            <div className="text-[11px] text-gray-400">{g.device_type}</div>
                          )}
                        </div>
                      </div>
                      <span className="inline-block px-2 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider bg-purple-50 text-purple-600 border-purple-200 shrink-0">
                        GUEST
                      </span>
                    </div>
                    <div className="space-y-1.5 text-[12px] text-gray-600">
                      <div className="flex justify-between">
                        <span className="text-gray-400">Location</span>
                        <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider ${locBadge}`}>
                          {g.location}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Last seen</span>
                        <span>{timeAgo(g.last_seen)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">First seen</span>
                        <span>{fmtDate(g.first_seen).split(',')[0]}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-400">Visits</span>
                        <span className="font-medium">{g.total_visits}</span>
                      </div>
                      {g.longest_visit_minutes > 0 && (
                        <div className="flex justify-between">
                          <span className="text-gray-400">Longest</span>
                          <span>{fmtDuration(g.longest_visit_minutes)}</span>
                        </div>
                      )}
                      {g.is_online && (
                        <div className="flex items-center gap-1.5 text-green-600 font-medium mt-1">
                          <span className="inline-block w-1.5 h-1.5 rounded-full bg-green-500 pulse-dot" />
                          Currently online
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Recent Guest Visits table */}
            {visits.length > 0 && (
              <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-card">
                <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-4">Recent Guest Visits</h2>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Arrived</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Departed</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Duration</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Device</th>
                        <th className="text-left px-3 py-2 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Location</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visits.map(v => {
                        const locBadge = LOC_BADGE[v.location] ?? 'bg-gray-50 text-gray-500 border-gray-200'
                        return (
                          <tr key={v.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                            <td className="px-3 py-2 font-mono text-[10px] text-gray-500 whitespace-nowrap">{fmtDate(v.arrived_at)}</td>
                            <td className="px-3 py-2 font-mono text-[10px] text-gray-500 whitespace-nowrap">{v.departed_at ? fmtDate(v.departed_at) : '—'}</td>
                            <td className="px-3 py-2 text-gray-700 font-medium">{fmtDuration(v.duration_minutes)}</td>
                            <td className="px-3 py-2 text-indigo-600 font-medium">{v.device_name}</td>
                            <td className="px-3 py-2">
                              <span className={`inline-block px-2 py-0.5 text-[10px] font-semibold border rounded-full uppercase tracking-wider ${locBadge}`}>
                                {v.location}
                              </span>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
