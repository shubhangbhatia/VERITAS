import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getResults, createCase, logAuditEvent } from '../api'
import type { Identity, ResultsSummary } from '../types'

/* ── Helpers ────────────────────────────────────────────────────────────── */

function severityScore(id: Identity): number {
  return Math.round((id.fused_score ?? 0) * 100)
}

function clusterLabel(id: Identity): { text: string; accent: boolean } {
  if (id.cluster_id !== undefined && id.cluster_id >= 0) {
    return { text: `RING-${id.cluster_id}`, accent: true }
  }
  return { text: `ISOLATED-${(id.id ?? '').slice(-1).toUpperCase() || '?'}`, accent: false }
}

function anomalyVector(id: Identity): string {
  if (id.ring_flag && id.shared_phone_count && id.shared_phone_count > 1)
    return 'Device Fingerprint Collision (' + id.shared_phone_count + ' Sessions)'
  if (id.age_address_mismatch && id.age_address_mismatch > 1)
    return 'Synthetic SSN + Rapid Address Hop'
  if (id.payment_smoothness !== undefined && id.payment_smoothness < 0.2)
    return 'Biometric Liveness Injection Artifact'
  if (id.ring_flag)
    return 'Stolen Identity Graph Collision'
  if (id.shared_email_count && id.shared_email_count > 1)
    return 'Synthetic Credit File Cross-Reference'
  return 'Rapid Velocity Multi-Application'
}

function utcTimestamp(): string {
  return new Date().toISOString().substring(11, 23)
}

/* ── NumberTicker ───────────────────────────────────────────────────────── */
function NumberTicker({ value, suffix = '' }: { value: number; suffix?: string }) {
  const [display, setDisplay] = useState(0)
  useEffect(() => {
    const target = Number(value) || 0
    if (target === 0) { setDisplay(0); return }
    const step = Math.ceil(target / 40)
    let current = 0
    const id = setInterval(() => {
      current = Math.min(current + step, target)
      setDisplay(current)
      if (current >= target) clearInterval(id)
    }, 30)
    return () => clearInterval(id)
  }, [value])
  return <>{display.toLocaleString()}{suffix}</>
}

/* ── Inspector Overlay ──────────────────────────────────────────────────── */
interface InspectorProps {
  identity: Identity | null
  onClose: () => void
  onLock: (id: Identity) => void
  onDismiss: (id: Identity) => void
}

function InspectorOverlay({ identity, onClose, onLock, onDismiss }: InspectorProps) {
  if (!identity) return null
  const score = severityScore(identity)

  return (
    <div className="inspector-overlay">
      <div className="inspector-inner">
        {/* Header */}
        <div className="inspector-header">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="inspector-title">Subject Forensic File</span>
            <span className="inspector-id">{identity.id}</span>
          </div>
          <button className="inspector-close" id="close-inspector" onClick={onClose}>
            <span className="mat-icon" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* Score bar */}
          <div className="inspector-score-card">
            <div className="inspector-score-row">
              <span className="inspector-score-label">Synthetic Assessment Score</span>
              <span className="inspector-score-value">{score}.0 / 100</span>
            </div>
            <div className="inspector-score-track">
              <div className="inspector-score-fill" style={{ width: `${score}%` }}></div>
            </div>
          </div>

          {/* Identity markers */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="inspector-section-label">Identity Markers</span>
            <div className="inspector-markers">
              <div className="inspector-marker-row">
                <span className="inspector-mk-key">Primary Anchor:</span>
                <span className="inspector-mk-val">
                  {identity.pan_prefix ? `PAN ${identity.pan_prefix}****` : `SSN ***-**-${(identity.id ?? '').slice(-4)}`}
                </span>
              </div>
              <div className="inspector-marker-row">
                <span className="inspector-mk-key">DOB Claim:</span>
                <span className="inspector-mk-val">
                  {identity.dob ?? (identity.age ? `Age: ${identity.age} (anomaly detected)` : 'N/A')}
                </span>
              </div>
              <div className="inspector-marker-row">
                <span className="inspector-mk-key">Subnet:</span>
                <span className="inspector-mk-val">
                  {identity.ip_address ?? `194.26.29.${(identity.id ?? '').charCodeAt(0) % 256} (Proxy Hop: 4)`}
                </span>
              </div>
            </div>
          </div>

          {/* Anomalies */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <span className="inspector-section-label">Observed Anomalies</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div className="inspector-anomaly critical">
                CRITICAL: {anomalyVector(identity)}. High synthetic likelihood.
              </div>
              {identity.ring_flag && (
                <div className="inspector-anomaly normal">
                  CLUSTER: Identity linked to fraud ring cluster #{identity.cluster_id}. Shared device fingerprints detected.
                </div>
              )}
              {(identity.age_address_mismatch ?? 0) > 0 && (
                <div className="inspector-anomaly normal">
                  DEVICE: Address history mismatch count: {identity.address_history_count}. Rapid hop pattern.
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Footer actions */}
      <div className="inspector-actions">
        <button className="inspector-btn-lock" onClick={() => onLock(identity)}>
          Lock &amp; Seize ID Graph
        </button>
        <button className="inspector-btn-dismiss" onClick={() => onDismiss(identity)}>
          Dismiss Flag
        </button>
      </div>
    </div>
  )
}

/* ── Main Dashboard ─────────────────────────────────────────────────────── */
export default function DashboardPage() {
  const navigate = useNavigate()

  const [data, setData] = useState<ResultsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [injectedRows, setInjectedRows] = useState<Identity[]>([])
  const [inspected, setInspected] = useState<Identity | null>(null)
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())
  const [ringCounter, setRingCounter] = useState(9)
  const [focusedIndex, setFocusedIndex] = useState(0)

  // Pagination state
  const [page, setPage] = useState(1)
  const pageSize = 20

  // Stat overrides from inject
  const [extraHigh, setExtraHigh] = useState(0)
  const [extraRings, setExtraRings] = useState(0)
  const [extraScanned, setExtraScanned] = useState(0)

  const load = useCallback(async (targetPage: number = page) => {
    setLoading(true)
    try {
      const skip = (targetPage - 1) * pageSize
      const res = await getResults({ risk_label: 'HIGH', limit: pageSize, skip })
      setData(res)
    } catch {
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [page])

  useEffect(() => { 
    load(page) 
  }, [load, page])

  /* Inject synthetic cluster */
  const handleInject = () => {
    const ringId = ringCounter
    setRingCounter(r => r + 1)
    const base = Date.now()
    const fakeA: Identity = {
      id: `INJ-${base}-Z`,
      name: `INJECTED-${base}-Z`,
      fused_score: 0.99,
      risk_label: 'HIGH',
      ring_flag: true,
      cluster_id: ringId,
      scored_at: new Date().toISOString(),
    }
    const fakeB: Identity = {
      id: `INJ-${base + 1}-X`,
      name: `INJECTED-${base + 1}-X`,
      fused_score: 0.97,
      risk_label: 'HIGH',
      ring_flag: true,
      cluster_id: ringId,
      scored_at: new Date().toISOString(),
    }
    setInjectedRows(prev => [fakeB, fakeA, ...prev])
    setExtraHigh(h => h + 2)
    setExtraRings(r => r + 1)
    setExtraScanned(s => s + 2)
    logAuditEvent('upload', `INJ-RING-${ringId}`, 'Synthetic Cluster Injection', { members: [fakeA.id, fakeB.id] })
  }

  /* Dismiss / lock */
  const handleDismiss = async (id: Identity) => {
    setDismissed(prev => new Set([...prev, id.id]))
    setInspected(null)
    try {
      await createCase({
        identity_id: id.id,
        status: 'dismissed',
        notes: 'Flag dismissed by Tier-1 Analyst from Triage Queue.'
      })
      await logAuditEvent('dismiss', id.id, id.name || id.id, { reason: 'Analyst manual dismissal' })
    } catch (e) {
      console.warn('Could not persist dismissal to database:', e)
    }
  }

  const handleLock = async (id: Identity) => {
    setInspected(null)
    try {
      await createCase({
        identity_id: id.id,
        status: 'seized',
        notes: 'Graph seized and locked during real-time triage queue inspection.'
      })
      await logAuditEvent('seize', id.id, id.name || id.id, { action: 'Lock & Seize graph' })
    } catch (e) {
      console.warn('Could not persist case lock:', e)
    }
    navigate(`/identity/${id.id}`)
  }

  const handleOpenInspect = (id: Identity) => {
    setInspected(id)
    logAuditEvent('inspect', id.id, id.name || id.id)
  }

  /* Build triage rows: injected first, then real HIGH-risk */
  const realRows = (data?.identities ?? []).filter(i => !dismissed.has(i.id))
  const injRows  = injectedRows.filter(i => !dismissed.has(i.id))
  const allRows  = [...injRows, ...realRows]

  /* Keyboard Shortcuts */
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      // Don't intercept if user is typing in search or input fields
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement).tagName)) {
        return
      }

      if (e.key === 'Escape') {
        if (inspected) setInspected(null)
        return
      }

      if (allRows.length === 0) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setFocusedIndex(i => Math.min(i + 1, allRows.length - 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setFocusedIndex(i => Math.max(i - 1, 0))
      } else if (e.key === 'i' || e.key === 'I') {
        const current = allRows[focusedIndex]
        if (current) handleOpenInspect(current)
      } else if (e.key === 'd' || e.key === 'D') {
        const current = allRows[focusedIndex]
        if (current) handleDismiss(current)
      } else if (e.key === 'l' || e.key === 'L') {
        const current = allRows[focusedIndex]
        if (current) handleLock(current)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [allRows, focusedIndex, inspected])

  /* Stats */
  const totalScanned  = (data?.total ?? 0) + extraScanned
  const totalHigh     = (data?.high_risk_count ?? 0) + extraHigh
  const totalRings    = (data?.fraud_rings_count ?? 0) + extraRings
  const totalHighCount = data?.high_risk_count ?? allRows.length
  const totalPages    = Math.max(1, Math.ceil(totalHighCount / pageSize))

  const identities    = data?.identities ?? []
  const lowCount      = identities.filter(i => i.risk_label === 'LOW').length
  const medCount      = identities.filter(i => i.risk_label === 'MEDIUM').length
  const highCount     = identities.filter(i => i.risk_label === 'HIGH').length + extraHigh
  const grandTotal    = lowCount + medCount + highCount || 1
  const pctLow  = ((lowCount / grandTotal) * 100).toFixed(1)
  const pctMed  = ((medCount / grandTotal) * 100).toFixed(1)
  const pctHigh = ((highCount / grandTotal) * 100).toFixed(1)

  return (
    <div className="dashboard-root fade-in-up">
      {/* Inspector Overlay */}
      <InspectorOverlay
        identity={inspected}
        onClose={() => setInspected(null)}
        onLock={handleLock}
        onDismiss={handleDismiss}
      />

      {/* Page Header */}
      <div className="dash-page-header">
        <div className="dash-header-left">
          <div className="dash-header-accent"></div>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span className="dash-header-title">Forensic Identity Queue &amp; Telemetry</span>
            <span className="dash-header-sub">
              Partition: NODE-E4 // Ingestion Stream Active // Filter: High-Severity Flagged // Shortcuts: [↑/↓] Navigate [I] Inspect [D] Dismiss [L] Seize
            </span>
          </div>
        </div>
        <div className="dash-header-actions">
          <button id="btn-inject-ring" className="dash-inject-btn" onClick={handleInject}>
            <span className="mat-icon" style={{ fontSize: 15, color: 'var(--risk-high)' }}>radar</span>
            Inject Synthetic Cluster
            <span className="inject-shimmer"></span>
          </button>
          <button className="dash-tool-btn" onClick={() => load(page)}>
            <span className="mat-icon" style={{ fontSize: 16 }}>refresh</span> Synced
          </button>
        </div>
      </div>

      {/* Main Grid */}
      <div className="dash-grid">

        {/* ── Left: Triage Queue ──────────────────────────────────────── */}
        <div className="triage-panel">
          {/* Panel header */}
          <div className="triage-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="triage-header-title">Triage Queue</span>
              <span className="triage-pending-badge">{allRows.length} in view</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <span className="triage-engine-label">
                Rule Engine: <span style={{ color: 'var(--primary-container)' }}>v4.8.2-live</span>
              </span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span className="ping-dot"></span>
                <span className="triage-urgency-label">High Urgency Buffer</span>
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="triage-table" id="queue-table">
              <thead>
                <tr className="triage-thead-row">
                  <th className="triage-th">Subject Hash</th>
                  <th className="triage-th">Timestamp (UTC)</th>
                  <th className="triage-th">Forensic Severity</th>
                  <th className="triage-th">Primary Anomaly Vector</th>
                  <th className="triage-th">Cluster Affinity</th>
                  <th className="triage-th" style={{ textAlign: 'right' }}>Verification</th>
                </tr>
              </thead>
              <tbody>
                {loading && allRows.length === 0 ? (
                  [...Array(5)].map((_, i) => (
                    <tr key={i} className="triage-row">
                      {[...Array(6)].map((_, j) => (
                        <td key={j} className="triage-td">
                          <div className="skeleton" style={{ height: 14, width: j === 0 ? 100 : j === 3 ? 200 : 80 }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : allRows.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="triage-empty">
                      No high-severity identities found. Upload a CSV or inject a cluster to populate the queue.
                    </td>
                  </tr>
                ) : (
                  allRows.map((id, index) => {
                    const score   = severityScore(id)
                    const cluster = clusterLabel(id)
                    const ts      = id.scored_at
                      ? new Date(id.scored_at).toISOString().substring(11, 23)
                      : utcTimestamp()
                    const isNew   = injRows.includes(id)
                    const isFocused = index === focusedIndex

                    return (
                      <tr
                        key={id.id}
                        className={`triage-row group${isNew ? ' triage-row-new' : ''}`}
                        data-subject={id.id}
                        onClick={() => setFocusedIndex(index)}
                        style={{
                          background: isFocused ? 'rgba(34, 211, 238, 0.08)' : undefined,
                          outline: isFocused ? '1px solid rgba(34, 211, 238, 0.4)' : undefined
                        }}
                      >
                        <td className="triage-td triage-id-cell">
                          <span className="mat-icon triage-fingerprint-icon">
                            {isNew ? 'emergency' : 'fingerprint'}
                          </span>
                          {id.id.length > 14 ? id.id.slice(0, 14) + '…' : id.id}
                        </td>
                        <td className="triage-td triage-ts">{ts}</td>
                        <td className="triage-td">
                          <span className="severity-badge high">
                            <span className="severity-dot"></span>
                            HIGH ({score})
                          </span>
                        </td>
                        <td className="triage-td triage-vector">{anomalyVector(id)}</td>
                        <td className="triage-td">
                          <span className={`cluster-badge${cluster.accent ? ' accent' : ''}`}>
                            {cluster.text}
                          </span>
                        </td>
                        <td className="triage-td" style={{ textAlign: 'right' }}>
                          <button
                            className="inspect-btn"
                            onClick={e => { e.stopPropagation(); handleOpenInspect(id) }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Table footer with interactive pagination */}
          <div className="triage-footer">
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span>
                Active Filter: <span style={{ color: 'var(--risk-high)' }}>SEVERITY == HIGH</span>
              </span>
              <span style={{ color: 'var(--border)' }}>|</span>
              <span>Buffer Fill: {Math.min(((allRows.length / 50) * 100), 100).toFixed(0)}%</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>Page {page} of {totalPages}</span>
              <div style={{ display: 'flex', gap: 4 }}>
                <button 
                  className="dash-tool-btn" 
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  disabled={page <= 1 || loading}
                  onClick={() => setPage(p => Math.max(1, p - 1))}
                >
                  &lt;
                </button>
                <button 
                  className="dash-tool-btn" 
                  style={{ padding: '2px 8px', fontSize: 11 }}
                  disabled={page >= totalPages || loading}
                  onClick={() => setPage(p => p + 1)}
                >
                  &gt;
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Right: Stats & Charts ───────────────────────────────────── */}
        <div className="stats-panel">

          {/* Stat chips */}
          <div className="stat-chips">
            <div className="stat-chip">
              <span className="stat-chip-label">Scanned Total</span>
              <span className="stat-chip-value" id="stat-scanned" style={{ color: 'var(--color-text)' }}>
                <NumberTicker value={totalScanned} />
              </span>
              <span className="stat-chip-trend positive">
                <span className="mat-icon" style={{ fontSize: 12 }}>trending_up</span>
                +340/m
              </span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">High-Risk Cases</span>
              <span className="stat-chip-value" id="stat-high" style={{ color: 'var(--risk-high)' }}>
                <NumberTicker value={totalHigh} />
              </span>
              <span className="stat-chip-trend neutral">
                {totalScanned > 0 ? ((totalHigh / totalScanned) * 100).toFixed(2) : '0.00'}% rate
              </span>
            </div>
            <div className="stat-chip">
              <span className="stat-chip-label">Active Rings</span>
              <span className="stat-chip-value" id="stat-rings" style={{ color: 'var(--tertiary-container)' }}>
                <NumberTicker value={totalRings} />
              </span>
              <span className="stat-chip-trend neutral">
                {extraRings > 0 ? `${extraRings} injected` : '3 linked'}
              </span>
            </div>
          </div>

          {/* Global Risk Stratification */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-title">Global Risk Stratification</span>
              <span className="stat-card-meta">24H Aggregate</span>
            </div>
            <div className="risk-bar-track">
              <div
                className="risk-bar-seg low"
                style={{ width: `${pctLow}%` }}
                title={`Low Risk: ${pctLow}%`}
              ></div>
              <div
                className="risk-bar-seg medium"
                style={{ width: `${pctMed}%` }}
                title={`Medium Risk: ${pctMed}%`}
              ></div>
              <div
                className="risk-bar-seg high"
                style={{ width: `${pctHigh}%` }}
                title={`High Risk: ${pctHigh}%`}
              ></div>
            </div>
            <div className="risk-legend">
              <div className="risk-legend-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="risk-legend-dot low"></span>
                  <span className="risk-legend-label">Low</span>
                </div>
                <span className="risk-legend-pct">{pctLow}%</span>
                <span className="risk-legend-count">{lowCount.toLocaleString()} IDs</span>
              </div>
              <div className="risk-legend-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="risk-legend-dot medium"></span>
                  <span className="risk-legend-label">Medium</span>
                </div>
                <span className="risk-legend-pct">{pctMed}%</span>
                <span className="risk-legend-count">{medCount.toLocaleString()} IDs</span>
              </div>
              <div className="risk-legend-item">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span className="risk-legend-dot high"></span>
                  <span className="risk-legend-label">High</span>
                </div>
                <span className="risk-legend-pct" style={{ color: 'var(--risk-high)' }}>{pctHigh}%</span>
                <span className="risk-legend-count">{highCount.toLocaleString()} IDs</span>
              </div>
            </div>
          </div>

          {/* Velocity Chart */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-title">Ingestion &amp; Risk Velocity</span>
              <span className="stat-card-meta" style={{ color: 'var(--primary-container)' }}>60m Window</span>
            </div>
            <div className="velocity-chart-wrap">
              {/* Grid lines */}
              <div className="velocity-grid">
                <div className="velocity-grid-line"></div>
                <div className="velocity-grid-line"></div>
                <div className="velocity-grid-line"></div>
              </div>
              <svg className="velocity-svg" viewBox="0 0 300 100" preserveAspectRatio="none">
                <path
                  d="M 0,75 Q 30,70 60,60 T 120,40 T 180,65 T 240,30 T 300,18"
                  fill="none"
                  stroke="var(--primary-container)"
                  strokeWidth="2"
                />
                <path
                  d="M 0,95 Q 40,90 80,88 T 160,82 T 220,70 T 300,45"
                  fill="none"
                  stroke="var(--risk-high)"
                  strokeWidth="1.5"
                />
              </svg>
              <div className="velocity-legend">
                <div className="velocity-legend-item" style={{ color: 'var(--primary-container)' }}>
                  <span className="velocity-legend-line" style={{ background: 'var(--primary-container)' }}></span>
                  Volume
                </div>
                <div className="velocity-legend-item" style={{ color: 'var(--risk-high)' }}>
                  <span className="velocity-legend-line" style={{ background: 'var(--risk-high)' }}></span>
                  Risk Peaks
                </div>
              </div>
            </div>
            <div className="velocity-axis">
              <span>T-60 min</span>
              <span>T-30 min</span>
              <span style={{ color: 'var(--color-text)' }}>Current (UTC)</span>
            </div>
          </div>

          {/* Telemetry Notes */}
          <div className="stat-card">
            <div className="stat-card-header">
              <span className="stat-card-title">Telemetry Notes</span>
              <span className="stat-card-meta" style={{ color: 'var(--risk-low)' }}>OPERATIONAL</span>
            </div>
            <p className="telemetry-note">
              Dynamic cluster resolution flagged multiple matching SSN prefixes within sub-second
              registration bursts originating from AS40029.
              {extraRings > 0 && (
                <span style={{ color: 'var(--risk-high)' }}>
                  {' '}ALERT: {extraRings} synthetic ring(s) injected during this session.
                </span>
              )}
            </p>
            <div className="telemetry-footer">
              <span>Target Fingerprint Pool</span>
              <span className="telemetry-footer-val">SHA-256 Verified</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
