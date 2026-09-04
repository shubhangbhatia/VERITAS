import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { getRings, demoInject, getResults, createCase, logAuditEvent } from '../api'
import type { RingSummary, Identity } from '../types'

/* ── Helpers ────────────────────────────────────────────────────────────── */

function riskColor(score: number): string {
  if (score > 0.75) return 'var(--risk-high)'
  if (score > 0.45) return 'var(--risk-medium)'
  return 'var(--risk-low)'
}

function riskClass(score: number): string {
  if (score > 0.75) return 'high'
  if (score > 0.45) return 'medium'
  return 'low'
}

function threatLabel(score: number): string {
  if (score > 0.85) return 'CRITICAL THREAT'
  if (score > 0.70) return 'HIGH RISK'
  if (score > 0.45) return 'ELEVATED'
  return 'MONITORED'
}

function ringLabel(id: number): string {
  const names = ['ALPHA', 'BETA', 'DELTA', 'GAMMA', 'OMEGA', 'SIGMA', 'ZETA', 'EPSILON', 'KAPPA', 'THETA']
  return `RING-${names[id % names.length]}-${id}`
}

function ringVectorDna(id: number): string[] {
  const allVectors = [
    ['Subnet AS40029 Collision', 'Synthetic SSN Generation', 'Rapid Address Hop'],
    ['Device Fingerprint Spoof', 'Cross-App Identity Loop', 'Biometric Injection'],
    ['Payment Velocity Spike', 'Shared Phone (4x)', 'Synthetic Credit File'],
    ['Mule Network Topology', 'Stolen Graph Collision', 'Seed Node Replay'],
  ]
  return allVectors[id % allVectors.length]
}

/* ── Types for Graph Visualization ─────────────────────────────────────── */

interface GraphNode {
  id: string
  name: string
  ringId: number
  ringName: string
  fusedScore: number
  x: number
  y: number
  isHub?: boolean
  role: 'Seed Node' | 'Synthetic Clone' | 'Payment Mule' | 'Colluding Identity'
  vector: string
}

interface GraphLink {
  source: GraphNode
  target: GraphNode
  type: 'hub' | 'inter-node' | 'cross-ring'
}

/* ── Fraud Rings Page Component ────────────────────────────────────────── */

export default function FraudRingsPage() {
  const navigate = useNavigate()

  // Data states
  const [rings, setRings] = useState<RingSummary[]>([])
  const [allIdentities, setAllIdentities] = useState<Identity[]>([])
  const [loading, setLoading] = useState(true)
  const [injecting, setInjecting] = useState(false)
  const [injectMsg, setInjectMsg] = useState<{ text: string; ok: boolean } | null>(null)

  // View mode
  const [viewMode, setViewMode] = useState<'graph' | 'dossiers' | 'matrix'>('graph')

  // Selection & Inspector
  const [selectedRing, setSelectedRing] = useState<RingSummary | null>(null)
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [ringMembers, setRingMembers] = useState<Identity[]>([])
  const [quarantinedRings, setQuarantinedRings] = useState<Set<number>>(new Set())

  // Graph interaction
  const [zoom, setZoom] = useState(1)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [activeFilter, setActiveFilter] = useState<'ALL' | 'CRITICAL' | 'ELEVATED'>('ALL')
  const svgRef = useRef<SVGSVGElement>(null)

  /* ── Fetch Data ────────────────────────────────────────────────────────── */
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const [ringsRes, resultsRes] = await Promise.all([
        getRings(),
        getResults({ ring_flag: true, limit: 150 })
      ])
      setRings(ringsRes.rings ?? [])
      setAllIdentities(resultsRes.identities ?? [])
    } catch (err) {
      console.error('Failed to load fraud rings data:', err)
      setRings([])
      setAllIdentities([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  /* ── Inject Live Fraud Ring ────────────────────────────────────────────── */
  const handleInject = async () => {
    setInjecting(true)
    setInjectMsg(null)
    try {
      const res = await demoInject()
      setInjectMsg({
        text: `Injected ${res.injected} synthetic identities into Syndicate Cluster #${res.ring_cluster_id}`,
        ok: true,
      })
      await loadData()
      logAuditEvent('upload', `INJ-RING-${res.ring_cluster_id}`, 'Synthetic Cluster Injection', { count: res.injected })
    } catch (e: any) {
      setInjectMsg({ text: `Injection failed: ${e.message}`, ok: false })
    } finally {
      setInjecting(false)
    }
  }

  /* ── Select Ring and fetch its specific member identities ──────────────── */
  const handleSelectRing = async (ring: RingSummary) => {
    setSelectedRing(ring)
    setSelectedNode(null)
    const filtered = allIdentities.filter(i => i.cluster_id === ring._id)
    setRingMembers(filtered)
    logAuditEvent('inspect', `RING-${ring._id}`, ringLabel(ring._id), { memberCount: ring.member_count })
  }

  /* ── Quarantine Entire Ring ────────────────────────────────────────────── */
  const handleQuarantineRing = async (ring: RingSummary) => {
    setQuarantinedRings(prev => new Set([...prev, ring._id]))
    try {
      await Promise.all(
        ring.members.slice(0, 5).map(m =>
          createCase({
            identity_id: m.id,
            status: 'seized',
            notes: `Auto-seized via Fraud Ring Quarantine: ${ringLabel(ring._id)}`
          })
        )
      )
      logAuditEvent('quarantine', `RING-${ring._id}`, ringLabel(ring._id), { members: ring.member_count })
    } catch (e) {
      console.warn('Non-fatal quarantine case note:', e)
    }
  }

  /* ── Filtered Rings ────────────────────────────────────────────────────── */
  const filteredRings = useMemo(() => {
    if (activeFilter === 'CRITICAL') return rings.filter(r => r.avg_fused_score > 0.75)
    if (activeFilter === 'ELEVATED') return rings.filter(r => r.avg_fused_score <= 0.75 && r.avg_fused_score > 0.45)
    return rings
  }, [rings, activeFilter])

  /* ── Graph Construction (Nodes & Links) ────────────────────────────────── */
  const { graphNodes, graphLinks } = useMemo(() => {
    const nodes: GraphNode[] = []
    const links: GraphLink[] = []

    if (filteredRings.length === 0) return { graphNodes: nodes, graphLinks: links }

    const width = 880
    const height = 560
    const centerX = width / 2
    const centerY = height / 2

    // Arrange ring clusters in a primary orbit
    const ringCount = filteredRings.length
    const clusterOrbitRadius = ringCount === 1 ? 0 : Math.min(220, 80 + ringCount * 30)

    filteredRings.forEach((ring, rIdx) => {
      const ringAngle = ringCount === 1 ? 0 : (rIdx / ringCount) * 2 * Math.PI - Math.PI / 2
      const clusterCenterX = ringCount === 1 ? centerX : centerX + Math.cos(ringAngle) * clusterOrbitRadius
      const clusterCenterY = ringCount === 1 ? centerY : centerY + Math.sin(ringAngle) * clusterOrbitRadius

      // Hub node (represents the cluster core)
      const hubNode: GraphNode = {
        id: `hub-${ring._id}`,
        name: ringLabel(ring._id),
        ringId: ring._id,
        ringName: ringLabel(ring._id),
        fusedScore: ring.avg_fused_score,
        x: clusterCenterX,
        y: clusterCenterY,
        isHub: true,
        role: 'Seed Node',
        vector: ringVectorDna(ring._id)[0],
      }
      nodes.push(hubNode)

      // Member nodes arranged in a mini orbit around the hub
      const members = ring.members || []
      const memberCount = Math.min(members.length, 8)
      const memberOrbitRadius = Math.min(75, 40 + memberCount * 4)

      const memberNodesForRing: GraphNode[] = []

      members.slice(0, memberCount).forEach((m, mIdx) => {
        const memberAngle = (mIdx / memberCount) * 2 * Math.PI
        const nodeX = clusterCenterX + Math.cos(memberAngle) * memberOrbitRadius
        const nodeY = clusterCenterY + Math.sin(memberAngle) * memberOrbitRadius

        const role: GraphNode['role'] = 
          mIdx === 0 ? 'Seed Node' : mIdx % 2 === 1 ? 'Synthetic Clone' : 'Payment Mule'

        const memberNode: GraphNode = {
          id: m.id,
          name: m.name || m.id,
          ringId: ring._id,
          ringName: ringLabel(ring._id),
          fusedScore: m.fused_score,
          x: nodeX,
          y: nodeY,
          role,
          vector: ringVectorDna(ring._id)[mIdx % ringVectorDna(ring._id).length],
        }

        nodes.push(memberNode)
        memberNodesForRing.push(memberNode)

        // Link from hub to member
        links.push({
          source: hubNode,
          target: memberNode,
          type: 'hub',
        })
      })

      // Inter-node links inside cluster
      for (let i = 0; i < memberNodesForRing.length; i++) {
        const next = (i + 1) % memberNodesForRing.length
        if (memberNodesForRing.length > 2) {
          links.push({
            source: memberNodesForRing[i],
            target: memberNodesForRing[next],
            type: 'inter-node',
          })
        }
      }
    })

    // Cross-ring link between first two clusters if multiple exist
    const hubs = nodes.filter(n => n.isHub)
    if (hubs.length >= 2) {
      links.push({
        source: hubs[0],
        target: hubs[1],
        type: 'cross-ring',
      })
    }

    return { graphNodes: nodes, graphLinks: links }
  }, [filteredRings])

  /* ── Derived Global Stats ──────────────────────────────────────────────── */
  const totalMembers = rings.reduce((s, r) => s + r.member_count, 0)
  const maxRisk = rings.length ? Math.max(...rings.map(r => r.avg_fused_score)) : 0
  const criticalCount = rings.filter(r => r.avg_fused_score > 0.75).length
  const elevatedCount = rings.filter(r => r.avg_fused_score <= 0.75 && r.avg_fused_score > 0.45).length

  /* ── Pan & Zoom Handlers for Graph ─────────────────────────────────────── */
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    setIsPanning(true)
    setPanStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isPanning) return
    setPan({ x: e.clientX - panStart.x, y: e.clientY - panStart.y })
  }

  const handleMouseUp = () => setIsPanning(false)

  const handleResetZoom = () => {
    setZoom(1)
    setPan({ x: 0, y: 0 })
  }

  return (
    <div className="rings-hub-root fade-in-up">
      {/* ── Top Command & Telemetry Ribbon ───────────────────────────────── */}
      <div className="rings-command-header">
        <div className="rings-header-meta">
          <div className="rings-header-badge">
            <span className="mat-icon" style={{ fontSize: 18, color: 'var(--color-accent)' }}>hub</span>
            <span className="rings-badge-text">SYNDICATE FORENSIC GRAPH</span>
          </div>
          <h1 className="rings-title">Fraud Ring Investigation &amp; Cluster Isolation</h1>
          <p className="rings-subtitle">
            HDBSCAN Topological Clustering // Vector Density Isolation // Multi-Node Syndicate Ledger
          </p>
        </div>

        {/* Global Key Metrics Bar */}
        <div className="rings-metrics-strip">
          <div className="rings-metric-item">
            <span className="rings-metric-label">ACTIVE SYNDICATES</span>
            <span className="rings-metric-value accent">{rings.length}</span>
            <span className="rings-metric-sub">{criticalCount} critical rings</span>
          </div>
          <div className="rings-metric-divider" />
          <div className="rings-metric-item">
            <span className="rings-metric-label">COMPROMISED NODES</span>
            <span className="rings-metric-value">{totalMembers}</span>
            <span className="rings-metric-sub">Identities linked</span>
          </div>
          <div className="rings-metric-divider" />
          <div className="rings-metric-item">
            <span className="rings-metric-label">MAX COHESION RISK</span>
            <span className="rings-metric-value" style={{ color: riskColor(maxRisk) }}>
              {(maxRisk * 100).toFixed(0)}%
            </span>
            <span className="rings-metric-sub" style={{ color: riskColor(maxRisk) }}>
              {threatLabel(maxRisk)}
            </span>
          </div>
          <div className="rings-metric-divider" />
          <div className="rings-metric-item">
            <span className="rings-metric-label">QUARANTINED GRAPHS</span>
            <span className="rings-metric-value danger">{quarantinedRings.size}</span>
            <span className="rings-metric-sub">Seized clusters</span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="rings-actions-row">
          {/* View Mode Switcher */}
          <div className="rings-view-switcher">
            <button
              type="button"
              className={`rings-view-btn ${viewMode === 'graph' ? 'active' : ''}`}
              onClick={() => setViewMode('graph')}
            >
              <span className="mat-icon" style={{ fontSize: 16 }}>schema</span>
              VECTOR TOPOLOGY GRAPH
            </button>
            <button
              type="button"
              className={`rings-view-btn ${viewMode === 'dossiers' ? 'active' : ''}`}
              onClick={() => setViewMode('dossiers')}
            >
              <span className="mat-icon" style={{ fontSize: 16 }}>grid_view</span>
              SYNDICATE DOSSIERS ({rings.length})
            </button>
            <button
              type="button"
              className={`rings-view-btn ${viewMode === 'matrix' ? 'active' : ''}`}
              onClick={() => setViewMode('matrix')}
            >
              <span className="mat-icon" style={{ fontSize: 16 }}>table_chart</span>
              MEMBER MATRIX
            </button>
          </div>

          <div className="rings-header-btns">
            <button
              id="inject-ring-btn"
              className="rings-inject-btn"
              onClick={handleInject}
              disabled={injecting}
            >
              <span className="mat-icon" style={{ fontSize: 16 }}>radar</span>
              {injecting ? 'INJECTING LIVE CLUSTER...' : 'INJECT LIVE FRAUD RING'}
              <span className="inject-shimmer" />
            </button>
            <button className="rings-refresh-btn" onClick={loadData} title="Refresh graph telemetry">
              <span className={`mat-icon ${loading ? 'spin' : ''}`} style={{ fontSize: 16 }}>refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inject result alert */}
      {injectMsg && (
        <div className={`rings-alert ${injectMsg.ok ? 'success' : 'error'}`}>
          <span className="mat-icon" style={{ fontSize: 18 }}>
            {injectMsg.ok ? 'check_circle' : 'warning'}
          </span>
          <span>{injectMsg.text}</span>
        </div>
      )}

      {/* ── Main Investigative Workspace ───────────────────────────────── */}
      <div className="rings-workspace">
        {/* VIEW 1: INTERACTIVE VECTOR TOPOLOGY GRAPH */}
        {viewMode === 'graph' && (
          <div className="rings-graph-container">
            {/* Graph Toolbar */}
            <div className="rings-graph-toolbar">
              <div className="graph-filter-chips">
                <span className="graph-toolbar-label">CLUSTER THREAT FILTER:</span>
                <button
                  className={`graph-filter-btn ${activeFilter === 'ALL' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('ALL')}
                >
                  ALL ({rings.length})
                </button>
                <button
                  className={`graph-filter-btn ${activeFilter === 'CRITICAL' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('CRITICAL')}
                >
                  CRITICAL ({criticalCount})
                </button>
                <button
                  className={`graph-filter-btn ${activeFilter === 'ELEVATED' ? 'active' : ''}`}
                  onClick={() => setActiveFilter('ELEVATED')}
                >
                  ELEVATED ({elevatedCount})
                </button>
              </div>

              <div className="graph-zoom-controls">
                <button
                  className="graph-zoom-btn"
                  onClick={() => setZoom(z => Math.min(z + 0.2, 2.5))}
                  title="Zoom In"
                >
                  <span className="mat-icon" style={{ fontSize: 16 }}>zoom_in</span>
                </button>
                <button
                  className="graph-zoom-btn"
                  onClick={() => setZoom(z => Math.max(z - 0.2, 0.5))}
                  title="Zoom Out"
                >
                  <span className="mat-icon" style={{ fontSize: 16 }}>zoom_out</span>
                </button>
                <button className="graph-zoom-btn" onClick={handleResetZoom} title="Reset View">
                  <span className="mat-icon" style={{ fontSize: 16 }}>center_focus_strong</span>
                </button>
                <span className="graph-zoom-pct">{(zoom * 100).toFixed(0)}%</span>
              </div>
            </div>

            {/* SVG Graph Canvas */}
            <div
              className={`rings-svg-viewport ${isPanning ? 'panning' : ''}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              <div className="rings-grid-bg" />

              <svg
                ref={svgRef}
                className="rings-svg-canvas"
                viewBox="0 0 880 560"
              >
                <defs>
                  {/* Glowing filters */}
                  <filter id="glow-cyan" x="-20%" y="-20%" width="140%" height="140%">
                    <feGaussianBlur stdDeviation="3" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                  <filter id="glow-red" x="-30%" y="-30%" width="160%" height="160%">
                    <feGaussianBlur stdDeviation="4" result="blur" />
                    <feComposite in="SourceGraphic" in2="blur" operator="over" />
                  </filter>
                </defs>

                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`}>
                  {/* Graph Link Lines */}
                  {graphLinks.map((link, idx) => {
                    const isCross = link.type === 'cross-ring'
                    const isSelected = selectedRing && (link.source.ringId === selectedRing._id || link.target.ringId === selectedRing._id)
                    return (
                      <line
                        key={`link-${idx}`}
                        x1={link.source.x}
                        y1={link.source.y}
                        x2={link.target.x}
                        y2={link.target.y}
                        className={`graph-link-line ${link.type} ${isSelected ? 'highlighted' : ''}`}
                        stroke={
                          isCross
                            ? 'rgba(245, 158, 11, 0.4)'
                            : isSelected
                            ? 'rgba(34, 211, 238, 0.7)'
                            : 'rgba(255, 255, 255, 0.08)'
                        }
                        strokeWidth={isCross ? 1.5 : isSelected ? 2 : 1}
                        strokeDasharray={isCross ? '4 4' : undefined}
                      />
                    )
                  })}

                  {/* Graph Nodes */}
                  {graphNodes.map(node => {
                    const isHub = node.isHub
                    const isSelected = selectedRing && selectedRing._id === node.ringId
                    const isNodeSelected = selectedNode?.id === node.id
                    const isHovered = hoveredNode?.id === node.id
                    const nodeColor = isHub
                      ? 'var(--color-accent)'
                      : riskColor(node.fusedScore)

                    return (
                      <g
                        key={node.id}
                        className={`graph-node-group ${isHub ? 'hub' : 'member'} ${isSelected ? 'selected' : ''}`}
                        transform={`translate(${node.x}, ${node.y})`}
                        onClick={(e) => {
                          e.stopPropagation()
                          const targetRing = rings.find(r => r._id === node.ringId)
                          if (targetRing) handleSelectRing(targetRing)
                          if (!isHub) setSelectedNode(node)
                        }}
                        onMouseEnter={() => setHoveredNode(node)}
                        onMouseLeave={() => setHoveredNode(null)}
                      >
                        {/* Hub Radar Pulse Aura */}
                        {isHub && (
                          <>
                            <circle
                              r={32}
                              fill="none"
                              stroke={node.fusedScore > 0.75 ? 'rgba(239, 68, 68, 0.25)' : 'rgba(34, 211, 238, 0.25)'}
                              strokeWidth={1}
                              className="graph-hub-pulse"
                            />
                            <circle
                              r={22}
                              fill="rgba(16, 17, 20, 0.85)"
                              stroke={node.fusedScore > 0.75 ? 'var(--risk-high)' : 'var(--color-accent)'}
                              strokeWidth={2}
                              filter="url(#glow-cyan)"
                            />
                            <text
                              textAnchor="middle"
                              dy=".3em"
                              fill="var(--color-text)"
                              fontSize="9"
                              fontFamily="var(--font-code)"
                              fontWeight="700"
                            >
                              #{node.ringId}
                            </text>
                            <text
                              textAnchor="middle"
                              y={34}
                              fill="var(--color-accent)"
                              fontSize="10"
                              fontFamily="var(--font-code)"
                              fontWeight="600"
                            >
                              {node.name}
                            </text>
                          </>
                        )}

                        {/* Member Identity Node */}
                        {!isHub && (
                          <>
                            <circle
                              r={isHovered || isNodeSelected ? 9 : 6}
                              fill={nodeColor}
                              stroke="#08090b"
                              strokeWidth={2}
                              style={{ transition: 'all 0.2s ease' }}
                            />
                            {(isHovered || isNodeSelected) && (
                              <text
                                textAnchor="middle"
                                y={-14}
                                fill="var(--color-text)"
                                fontSize="10"
                                fontFamily="var(--font-code)"
                              >
                                {node.name.length > 10 ? node.name.slice(0, 10) + '…' : node.name}
                              </text>
                            )}
                          </>
                        )}
                      </g>
                    )
                  })}
                </g>
              </svg>

              {/* Hover Tooltip Float */}
              {hoveredNode && !hoveredNode.isHub && (
                <div
                  className="graph-hover-card"
                  style={{
                    left: `${Math.min(700, hoveredNode.x * zoom + pan.x + 20)}px`,
                    top: `${Math.min(420, hoveredNode.y * zoom + pan.y - 40)}px`,
                  }}
                >
                  <div className="hover-card-header">
                    <span className="hover-card-title">{hoveredNode.name}</span>
                    <span className="hover-card-role">{hoveredNode.role}</span>
                  </div>
                  <div className="hover-card-body">
                    <div className="hover-card-row">
                      <span>AFFILIATION:</span>
                      <span className="hover-accent">{hoveredNode.ringName}</span>
                    </div>
                    <div className="hover-card-row">
                      <span>SYNTHETIC RISK:</span>
                      <span style={{ color: riskColor(hoveredNode.fusedScore), fontWeight: 700 }}>
                        {(hoveredNode.fusedScore * 100).toFixed(0)}%
                      </span>
                    </div>
                    <div className="hover-card-vector">
                      <span className="mat-icon" style={{ fontSize: 12 }}>hub</span>
                      {hoveredNode.vector}
                    </div>
                  </div>
                </div>
              )}

              {/* Graph Legend Overlay */}
              <div className="graph-legend-overlay">
                <div className="legend-item">
                  <span className="legend-circle hub" />
                  <span>Cluster Centroid (Hub)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-circle high" />
                  <span>Critical Risk Node (&gt;75%)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-circle medium" />
                  <span>Elevated Risk Node (&gt;45%)</span>
                </div>
                <div className="legend-item">
                  <span className="legend-line inter-cluster" />
                  <span>Cross-Syndicate Device Collision</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* VIEW 2: SYNDICATE DOSSIERS (GRID VIEW) */}
        {viewMode === 'dossiers' && (
          <div className="rings-dossiers-grid">
            {filteredRings.length === 0 ? (
              <div className="rings-empty-panel">
                <span className="mat-icon" style={{ fontSize: 40, color: 'var(--color-text-muted)' }}>hub</span>
                <h3>No Syndicates Match Current Filter</h3>
                <p>Inject a live fraud ring cluster to simulate high-cohesion synthetic networks.</p>
                <button className="rings-inject-btn" onClick={handleInject} disabled={injecting}>
                  INJECT LIVE FRAUD RING
                </button>
              </div>
            ) : (
              filteredRings.map(ring => {
                const isSelected = selectedRing?._id === ring._id
                const isQuarantined = quarantinedRings.has(ring._id)
                const score = ring.avg_fused_score
                const vectors = ringVectorDna(ring._id)

                return (
                  <div
                    key={ring._id}
                    className={`syndicate-card ${isSelected ? 'selected' : ''} ${isQuarantined ? 'quarantined' : ''}`}
                    onClick={() => handleSelectRing(ring)}
                  >
                    <div className="syndicate-card-header">
                      <div className="syndicate-badge-wrap">
                        <span className="mat-icon syndicate-icon">hub</span>
                        <div>
                          <h3 className="syndicate-callsign">{ringLabel(ring._id)}</h3>
                          <span className="syndicate-sub-id">CLUSTER ID #{ring._id}</span>
                        </div>
                      </div>
                      <div className="syndicate-status-pill">
                        {isQuarantined ? (
                          <span className="status-tag quarantined">
                            <span className="status-dot red" />
                            QUARANTINED
                          </span>
                        ) : (
                          <span className="status-tag active">
                            <span className="status-dot cyan" />
                            SURVEILLANCE
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Threat Cohesion Gauge */}
                    <div className="syndicate-threat-gauge">
                      <div className="threat-gauge-info">
                        <span className="threat-gauge-label">CLUSTER COHESION RISK</span>
                        <span className="threat-gauge-val" style={{ color: riskColor(score) }}>
                          {(score * 100).toFixed(0)}%
                        </span>
                      </div>
                      <div className="threat-gauge-bar">
                        <div
                          className="threat-gauge-fill"
                          style={{ width: `${score * 100}%`, background: riskColor(score) }}
                        />
                      </div>
                      <div className="threat-gauge-meta">
                        <span>THREAT: <b style={{ color: riskColor(score) }}>{threatLabel(score)}</b></span>
                        <span>MAX MEMBER RISK: {(ring.max_fused_score * 100).toFixed(0)}%</span>
                      </div>
                    </div>

                    {/* DNA Vectors */}
                    <div className="syndicate-vectors-list">
                      <span className="syndicate-vector-heading">COLLUDING VECTOR DNA:</span>
                      <div className="syndicate-vector-tags">
                        {vectors.map((vec, vi) => (
                          <span key={vi} className="vector-tag">
                            <span className="mat-icon" style={{ fontSize: 11 }}>fingerprint</span>
                            {vec}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Member Chips Preview */}
                    <div className="syndicate-members-strip">
                      <span className="syndicate-vector-heading">
                        AFFILIATED IDENTITIES ({ring.member_count}):
                      </span>
                      <div className="syndicate-avatars-row">
                        {ring.members.slice(0, 6).map(m => (
                          <div
                            key={m.id}
                            className="member-chip-avatar"
                            title={`${m.name || m.id} (${(m.fused_score * 100).toFixed(0)}%)`}
                            onClick={(e) => {
                              e.stopPropagation()
                              navigate(`/identity/${m.id}`)
                            }}
                          >
                            <span className="avatar-initial">{(m.name || 'U').charAt(0).toUpperCase()}</span>
                            <span
                              className="avatar-risk-dot"
                              style={{ background: riskColor(m.fused_score) }}
                            />
                          </div>
                        ))}
                        {ring.member_count > 6 && (
                          <span className="member-avatar-more">+{ring.member_count - 6}</span>
                        )}
                      </div>
                    </div>

                    {/* Card Actions */}
                    <div className="syndicate-card-actions">
                      <button
                        type="button"
                        className="syndicate-inspect-btn"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleSelectRing(ring)
                        }}
                      >
                        <span className="mat-icon" style={{ fontSize: 14 }}>troubleshoot</span>
                        INSPECT SYNDICATE
                      </button>
                      <button
                        type="button"
                        className="syndicate-quarantine-btn"
                        disabled={isQuarantined}
                        onClick={(e) => {
                          e.stopPropagation()
                          handleQuarantineRing(ring)
                        }}
                      >
                        <span className="mat-icon" style={{ fontSize: 14 }}>gavel</span>
                        {isQuarantined ? 'QUARANTINED' : 'QUARANTINE'}
                      </button>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* VIEW 3: LINKED MEMBER MATRIX */}
        {viewMode === 'matrix' && (
          <div className="rings-matrix-container">
            <div className="matrix-header">
              <span className="matrix-title">Cross-Syndicate Structural Ledger</span>
              <span className="matrix-meta">
                Showing top colluding entities across {rings.length} graph clusters
              </span>
            </div>
            <div className="matrix-table-wrap">
              <table className="matrix-table">
                <thead>
                  <tr>
                    <th>Subject Identifier</th>
                    <th>Ring Affiliation</th>
                    <th>Network Node Role</th>
                    <th>Topological Vector</th>
                    <th>Synthetic Risk</th>
                    <th>Monetary / Risk Exposure</th>
                    <th style={{ textAlign: 'right' }}>Forensic Action</th>
                  </tr>
                </thead>
                <tbody>
                  {rings.flatMap(ring =>
                    ring.members.map((m, idx) => (
                      <tr key={`${ring._id}-${m.id}-${idx}`} className="matrix-row">
                        <td className="matrix-id-cell">
                          <span className="mat-icon" style={{ fontSize: 14, color: 'var(--color-accent)' }}>
                            badge
                          </span>
                          <span className="font-code">{m.id}</span>
                        </td>
                        <td>
                          <span
                            className="matrix-ring-pill"
                            onClick={() => {
                              setSelectedRing(ring)
                              setViewMode('dossiers')
                            }}
                          >
                            {ringLabel(ring._id)}
                          </span>
                        </td>
                        <td>
                          <span className="matrix-role-badge">
                            {idx === 0 ? 'Seed Identity' : idx % 2 === 1 ? 'Synthetic Clone' : 'Payment Mule'}
                          </span>
                        </td>
                        <td className="matrix-vector-cell">
                          {ringVectorDna(ring._id)[idx % ringVectorDna(ring._id).length]}
                        </td>
                        <td>
                          <span
                            className={`severity-badge ${riskClass(m.fused_score)}`}
                          >
                            {(m.fused_score * 100).toFixed(0)}% RISK
                          </span>
                        </td>
                        <td className="font-code" style={{ color: 'var(--color-text-muted)' }}>
                          ${(Math.floor(m.fused_score * 45000 + 12000)).toLocaleString()} EST
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="matrix-action-btn"
                            onClick={() => navigate(`/identity/${m.id}`)}
                          >
                            Deep Inspect
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ── Side Syndicate Forensic Dossier Inspector (Always Accessible) ── */}
        {selectedRing && (
          <div className="syndicate-inspector-drawer">
            <div className="drawer-header">
              <div className="drawer-title-group">
                <span className="drawer-pretitle">SYNDICATE DOSSIER</span>
                <h2 className="drawer-title">{ringLabel(selectedRing._id)}</h2>
                <span className="drawer-cluster-id">CLUSTER REF #{selectedRing._id}</span>
              </div>
              <button
                type="button"
                className="drawer-close-btn"
                onClick={() => setSelectedRing(null)}
                title="Close dossier inspector"
              >
                <span className="mat-icon" style={{ fontSize: 18 }}>close</span>
              </button>
            </div>

            <div className="drawer-content">
              {/* Cohesion Score card */}
              <div className="drawer-stat-card">
                <div className="drawer-stat-row">
                  <span className="drawer-stat-label">CLUSTER COHESION INDEX</span>
                  <span
                    className="drawer-stat-val"
                    style={{ color: riskColor(selectedRing.avg_fused_score) }}
                  >
                    {(selectedRing.avg_fused_score * 100).toFixed(1)} / 100
                  </span>
                </div>
                <div className="threat-gauge-bar">
                  <div
                    className="threat-gauge-fill"
                    style={{
                      width: `${selectedRing.avg_fused_score * 100}%`,
                      background: riskColor(selectedRing.avg_fused_score),
                    }}
                  />
                </div>
                <div className="drawer-stat-sub">
                  <span>STATUS: <b>{threatLabel(selectedRing.avg_fused_score)}</b></span>
                  <span>MEMBER COUNT: <b>{selectedRing.member_count}</b></span>
                </div>
              </div>

              {/* Shared Vector DNA Breakdown */}
              <div className="drawer-section">
                <span className="drawer-section-title">SHARED STRUCTURAL DNA</span>
                <div className="drawer-dna-list">
                  {ringVectorDna(selectedRing._id).map((dna, idx) => (
                    <div key={idx} className="drawer-dna-item">
                      <span className="mat-icon" style={{ fontSize: 14, color: 'var(--color-accent)' }}>
                        hub
                      </span>
                      <span>{dna}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Member Ledger */}
              <div className="drawer-section">
                <div className="drawer-section-header">
                  <span className="drawer-section-title">
                    CONFIRMED SYNDICATE MEMBERS ({selectedRing.member_count})
                  </span>
                </div>
                <div className="drawer-members-list">
                  {(ringMembers.length > 0 ? ringMembers : selectedRing.members).map((m: any) => (
                    <div
                      key={m.id}
                      className="drawer-member-card"
                      onClick={() => navigate(`/identity/${m.id}`)}
                    >
                      <div className="drawer-member-left">
                        <span className="mat-icon" style={{ fontSize: 16, color: 'var(--color-accent)' }}>
                          fingerprint
                        </span>
                        <div>
                          <span className="drawer-member-name">{m.name || m.id}</span>
                          <span className="drawer-member-id font-code">{m.id}</span>
                        </div>
                      </div>
                      <div className="drawer-member-right">
                        <span
                          className="drawer-member-score"
                          style={{ color: riskColor(m.fused_score ?? m.fusedScore ?? 0.8) }}
                        >
                          {(((m.fused_score ?? m.fusedScore ?? 0.8)) * 100).toFixed(0)}%
                        </span>
                        <span className="mat-icon" style={{ fontSize: 14, color: 'var(--color-text-muted)' }}>
                          arrow_forward
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Syndicate Action Buttons */}
              <div className="drawer-actions">
                <button
                  type="button"
                  className="drawer-quarantine-btn"
                  disabled={quarantinedRings.has(selectedRing._id)}
                  onClick={() => handleQuarantineRing(selectedRing)}
                >
                  <span className="mat-icon" style={{ fontSize: 16 }}>gavel</span>
                  {quarantinedRings.has(selectedRing._id) ? 'RING QUARANTINED' : 'QUARANTINE ENTIRE RING GRAPH'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
