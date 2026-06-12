'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import { getNetworkMap, fmtBytes, timeAgo, type MapLocation, type MapDevice, type NetworkMap } from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'

const LOC_CONFIG: Record<string, { label: string; color: string; textCls: string; borderCls: string }> = {
  MSP: { label: 'Minneapolis', color: '#0EA5E9', textCls: 'text-sky-400',   borderCls: 'border-sky-500'   },
  PHX: { label: 'Phoenix',     color: '#F97316', textCls: 'text-orange-400', borderCls: 'border-orange-500' },
  CBN: { label: 'Cabin',       color: '#22C55E', textCls: 'text-green-400',  borderCls: 'border-green-500'  },
}

// Geographic approximate positions for the location cards (as % of container)
const LOC_POSITIONS: Record<string, { top: number; left: number }> = {
  MSP: { top: 25, left: 15 },
  PHX: { top: 60, left: 55 },
  CBN: { top: 20, left: 72 },
}

// VPN tunnel connections
const TUNNELS = [['MSP', 'PHX'], ['MSP', 'CBN'], ['PHX', 'CBN']] as const

interface ForceNode {
  id: string
  name: string
  is_online: boolean
  flagged_dns: boolean
  bytes_in_24h: number
  is_router: boolean
  x: number
  y: number
  vx: number
  vy: number
}

interface ForceLink {
  source: string
  target: string
  bandwidth: number
}

function useForceSimulation(devices: MapDevice[], svgWidth: number, svgHeight: number) {
  const [nodes, setNodes] = useState<ForceNode[]>([])
  const animRef = useRef<number | null>(null)
  const nodesRef = useRef<ForceNode[]>([])
  const linksRef = useRef<ForceLink[]>([])

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)

    const cx = svgWidth / 2
    const cy = svgHeight / 2

    const routerNode: ForceNode = {
      id: 'router', name: 'Firewalla', is_online: true, flagged_dns: false,
      bytes_in_24h: 0, is_router: true,
      x: cx, y: cy, vx: 0, vy: 0,
    }

    const deviceNodes: ForceNode[] = devices.map((d, i) => {
      const angle = (i / devices.length) * 2 * Math.PI
      return {
        id: d.mac || d.ip,
        name: (d.friendly_name || d.hostname || d.ip).substring(0, 16),
        is_online: d.is_online,
        flagged_dns: d.flagged_dns,
        bytes_in_24h: d.bytes_in_24h,
        is_router: false,
        x: cx + 150 * Math.cos(angle),
        y: cy + 150 * Math.sin(angle),
        vx: 0, vy: 0,
      }
    })

    const allNodes = [routerNode, ...deviceNodes]
    const links: ForceLink[] = devices.map(d => ({
      source: 'router',
      target: d.mac || d.ip,
      bandwidth: d.bytes_in_24h,
    }))

    nodesRef.current = allNodes
    linksRef.current = links

    const maxBytes = Math.max(1, ...devices.map(d => d.bytes_in_24h))
    const LINK_DIST = 120
    const CHARGE = -300

    function tick() {
      const ns = nodesRef.current
      const ls = linksRef.current
      const nodeMap = new Map(ns.map(n => [n.id, n]))

      // Link forces
      for (const link of ls) {
        const src = nodeMap.get(link.source)
        const tgt = nodeMap.get(link.target)
        if (!src || !tgt) continue
        const dx = tgt.x - src.x
        const dy = tgt.y - src.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (dist - LINK_DIST) * 0.05
        const fx = (dx / dist) * force
        const fy = (dy / dist) * force
        src.vx += fx; src.vy += fy
        tgt.vx -= fx; tgt.vy -= fy
      }

      // Charge (repulsion)
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j]
          const dx = b.x - a.x
          const dy = b.y - a.y
          const dist2 = dx * dx + dy * dy + 1
          const force = CHARGE / dist2
          const fx = (dx / Math.sqrt(dist2)) * force
          const fy = (dy / Math.sqrt(dist2)) * force
          a.vx -= fx; a.vy -= fy
          b.vx += fx; b.vy += fy
        }
      }

      // Center force
      for (const n of ns) {
        n.vx += (cx - n.x) * 0.005
        n.vy += (cy - n.y) * 0.005
      }

      // Integrate
      for (const n of ns) {
        n.vx *= 0.85
        n.vy *= 0.85
        n.x += n.vx
        n.y += n.vy
        // Clamp to bounds
        n.x = Math.max(24, Math.min(svgWidth - 24, n.x))
        n.y = Math.max(24, Math.min(svgHeight - 24, n.y))
      }

      setNodes([...nodesRef.current])
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)

    // Stop after 3s (settled)
    const stopId = setTimeout(() => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
    }, 3000)

    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current)
      clearTimeout(stopId)
    }
  }, [devices, svgWidth, svgHeight])

  return { nodes, links: linksRef.current }
}

function ForceGraph({ devices, locColor }: { devices: MapDevice[]; locColor: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 500 })
  const [tooltip, setTooltip] = useState<{ node: ForceNode; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(entries => {
      const { width } = entries[0].contentRect
      setDims({ w: width, h: Math.min(500, Math.max(300, width * 0.6)) })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const { nodes, links } = useForceSimulation(devices, dims.w, dims.h)
  const nodeMap = new Map(nodes.map(n => [n.id, n]))
  const maxBytes = Math.max(1, ...devices.map(d => d.bytes_in_24h))

  function nodeRadius(n: ForceNode) {
    if (n.is_router) return 20
    return Math.max(8, Math.min(24, 8 + (n.bytes_in_24h / maxBytes) * 16))
  }

  function nodeColor(n: ForceNode) {
    if (n.is_router) return locColor
    if (n.flagged_dns) return '#f85149'
    if (n.is_online) return '#3fb950'
    return '#6b7f93'
  }

  function linkWidth(link: ForceLink) {
    return Math.max(1, Math.min(6, (link.bandwidth / maxBytes) * 6))
  }

  if (devices.length === 0) {
    return (
      <div className="flex items-center justify-center h-48 text-a-muted text-sm">
        No devices discovered yet
      </div>
    )
  }

  return (
    <div ref={containerRef} className="w-full relative">
      <svg width={dims.w} height={dims.h} className="overflow-visible">
        {/* Links */}
        <g>
          {links.map((link, i) => {
            const src = nodeMap.get(link.source)
            const tgt = nodeMap.get(link.target)
            if (!src || !tgt) return null
            return (
              <line key={i}
                x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y}
                stroke="#D1D5DB" strokeWidth={linkWidth(link)}
              />
            )
          })}
        </g>
        {/* Nodes */}
        <g>
          {nodes.map(n => (
            <g key={n.id}
              className="cursor-pointer"
              onMouseEnter={e => setTooltip({ node: n, x: n.x, y: n.y })}
              onMouseLeave={() => setTooltip(null)}
              onClick={() => {
                if (!n.is_router) window.location.href = `/device?mac=${encodeURIComponent(n.id)}`
              }}
            >
              <circle
                cx={n.x} cy={n.y} r={nodeRadius(n)}
                fill={nodeColor(n)} stroke="#ffffff" strokeWidth={2}
              />
              <text
                x={n.x} y={n.y - nodeRadius(n) - 4}
                textAnchor="middle" fontSize={9} fill="#6B7280"
              >
                {n.name}
              </text>
            </g>
          ))}
        </g>
      </svg>
      {/* Tooltip */}
      {tooltip && (() => {
        const device = devices.find(d => (d.mac || d.ip) === tooltip.node.id)
        if (!device && !tooltip.node.is_router) return null
        return (
          <div
            className="absolute z-20 bg-a-surface border border-a-border rounded px-3 py-2 text-xs pointer-events-none shadow-lg"
            style={{
              left: Math.min(tooltip.x + 16, dims.w - 200),
              top: Math.max(tooltip.y - 60, 0),
              maxWidth: 200,
            }}
          >
            {tooltip.node.is_router ? (
              <div className="font-semibold text-a-teal">Firewalla Router</div>
            ) : device && (
              <>
                <div className="font-semibold text-a-text">{device.friendly_name}</div>
                <div className="text-a-muted mt-0.5">{device.ip}</div>
                {device.device_type && <div className="text-a-muted">{device.device_type}</div>}
                <div className={device.is_online ? 'text-a-green' : 'text-a-muted'}>
                  {device.is_online ? 'Online' : 'Offline'}
                </div>
                <div className="text-a-muted">↓{fmtBytes(device.bytes_in_24h)} ↑{fmtBytes(device.bytes_out_24h)}</div>
                {device.flagged_dns && <div className="text-a-red">⚠ DNS anomaly</div>}
                <div className="text-a-muted opacity-60">{timeAgo(device.last_seen)}</div>
              </>
            )}
          </div>
        )
      })()}
      <div className="mt-2 flex gap-3 text-[10px] text-a-muted">
        <span className="flex items-center gap-1"><circle className="w-2 h-2 rounded-full bg-a-green inline-block" />Online</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-a-muted inline-block" />Offline</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-a-red inline-block" />DNS Alert</span>
      </div>
    </div>
  )
}

function LocationCard({
  loc,
  onDrillDown,
  showSvgLines,
  containerRef,
}: {
  loc: MapLocation
  onDrillDown: (name: string) => void
  showSvgLines: boolean
  containerRef: React.RefObject<HTMLDivElement>
}) {
  const cfg = LOC_CONFIG[loc.name]
  if (!cfg) return null

  const pct = loc.total_count > 0 ? Math.round((loc.online_count / loc.total_count) * 100) : 0
  const C = 2 * Math.PI * 18
  const onlineDash = (pct / 100) * C

  const borderCls = pct === 100 ? 'border-a-green'
    : pct >= 50 ? `border-yellow-500`
    : 'border-a-red'

  const pos = LOC_POSITIONS[loc.name] ?? { top: 50, left: 50 }

  return (
    <div
      style={{ position: 'absolute', top: `${pos.top}%`, left: `${pos.left}%`, transform: 'translate(-50%, -50%)' }}
      className={`bg-a-surface border-2 ${borderCls} rounded-xl p-4 w-44 cursor-pointer hover:bg-a-border/20 transition-colors z-10`}
      onClick={() => onDrillDown(loc.name)}
    >
      <div className="flex items-center justify-between mb-2">
        <span className={`text-sm font-bold ${cfg.textCls}`}>{loc.name}</span>
        <svg width={48} height={48} viewBox="0 0 48 48">
          <circle cx={24} cy={24} r={18} fill="none" stroke="#E5E7EB" strokeWidth={5} />
          <circle
            cx={24} cy={24} r={18} fill="none"
            stroke={pct >= 90 ? '#3fb950' : pct >= 50 ? '#e3b341' : '#f85149'}
            strokeWidth={5}
            strokeDasharray={`${onlineDash.toFixed(1)} ${C.toFixed(1)}`}
            strokeDashoffset={`${(C / 4).toFixed(1)}`}
          />
          <text x={24} y={28} textAnchor="middle" fontSize={10} fontWeight="bold" fill="#374151">{pct}%</text>
        </svg>
      </div>
      <div className="text-xs text-a-muted">{cfg.label}</div>
      <div className="text-xs mt-1">
        <span className="text-a-green">{loc.online_count}</span>
        <span className="text-a-muted"> / {loc.total_count} online</span>
      </div>
      <div className="text-[10px] text-a-muted mt-1 space-y-0.5">
        {loc.devices
          .filter(d => d.is_online)
          .slice(0, 3)
          .map(d => (
            <div key={d.mac || d.ip} className="truncate">{d.friendly_name}</div>
          ))}
      </div>
      <div className="text-[10px] text-a-teal mt-2 opacity-70">Click to explore →</div>
    </div>
  )
}

function GeographicView({
  data,
  onDrillDown,
}: {
  data: NetworkMap
  onDrillDown: (name: string) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [svgSize, setSvgSize] = useState({ w: 800, h: 500 })

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(e => {
      const { width } = e[0].contentRect
      setSvgSize({ w: width, h: Math.round(width * 0.6) })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  // Convert positions to pixel coords for SVG lines
  function posToPixel(pos: { top: number; left: number }) {
    return {
      x: (pos.left / 100) * svgSize.w,
      y: (pos.top / 100) * svgSize.h,
    }
  }

  return (
    <div ref={containerRef} className="relative w-full" style={{ minHeight: 420 }}>
      {/* SVG for VPN tunnel lines (behind cards) */}
      <svg
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox={`0 0 ${svgSize.w} ${svgSize.h}`}
        preserveAspectRatio="none"
      >
        {TUNNELS.map(([a, b]) => {
          const posA = LOC_POSITIONS[a]
          const posB = LOC_POSITIONS[b]
          if (!posA || !posB) return null
          const pa = posToPixel(posA)
          const pb = posToPixel(posB)
          const locA = data.locations.find(l => l.name === a)
          const locB = data.locations.find(l => l.name === b)
          const bothOnline = (locA?.online_count ?? 0) > 0 && (locB?.online_count ?? 0) > 0
          return (
            <g key={`${a}-${b}`}>
              <line
                x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke={bothOnline ? '#22C55E' : '#D1D5DB'}
                strokeWidth={bothOnline ? 2 : 1.5}
                strokeDasharray={bothOnline ? undefined : '6 4'}
                opacity={0.7}
              />
              <text
                x={(pa.x + pb.x) / 2}
                y={(pa.y + pb.y) / 2 - 6}
                textAnchor="middle"
                fontSize={8}
                fill="#9CA3AF"
              >
                Site-to-Site VPN
              </text>
            </g>
          )
        })}
      </svg>

      {/* Location cards */}
      {data.locations.map(loc => (
        <LocationCard
          key={loc.name}
          loc={loc}
          onDrillDown={onDrillDown}
          showSvgLines={false}
          containerRef={containerRef}
        />
      ))}
    </div>
  )
}

export default function MapPage() {
  const [data,        setData]       = useState<NetworkMap | null>(null)
  const [loading,     setLoading]    = useState(true)
  const [error,       setError]      = useState('')
  const [drilldown,   setDrilldown]  = useState<string | null>(null)
  const [updatedAt,   setUpdatedAt]  = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const map = await getNetworkMap()
      setData(map)
      setUpdatedAt(new Date())
      setError('')
    } catch (e) {
      setError(String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
    const id = setInterval(load, 60_000)
    return () => clearInterval(id)
  }, [load])

  const activeLocation = drilldown ? data?.locations.find(l => l.name === drilldown) : null
  const cfg = drilldown ? LOC_CONFIG[drilldown] : null

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap shadow-sm">
        <div className="flex items-center gap-3">
          {drilldown ? (
            <button
              onClick={() => setDrilldown(null)}
              className="text-gray-500 hover:text-indigo-600 text-sm transition-colors font-medium"
            >
              ← All Locations
            </button>
          ) : (
            <Link href="/" className="text-gray-500 hover:text-indigo-600 text-sm transition-colors font-medium">← Dashboard</Link>
          )}
          <span className="text-gray-200 select-none">|</span>
          <span className="text-gray-900 font-bold text-sm">🗺️ Argus Map</span>
          {drilldown && cfg && (
            <>
              <span className="text-gray-200 select-none">|</span>
              <span className={`text-sm font-semibold ${cfg.textCls}`}>{cfg.label} ({drilldown})</span>
            </>
          )}
        </div>
        {updatedAt && (
          <span className="text-[10px] text-gray-400">Updated {timeAgo(updatedAt.toISOString())}</span>
        )}
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <ErrorBoundary label="Network Map">
          {error && (
            <div className="mb-6 border border-a-red/40 bg-a-red/5 text-a-red rounded px-4 py-3 text-sm">
              ⚠ {error}
            </div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-a-muted text-sm">
              <span className="animate-spin-fast mr-2">◌</span>Loading network map…
            </div>
          ) : data && (
            <>
              {/* Summary row */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {data.locations.map(loc => {
                  const lcfg = LOC_CONFIG[loc.name]
                  return (
                    <div key={loc.name}
                      className={`bg-a-surface border border-a-border rounded-lg px-4 py-3 cursor-pointer hover:border-a-teal/40 transition-colors ${drilldown === loc.name ? 'border-a-teal/60' : ''}`}
                      onClick={() => setDrilldown(drilldown === loc.name ? null : loc.name)}
                    >
                      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${lcfg?.textCls}`}>{loc.name}</div>
                      <div className="text-lg font-bold text-a-text">{loc.online_count}<span className="text-a-muted text-sm font-normal">/{loc.total_count}</span></div>
                      <div className="text-[10px] text-a-muted">online</div>
                    </div>
                  )
                })}
              </div>

              {drilldown && activeLocation ? (
                /* Force-directed drill-down */
                <div className="bg-a-surface border border-a-border rounded-lg p-6">
                  <h2 className={`text-sm font-semibold mb-4 ${cfg?.textCls}`}>
                    {cfg?.label} Network — {activeLocation.devices.length} device{activeLocation.devices.length !== 1 ? 's' : ''}
                  </h2>
                  <ForceGraph devices={activeLocation.devices} locColor={cfg?.color ?? '#00d4aa'} />
                  {/* Device legend */}
                  <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-60 overflow-y-auto">
                    {activeLocation.devices
                      .sort((a, b) => (b.bytes_in_24h + b.bytes_out_24h) - (a.bytes_in_24h + a.bytes_out_24h))
                      .map(d => (
                        <div
                          key={d.mac || d.ip}
                          className="flex items-center gap-2 text-[10px] border border-a-border/40 rounded px-2 py-1 hover:bg-a-border/20 cursor-pointer"
                          onClick={() => window.location.href = `/device?mac=${encodeURIComponent(d.mac)}`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.flagged_dns ? 'bg-a-red' : d.is_online ? 'bg-a-green' : 'bg-a-muted'}`} />
                          <span className="text-a-text truncate flex-1">{d.friendly_name}</span>
                          <span className="text-a-muted shrink-0">{d.ip}</span>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                /* Geographic view */
                <div className="bg-a-surface border border-a-border rounded-lg p-6">
                  <h2 className="text-[10px] text-a-muted uppercase tracking-wider mb-4">Network Topology — Click a location to explore</h2>
                  <GeographicView data={data} onDrillDown={setDrilldown} />
                </div>
              )}
            </>
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
