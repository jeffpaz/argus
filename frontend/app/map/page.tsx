'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import Link from 'next/link'
import {
  getLocationCards, getCommGraph,
  fmtBytes, timeAgo,
  type LocationCard, type CommGraph, type GraphNode, type GraphEdge,
} from '@/lib/argus'
import ErrorBoundary from '@/components/ErrorBoundary'

const LOC_CONFIG: Record<string, { label: string; color: string; textCls: string }> = {
  MSP: { label: 'Minneapolis', color: '#0EA5E9', textCls: 'text-sky-500'    },
  PHX: { label: 'Phoenix',     color: '#F97316', textCls: 'text-orange-500' },
  CBN: { label: 'Cabin',       color: '#22C55E', textCls: 'text-green-500'  },
}

const LOC_POSITIONS: Record<string, { top: number; left: number }> = {
  MSP: { top: 30, left: 18 },
  PHX: { top: 62, left: 55 },
  CBN: { top: 22, left: 72 },
}

const TUNNELS = [['MSP', 'PHX'], ['MSP', 'CBN'], ['PHX', 'CBN']] as const

// Single source of truth for "is this node the router" — the layout
// simulation used a broader heuristic (device_type OR label match) while
// color/radius/click-handling/legend checked device_type alone, so a router
// node whose device_type isn't exactly 'Router / Firewall' (null, or a more
// specific label like "Firewalla Gold") would be centered/anchored as the
// hub by the simulation but rendered and treated as a regular device
// everywhere else — including being clickable through to a /device page for
// an id that isn't a real device identity.
function isRouterNode(n: { device_type: string | null; label: string }): boolean {
  return n.device_type === 'Router / Firewall'
    || n.label.toLowerCase().includes('router')
    || n.label.toLowerCase().includes('firewalla')
}

// ─── Force simulation (no D3 dependency needed — D3 is available but overkill for this layout) ───

interface SimNode extends GraphNode {
  x: number; y: number; vx: number; vy: number
}

function useForceSimulation(nodes: GraphNode[], edges: GraphEdge[], w: number, h: number) {
  const [simNodes, setSimNodes] = useState<SimNode[]>([])
  const animRef = useRef<number | null>(null)
  const nsRef   = useRef<SimNode[]>([])
  const esRef   = useRef<GraphEdge[]>([])

  useEffect(() => {
    if (animRef.current) cancelAnimationFrame(animRef.current)
    const cx = w / 2, cy = h / 2
    const routerIdx = nodes.findIndex(isRouterNode)

    nsRef.current = nodes.map((n, i) => {
      const isRouter = i === routerIdx
      const angle = (i / Math.max(1, nodes.length)) * 2 * Math.PI
      return {
        ...n,
        x: isRouter ? cx : cx + 160 * Math.cos(angle),
        y: isRouter ? cy : cy + 160 * Math.sin(angle),
        vx: 0, vy: 0,
      }
    })
    esRef.current = edges

    const LINK_DIST = 130, CHARGE = -350

    function tick() {
      const ns = nsRef.current
      const nodeMap = new Map(ns.map(n => [n.id, n]))

      // Link forces from edges
      for (const e of esRef.current) {
        const src = nodeMap.get(e.source)
        const tgt = nodeMap.get(e.target)
        if (!src || !tgt) continue
        const dx = tgt.x - src.x, dy = tgt.y - src.y
        const dist = Math.sqrt(dx * dx + dy * dy) || 1
        const force = (dist - LINK_DIST) * 0.05
        const fx = (dx / dist) * force, fy = (dy / dist) * force
        src.vx += fx; src.vy += fy
        tgt.vx -= fx; tgt.vy -= fy
      }

      // Router gravity — pull all nodes toward router
      const router = routerIdx >= 0 ? ns[routerIdx] : null
      if (router) {
        for (const n of ns) {
          if (n === router) continue
          const dx = router.x - n.x, dy = router.y - n.y
          const dist = Math.sqrt(dx * dx + dy * dy) || 1
          const force = (dist - LINK_DIST) * 0.03
          n.vx += (dx / dist) * force
          n.vy += (dy / dist) * force
        }
      }

      // Repulsion
      for (let i = 0; i < ns.length; i++) {
        for (let j = i + 1; j < ns.length; j++) {
          const a = ns[i], b = ns[j]
          const dx = b.x - a.x, dy = b.y - a.y
          const dist2 = dx * dx + dy * dy + 1
          const force = CHARGE / dist2
          const d = Math.sqrt(dist2)
          a.vx -= (dx / d) * force; a.vy -= (dy / d) * force
          b.vx += (dx / d) * force; b.vy += (dy / d) * force
        }
      }

      // Center pull
      for (const n of ns) {
        n.vx += (cx - n.x) * 0.004
        n.vy += (cy - n.y) * 0.004
        n.vx *= 0.85; n.vy *= 0.85
        n.x = Math.max(20, Math.min(w - 20, n.x + n.vx))
        n.y = Math.max(20, Math.min(h - 20, n.y + n.vy))
      }

      setSimNodes([...nsRef.current])
      animRef.current = requestAnimationFrame(tick)
    }

    animRef.current = requestAnimationFrame(tick)
    const stop = setTimeout(() => { if (animRef.current) cancelAnimationFrame(animRef.current) }, 4000)
    return () => { if (animRef.current) cancelAnimationFrame(animRef.current); clearTimeout(stop) }
  }, [nodes, edges, w, h])

  return simNodes
}

function nodeColor(n: GraphNode, locColor: string) {
  if (isRouterNode(n)) return locColor
  if (n.has_threats) return '#f85149'
  if (n.has_cves) return '#e3b341'
  if (n.is_online) return '#3fb950'
  return '#6b7f93'
}

function nodeRadius(n: GraphNode, maxBytes: number) {
  if (isRouterNode(n)) return 20
  return Math.max(8, Math.min(22, 8 + ((n.bytes_24h || 0) / Math.max(1, maxBytes)) * 14))
}

function ForceGraph({ graph, locColor }: { graph: CommGraph; locColor: string }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dims, setDims] = useState({ w: 800, h: 460 })
  const [tooltip, setTooltip] = useState<{ node: SimNode; x: number; y: number } | null>(null)

  useEffect(() => {
    if (!containerRef.current) return
    const obs = new ResizeObserver(e => {
      const { width } = e[0].contentRect
      setDims({ w: width, h: Math.min(480, Math.max(300, width * 0.55)) })
    })
    obs.observe(containerRef.current)
    return () => obs.disconnect()
  }, [])

  const simNodes = useForceSimulation(graph.nodes, graph.edges, dims.w, dims.h)
  const nodeMap  = new Map(simNodes.map(n => [n.id, n]))
  const maxBytes = Math.max(1, ...graph.nodes.map(n => n.bytes_24h || 0))

  if (graph.nodes.length === 0) {
    return <div className="flex items-center justify-center h-40 text-a-muted text-sm">No identity data for this location</div>
  }

  return (
    <div ref={containerRef} className="w-full relative">
      <svg width={dims.w} height={dims.h} className="overflow-visible">
        {/* Edges */}
        <g>
          {graph.edges.map((e, i) => {
            const src = nodeMap.get(e.source)
            const tgt = nodeMap.get(e.target)
            if (!src || !tgt) return null
            const w = Math.max(1, Math.min(5, (e.total_bytes / maxBytes) * 5))
            return <line key={i} x1={src.x} y1={src.y} x2={tgt.x} y2={tgt.y} stroke="#D1D5DB" strokeWidth={w} />
          })}
          {/* Star spokes to router if no real edges */}
          {graph.edges.length === 0 && (() => {
            const router = simNodes.find(isRouterNode)
            if (!router) return null
            return simNodes
              .filter(n => n.id !== router.id)
              .map(n => <line key={n.id} x1={router.x} y1={router.y} x2={n.x} y2={n.y} stroke="#E5E7EB" strokeWidth={1} />)
          })()}
        </g>
        {/* Nodes */}
        <g>
          {simNodes.map(n => {
            const r = nodeRadius(n, maxBytes)
            const c = nodeColor(n, locColor)
            return (
              <g key={n.id} className="cursor-pointer"
                onMouseEnter={() => setTooltip({ node: n, x: n.x, y: n.y })}
                onMouseLeave={() => setTooltip(null)}
                onClick={() => {
                  if (!isRouterNode(n)) {
                    window.location.href = `/device?identity_id=${encodeURIComponent(n.id)}`
                  }
                }}
              >
                <circle cx={n.x} cy={n.y} r={r} fill={c} stroke="#fff" strokeWidth={2} />
                <text x={n.x} y={n.y - r - 4} textAnchor="middle" fontSize={9} fill="#6B7280">{n.label.substring(0, 14)}</text>
              </g>
            )
          })}
        </g>
      </svg>
      {/* Tooltip */}
      {tooltip && (
        <div className="absolute z-20 bg-white border border-gray-200 rounded-lg px-3 py-2 text-xs pointer-events-none shadow-lg"
          style={{ left: Math.min(tooltip.x + 16, dims.w - 200), top: Math.max(tooltip.y - 60, 0), maxWidth: 200 }}>
          <div className="font-semibold text-gray-900">{tooltip.node.label}</div>
          {tooltip.node.ip && <div className="text-gray-400 mt-0.5 font-mono text-[10px]">{tooltip.node.ip}</div>}
          {tooltip.node.device_type && <div className="text-gray-500 text-[10px]">{tooltip.node.device_type}</div>}
          <div className={`text-[11px] font-medium mt-0.5 ${tooltip.node.is_online ? 'text-green-600' : 'text-gray-400'}`}>
            {tooltip.node.is_online ? 'Online' : `Offline · ${timeAgo(tooltip.node.last_seen)}`}
          </div>
          {(tooltip.node.bytes_24h || 0) > 0 && (
            <div className="text-gray-400 text-[10px]">↕ {fmtBytes(tooltip.node.bytes_24h || 0)} / 24h</div>
          )}
          {tooltip.node.has_threats && <div className="text-red-500 text-[10px]">⚠ Threats detected</div>}
          {tooltip.node.has_cves   && <div className="text-amber-500 text-[10px]">🔓 CVEs found</div>}
        </div>
      )}
      <div className="mt-3 flex gap-4 text-[10px] text-a-muted">
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />Online</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-gray-400 inline-block" />Offline</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-red-500 inline-block" />Threat</span>
        <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 inline-block" />CVE</span>
      </div>
    </div>
  )
}

function LocCard({ card, onDrillDown }: { card: LocationCard; onDrillDown: (loc: string) => void }) {
  const cfg = LOC_CONFIG[card.location]
  if (!cfg) return null
  const pct = card.online_pct
  const C = 2 * Math.PI * 18
  const onlineDash = (pct / 100) * C
  const pos = LOC_POSITIONS[card.location] ?? { top: 50, left: 50 }
  const ringColor = pct >= 90 ? '#3fb950' : pct >= 50 ? '#e3b341' : '#f85149'
  const borderCls = pct === 100 ? 'border-green-400' : pct >= 50 ? 'border-yellow-400' : 'border-red-400'

  return (
    <div
      style={{ position: 'absolute', top: `${pos.top}%`, left: `${pos.left}%`, transform: 'translate(-50%,-50%)' }}
      className={`bg-white border-2 ${borderCls} rounded-xl p-4 w-44 cursor-pointer hover:shadow-lg transition-shadow z-10`}
      onClick={() => onDrillDown(card.location)}
    >
      <div className="flex items-center justify-between mb-1">
        <span className={`text-sm font-bold ${cfg.textCls}`}>{card.location}</span>
        <svg width={44} height={44} viewBox="0 0 44 44">
          <circle cx={22} cy={22} r={18} fill="none" stroke="#E5E7EB" strokeWidth={5} />
          <circle cx={22} cy={22} r={18} fill="none" stroke={ringColor} strokeWidth={5}
            strokeDasharray={`${onlineDash.toFixed(1)} ${C.toFixed(1)}`}
            strokeDashoffset={`${(C / 4).toFixed(1)}`} />
          <text x={22} y={26} textAnchor="middle" fontSize={9} fontWeight="bold" fill="#374151">{pct}%</text>
        </svg>
      </div>
      <div className="text-[11px] text-gray-400">{cfg.label}</div>
      <div className="text-xs mt-1">
        <span className="text-green-600 font-semibold">{card.online_devices}</span>
        <span className="text-gray-400"> / {card.total_devices} online</span>
      </div>
      {card.threat_count > 0 && (
        <div className="text-[10px] text-red-500 mt-0.5">⚠ {card.threat_count} threat{card.threat_count > 1 ? 's' : ''}</div>
      )}
      {card.cve_count > 0 && (
        <div className="text-[10px] text-amber-500 mt-0.5">🔓 {card.cve_count} CVE{card.cve_count > 1 ? 's' : ''}</div>
      )}
      <div className="mt-2 space-y-0.5">
        {(card.top_devices ?? []).slice(0, 3).map((d, i) => (
          <div key={i} className="flex items-center gap-1 text-[10px] text-gray-500 truncate">
            <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${d.is_online ? 'bg-green-400' : 'bg-gray-300'}`} />
            {d.display_name}
          </div>
        ))}
      </div>
      <div className="text-[10px] text-indigo-400 mt-2">Click to explore →</div>
    </div>
  )
}

function GeographicView({ cards, onDrillDown }: { cards: LocationCard[]; onDrillDown: (loc: string) => void }) {
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

  function posToPixel(pos: { top: number; left: number }) {
    return { x: (pos.left / 100) * svgSize.w, y: (pos.top / 100) * svgSize.h }
  }

  const onlineCounts = Object.fromEntries(cards.map(c => [c.location, c.online_devices]))

  return (
    <div ref={containerRef} className="relative w-full" style={{ minHeight: 400 }}>
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
        viewBox={`0 0 ${svgSize.w} ${svgSize.h}`} preserveAspectRatio="none">
        {TUNNELS.map(([a, b]) => {
          const pa = posToPixel(LOC_POSITIONS[a] ?? { top: 50, left: 50 })
          const pb = posToPixel(LOC_POSITIONS[b] ?? { top: 50, left: 50 })
          const bothUp = (onlineCounts[a] ?? 0) > 0 && (onlineCounts[b] ?? 0) > 0
          const mx = (pa.x + pb.x) / 2
          const my = (pa.y + pb.y) / 2
          return (
            <g key={`${a}-${b}`}>
              <line x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y}
                stroke={bothUp ? '#22C55E' : '#D1D5DB'} strokeWidth={bothUp ? 2 : 1.5}
                strokeDasharray={bothUp ? undefined : '6 4'} opacity={0.65} />
              <text x={mx} y={my - 6} textAnchor="middle" fontSize={8} fill="#9CA3AF">VPN</text>
            </g>
          )
        })}
      </svg>
      {cards.map(c => (
        <LocCard key={c.location} card={c} onDrillDown={onDrillDown} />
      ))}
    </div>
  )
}

export default function MapPage() {
  const [cards,      setCards]      = useState<LocationCard[]>([])
  const [graph,      setGraph]      = useState<CommGraph | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [graphLoading, setGraphLoading] = useState(false)
  const [error,      setError]      = useState('')
  const [drilldown,  setDrilldown]  = useState<string | null>(null)
  const [updatedAt,  setUpdatedAt]  = useState<Date | null>(null)

  const load = useCallback(async () => {
    try {
      const c = await getLocationCards()
      setCards(c)
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

  async function handleDrillDown(loc: string) {
    if (drilldown === loc) { setDrilldown(null); setGraph(null); return }
    setDrilldown(loc)
    setGraph(null)
    setGraphLoading(true)
    try {
      const g = await getCommGraph(loc)
      setGraph(g)
    } catch {
      setGraph(null)
    } finally {
      setGraphLoading(false)
    }
  }

  const cfg = drilldown ? LOC_CONFIG[drilldown] : null
  const activeCard = drilldown ? cards.find(c => c.location === drilldown) : null

  return (
    <div className="min-h-screen bg-a-bg text-a-text font-sans">
      <header className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 shadow-sm">
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-gray-900 font-bold text-sm tracking-tight">🛡️ Argus</Link>
            <span className="text-gray-200 select-none">|</span>
            <span className="text-indigo-600 font-semibold text-sm">🗺️ Network Map</span>
            {drilldown && cfg && (
              <>
                <span className="text-gray-200 select-none">|</span>
                <span className={`text-sm font-semibold ${cfg.textCls}`}>{cfg.label}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {drilldown && (
              <button onClick={() => { setDrilldown(null); setGraph(null) }}
                className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">
                ← All Locations
              </button>
            )}
            <Link href="/guests" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">👥 Guests</Link>
            <Link href="/alerts" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">🔔 Alerts</Link>
            <Link href="/" className="px-3 py-1.5 bg-white border border-gray-200 text-gray-700 text-[13px] font-medium rounded-lg hover:bg-gray-50 transition-colors">← Dashboard</Link>
            {updatedAt && (
              <span className="text-[10px] text-gray-400 ml-2">Updated {timeAgo(updatedAt.toISOString())}</span>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-8">
        <ErrorBoundary label="Network Map">
          {error && (
            <div className="mb-6 border border-red-200 bg-red-50 text-red-600 rounded-lg px-4 py-3 text-sm">⚠ {error}</div>
          )}

          {loading ? (
            <div className="flex items-center justify-center py-24 text-a-muted text-sm">
              <span className="animate-spin-fast mr-2">◌</span>Loading network map…
            </div>
          ) : (
            <>
              {/* Summary strip */}
              <div className="grid grid-cols-3 gap-4 mb-8">
                {cards.map(card => {
                  const lcfg = LOC_CONFIG[card.location]
                  return (
                    <button key={card.location}
                      onClick={() => handleDrillDown(card.location)}
                      className={`bg-white border rounded-xl px-4 py-3 text-left transition-all hover:shadow-md ${
                        drilldown === card.location ? 'border-indigo-400 shadow-md' : 'border-gray-200'
                      }`}
                    >
                      <div className={`text-[10px] font-semibold uppercase tracking-wider mb-1 ${lcfg?.textCls}`}>{card.location}</div>
                      <div className="text-lg font-bold text-gray-900">
                        {card.online_devices}
                        <span className="text-gray-400 text-sm font-normal">/{card.total_devices}</span>
                      </div>
                      <div className="text-[10px] text-gray-400">online — {Math.round(card.online_pct)}%</div>
                      {(card.threat_count > 0 || card.cve_count > 0) && (
                        <div className="flex gap-2 mt-1">
                          {card.threat_count > 0 && <span className="text-[10px] text-red-500">⚠ {card.threat_count}</span>}
                          {card.cve_count > 0    && <span className="text-[10px] text-amber-500">🔓 {card.cve_count}</span>}
                        </div>
                      )}
                    </button>
                  )
                })}
              </div>

              {drilldown && activeCard ? (
                /* Drill-down: force graph */
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-card">
                  <div className="flex items-center justify-between mb-4">
                    <h2 className={`text-sm font-semibold ${cfg?.textCls}`}>
                      {cfg?.label} — {activeCard.total_devices} devices ({activeCard.online_devices} online)
                    </h2>
                    <span className="text-[11px] text-gray-400">Hover nodes for detail · Click to open device</span>
                  </div>
                  {graphLoading ? (
                    <div className="flex items-center justify-center py-16 text-a-muted text-sm">
                      <span className="animate-spin-fast mr-2">◌</span>Loading device graph…
                    </div>
                  ) : graph ? (
                    <>
                      <ForceGraph graph={graph} locColor={cfg?.color ?? '#6366F1'} />
                      {/* Device legend */}
                      <div className="mt-6 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-1.5 max-h-56 overflow-y-auto">
                        {graph.nodes
                          .filter(n => !isRouterNode(n))
                          .sort((a, b) => (b.bytes_24h || 0) - (a.bytes_24h || 0))
                          .map(n => (
                            <div key={n.id}
                              className="flex items-center gap-1.5 text-[10px] border border-gray-100 rounded px-2 py-1.5 hover:bg-gray-50 cursor-pointer transition-colors"
                              onClick={() => window.location.href = `/device?identity_id=${encodeURIComponent(n.id)}`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${n.has_threats ? 'bg-red-500' : n.is_online ? 'bg-green-500' : 'bg-gray-300'}`} />
                              <span className="text-gray-700 truncate flex-1">{n.label}</span>
                              {n.ip && <span className="text-gray-400 shrink-0 font-mono text-[9px]">{n.ip.split('.').slice(-1)[0]}</span>}
                            </div>
                          ))}
                      </div>
                    </>
                  ) : (
                    <div className="text-gray-400 text-sm py-8 text-center">No graph data available for this location.</div>
                  )}
                </div>
              ) : (
                /* Geographic overview */
                <div className="bg-white border border-gray-200 rounded-xl p-6 shadow-card">
                  <h2 className="text-[10px] text-gray-400 uppercase tracking-wider mb-6">
                    Network Topology — Click a location to explore
                  </h2>
                  <GeographicView cards={cards} onDrillDown={handleDrillDown} />
                </div>
              )}
            </>
          )}
        </ErrorBoundary>
      </main>
    </div>
  )
}
