// @ts-ignore – CSS side-effect import; suppress TS2882 (no css module typings)
import 'reactflow/dist/style.css'
import { useMemo, useState } from 'react'
import ReactFlow, {
  type Node,
  type Edge,
  MiniMap,
  Controls,
  Background,
  BackgroundVariant,
  MarkerType,
} from 'reactflow'

import type { DependencyGraph as DependencyGraphType, DependencyNode, DependencyEdge } from '../types'

// ── Colour palette by node type ────────────────────────────────────────────────

const TYPE_COLORS = {
  root:        { bg: '#0f4c25', border: '#22c55e', text: '#dcfce7', label: '🌳 Root'        },
  direct:      { bg: '#1e3a8a', border: '#3b82f6', text: '#dbeafe', label: '📦 Direct'      },
  transitive:  { bg: '#4c1d95', border: '#a855f7', text: '#f3e8ff', label: '🔗 Transitive'  },
  dev:         { bg: '#7c2d12', border: '#f97316', text: '#ffedd5', label: '🔧 Dev'         },
  unknown:     { bg: '#1f2937', border: '#6b7280', text: '#f3f4f6', label: '❓ Unknown'     },
}

function getTypeColors(type?: string) {
  return TYPE_COLORS[(type as keyof typeof TYPE_COLORS) ?? 'unknown'] ?? TYPE_COLORS.unknown
}

// ── BFS Layered Layout ────────────────────────────────────────────────────────
// Assigns each node to the deepest layer reachable from roots (BFS).
// Nodes at the same layer are spread horizontally.

const H_GAP = 200   // px between nodes horizontally
const V_GAP = 120   // px between layers vertically

function computeBFSPositions(
  nodes: DependencyNode[],
  edges: DependencyEdge[],
): Map<string, { x: number; y: number }> {
  const posMap = new Map<string, { x: number; y: number }>()
  if (nodes.length === 0) return posMap

  const nodeIds = new Set(nodes.map(n => n.id))

  // Build adjacency list (forward edges only)
  const adj = new Map<string, string[]>()
  for (const n of nodes) adj.set(n.id, [])
  for (const e of edges) {
    if (nodeIds.has(e.from) && nodeIds.has(e.to)) {
      adj.get(e.from)?.push(e.to)
    }
  }

  // Determine roots: nodes that are of type "root" or have no incoming edges
  const hasIncoming = new Set(
    edges.filter(e => nodeIds.has(e.from) && nodeIds.has(e.to)).map(e => e.to)
  )
  let roots = nodes.filter(n => n.type === 'root' || !hasIncoming.has(n.id)).map(n => n.id)
  if (roots.length === 0) roots = [nodes[0].id]

  // BFS to assign layers
  const layer = new Map<string, number>()
  const queue: Array<{ id: string; depth: number }> = roots.map(id => ({ id, depth: 0 }))
  for (const r of roots) layer.set(r, 0)

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    for (const child of adj.get(id) ?? []) {
      // Use the maximum depth reachable so transitive deps sink lower
      if (!layer.has(child) || layer.get(child)! < depth + 1) {
        layer.set(child, depth + 1)
        queue.push({ id: child, depth: depth + 1 })
      }
    }
  }

  // Assign unvisited nodes to a fallback layer
  const maxLayer = Math.max(0, ...Array.from(layer.values()))
  for (const n of nodes) {
    if (!layer.has(n.id)) layer.set(n.id, maxLayer + 1)
  }

  // Group by layer
  const layerGroups = new Map<number, string[]>()
  for (const [id, l] of layer) {
    if (!layerGroups.has(l)) layerGroups.set(l, [])
    layerGroups.get(l)!.push(id)
  }

  // Assign x/y positions
  for (const [l, ids] of layerGroups) {
    const totalWidth = (ids.length - 1) * H_GAP
    ids.forEach((id, i) => {
      posMap.set(id, {
        x: i * H_GAP - totalWidth / 2,
        y: l * V_GAP,
      })
    })
  }

  return posMap
}

// ── Node style factory ────────────────────────────────────────────────────────

function makeNodeData(node: DependencyNode): { label: React.ReactNode } {
  const { border, text } = getTypeColors(node.type)
  return {
    label: (
      <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
        <div style={{ color: text, fontWeight: 700, fontSize: 12 }}>{node.id}</div>
        {node.version && (
          <div style={{ color: border, fontSize: 10, marginTop: 2, opacity: 0.85 }}>
            v{node.version}
          </div>
        )}
      </div>
    ),
  }
}

function makeNodeStyle(node: DependencyNode): React.CSSProperties {
  const { bg, border } = getTypeColors(node.type)
  return {
    background: bg,
    border: `1.5px solid ${border}`,
    borderRadius: 10,
    padding: '8px 16px',
    minWidth: 130,
    maxWidth: 200,
    boxShadow: `0 0 14px ${border}55`,
    cursor: 'default',
  }
}

// ── Stats bar ─────────────────────────────────────────────────────────────────

function StatsBar({ nodes }: { nodes: DependencyNode[] }) {
  const counts = useMemo(() => {
    const c = { total: nodes.length, root: 0, direct: 0, transitive: 0, dev: 0, unknown: 0 }
    for (const n of nodes) {
      const t = (n.type ?? 'unknown') as keyof typeof c
      if (t in c) (c[t] as number)++
      else c.unknown++
    }
    return c
  }, [nodes])

  const items = [
    { label: 'Total',       value: counts.total,      color: '#a3a3a3' },
    { label: 'Direct',      value: counts.direct,     color: '#3b82f6' },
    { label: 'Transitive',  value: counts.transitive, color: '#a855f7' },
    { label: 'Dev',         value: counts.dev,        color: '#f97316' },
  ]

  return (
    <div style={{ display: 'flex', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
      {items.map(({ label, value, color }) => (
        <div
          key={label}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            background: 'rgba(255,255,255,0.04)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 8,
            padding: '4px 12px',
          }}
        >
          <span style={{ fontSize: 18, fontWeight: 800, color }}>{value}</span>
          <span style={{ fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{label}</span>
        </div>
      ))}
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  graphJson: string
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function DependencyGraph({ graphJson }: Props) {
  const [filterType, setFilterType] = useState<string>('all')

  const { nodes: rfNodes, edges: rfEdges, rawNodes, valid } = useMemo(() => {
    if (!graphJson || !graphJson.trim()) {
      return { nodes: [], edges: [], rawNodes: [], valid: false }
    }

    let parsed: DependencyGraphType
    try {
      parsed = JSON.parse(graphJson) as DependencyGraphType
    } catch {
      return { nodes: [], edges: [], rawNodes: [], valid: false }
    }

    const rawNodes: DependencyNode[] = Array.isArray(parsed?.nodes) ? parsed.nodes : []
    const rawEdges: DependencyEdge[] = Array.isArray(parsed?.edges) ? parsed.edges : []

    if (rawNodes.length === 0) {
      return { nodes: [], edges: [], rawNodes: [], valid: false }
    }

    const positions = computeBFSPositions(rawNodes, rawEdges)
    const nodeSet = new Set(rawNodes.map(n => n.id))

    const nodes: Node[] = rawNodes.map(n => ({
      id:       n.id,
      data:     makeNodeData(n),
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      style:    makeNodeStyle(n),
    }))

    const edges: Edge[] = rawEdges
      .filter(e => nodeSet.has(e.from) && nodeSet.has(e.to))
      .map((e, i) => {
        const isDev = e.type === 'dev_depends_on'
        return {
          id:           `edge-${i}`,
          source:       e.from,
          target:       e.to,
          animated:     !isDev,
          style:        {
            stroke:      isDev ? '#f97316' : '#3b82f6',
            strokeWidth: 1.5,
            strokeDasharray: isDev ? '6 3' : undefined,
          },
          markerEnd:    {
            type:  MarkerType.ArrowClosed,
            color: isDev ? '#f97316' : '#3b82f6',
          },
        }
      })

    return { nodes, edges, rawNodes, valid: true }
  }, [graphJson])

  // Filter visible nodes by type
  const visibleNodes = useMemo(() =>
    filterType === 'all'
      ? rfNodes
      : rfNodes.filter(n => {
          const raw = rawNodes.find(r => r.id === n.id)
          return raw?.type === filterType
        }),
    [rfNodes, rawNodes, filterType]
  )

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes])

  const visibleEdges = useMemo(() =>
    rfEdges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [rfEdges, visibleNodeIds]
  )

  // ── Empty / invalid fallback ─────────────────────────────────────────────
  if (!valid) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: 200,
        borderRadius: 12,
        border: '1px solid rgba(255,255,255,0.08)',
        background: '#111111',
        gap: 8,
      }}>
        <span style={{ fontSize: 32 }}>📦</span>
        <p style={{ color: '#6b7280', fontSize: 14 }}>No dependency graph data available.</p>
        <p style={{ color: '#4b5563', fontSize: 12 }}>Re-analyze the repository to generate the graph.</p>
      </div>
    )
  }

  return (
    <div>
      {/* Stats */}
      <StatsBar nodes={rawNodes} />

      {/* Filter bar */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
        {(['all', 'root', 'direct', 'transitive', 'dev'] as const).map(t => (
          <button
            key={t}
            onClick={() => setFilterType(t)}
            style={{
              padding: '4px 14px',
              borderRadius: 20,
              fontSize: 11,
              fontWeight: 700,
              border: `1.5px solid ${filterType === t ? getTypeColors(t === 'all' ? undefined : t).border : 'rgba(255,255,255,0.12)'}`,
              background: filterType === t ? `${getTypeColors(t === 'all' ? undefined : t).border}22` : 'transparent',
              color: filterType === t ? getTypeColors(t === 'all' ? undefined : t).border : '#6b7280',
              cursor: 'pointer',
              transition: 'all 0.15s',
              letterSpacing: '0.04em',
              textTransform: 'uppercase',
            }}
          >
            {t === 'all' ? 'All Nodes' : TYPE_COLORS[t as keyof typeof TYPE_COLORS].label}
          </button>
        ))}
      </div>

      {/* Graph canvas */}
      <div
        id="dependency-graph"
        style={{
          width: '100%',
          height: 560,
          background: 'linear-gradient(135deg, #0d0d0d 0%, #111827 100%)',
          borderRadius: 14,
          overflow: 'hidden',
          border: '1px solid rgba(255,255,255,0.08)',
          position: 'relative',
        }}
      >
        <ReactFlow
          nodes={visibleNodes}
          edges={visibleEdges}
          fitView
          fitViewOptions={{ padding: 0.3 }}
          minZoom={0.2}
          maxZoom={2.5}
          attributionPosition="bottom-right"
          proOptions={{ hideAttribution: true }}
        >
          <Background
            variant={BackgroundVariant.Dots}
            gap={24}
            size={1}
            color="#ffffff12"
          />
          <Controls
            style={{
              background: '#111111',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
            }}
          />
          <MiniMap
            nodeColor={node => {
              const raw = rawNodes.find(r => r.id === node.id)
              return getTypeColors(raw?.type).border
            }}
            maskColor="rgba(10,10,10,0.8)"
            style={{
              background: '#0d0d0d',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 8,
            }}
          />
        </ReactFlow>

        {/* Legend */}
        <div
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 5,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            borderRadius: 10,
            padding: '8px 12px',
            border: '1px solid rgba(255,255,255,0.08)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontSize: 9, fontWeight: 800, color: '#4b5563', letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 2 }}>
            Legend
          </div>
          {Object.entries(TYPE_COLORS).filter(([k]) => k !== 'unknown').map(([key, { border, label }]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: border, flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: '#9ca3af', fontWeight: 600 }}>{label}</span>
            </div>
          ))}
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 4, paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{ width: 18, height: 2, background: '#3b82f6', borderRadius: 2 }} />
              <span style={{ fontSize: 10, color: '#9ca3af' }}>depends_on</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 3 }}>
              <div style={{ width: 18, height: 2, background: '#f97316', borderRadius: 2, borderTop: '2px dashed #f97316' }} />
              <span style={{ fontSize: 10, color: '#9ca3af' }}>dev only</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
