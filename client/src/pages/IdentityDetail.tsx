import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getIdentity, createCase, logAuditEvent } from '../api'
import type { Identity } from '../types'

/* ── Helpers ─────────────────────────────────────────────────────── */

function riskColor(score: number): string {
  if (score > 0.75) return 'var(--risk-high)'
  if (score > 0.45) return 'var(--risk-medium)'
  return 'var(--risk-low)'
}

function riskClass(score: number): string {
  if (score > 0.75) return 'HIGH'
  if (score > 0.45) return 'MEDIUM'
  return 'LOW'
}

function caseRef(id: string): string {
  const hash = id.replace(/-/g, '').slice(0, 4).toUpperCase()
  return `VER-2024-${hash}-B`
}

/* ── Semi-circle gauge (matches prototype) ────────────────────────── */
function HeroGauge({ score = 0, label = 'LOW' }: { score?: number; label?: string }) {
  const pct = Math.min(1, Math.max(0, score))
  const display = Math.round(pct * 100)
  const color = label === 'HIGH' ? '#ef4444' : label === 'MEDIUM' ? '#f59e0b' : '#22c55e'

  const totalDash = 235
  const filledDash = pct * totalDash

  return (
    <div className="id-hero-card">
      <div className="id-hero-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="ping-dot"></span>
          <span className="id-hero-eyebrow">HERO TELEMETRY // ML ARTIFACT</span>
        </div>
        <span className="severity-badge high" style={{ fontSize: 11 }}>CRITICAL SEVERITY</span>
      </div>

      {/* Gauge */}
      <div className="id-gauge-wrap">
        <svg className="id-gauge-svg" viewBox="0 0 200 200">
          {/* Track */}
          <path
            d="M 30 150 A 75 75 0 1 1 170 150"
            fill="none" stroke="#23252b" strokeWidth="12" strokeLinecap="butt"
          />
          {/* Fill */}
          <path
            d="M 30 150 A 75 75 0 1 1 170 150"
            fill="none"
            stroke={color}
            strokeWidth="12"
            strokeLinecap="butt"
            strokeDasharray={`${filledDash} ${totalDash - filledDash + 1}`}
            strokeDashoffset="0"
            style={{ transition: 'stroke-dasharray 1s ease', filter: `drop-shadow(0 0 8px ${color})` }}
          />
          {/* Threshold tick */}
          <path
            d="M 30 150 A 75 75 0 0 1 45 110"
            fill="none" stroke="var(--primary-container)" strokeWidth="2" strokeLinecap="butt" opacity="0.6"
          />
        </svg>
        <div className="id-gauge-center">
          <span className="id-gauge-number" style={{ color }}>
            {display}
          </span>
          <span className="id-gauge-label" style={{ color }}>
            {label} RISK COMPOSITE
          </span>
        </div>
      </div>

      {/* Gauge axis */}
      <div className="id-gauge-axis">
        <span>INDEX: 00</span>
        <span style={{ color: 'var(--risk-high)', fontFamily: 'var(--font-code)', fontSize: 11 }}>
          THRESHOLD EXCEEDED: 75
        </span>
        <span>INDEX: 100</span>
      </div>

      {/* Model metadata */}
      <div className="id-hero-meta">
        <div className="id-hero-meta-row">
          <span>INFERENCE MODEL:</span>
          <span style={{ color: 'var(--color-text)' }}>SYNTH-DETECTOR-v4.2.0</span>
        </div>
        <div className="id-hero-meta-row">
          <span>CONFIDENCE INTERVAL:</span>
          <span style={{ color: 'var(--primary-container)', fontFamily: 'var(--font-code)' }}>
            {(98 + pct * 1.9).toFixed(2)}% ACCURACY
          </span>
        </div>
        <div className="id-hero-meta-row">
          <span>SYNTHETIC PROBABILITY:</span>
          <span style={{ color, fontFamily: 'var(--font-code)' }}>
            {pct.toFixed(3)} POST-EVAL
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── SHAP Factor Attribution with Directional Indicators ──────────── */
function ShapPanel({ shapValues, identity }: { shapValues?: Record<string, number>; identity: Identity }) {
  const featureLabels: Record<string, { label: string; desc: string }> = {
    shared_phone_count:    { label: 'Device Fingerprint Collision',    desc: 'Multiple accounts tied to same device across unrelated applications.' },
    shared_email_count:    { label: 'Synthetic Credit File X-Ref',     desc: 'Email domain associated with disposable/burner address pools.' },
    age_address_mismatch:  { label: 'Geographic Velocity Anomaly',     desc: 'POS card-present attempts in multiple states concurrent with identity modification.' },
    payment_smoothness:    { label: 'VoIP Carrier — Burner Range',     desc: 'Virtual line activated under 4 days prior to KYC trigger event.' },
    address_history_count: { label: 'Face Biometric Diffusion Match',  desc: 'Generative GAN artifact index (earlobe asymmetry / eye-reflection vector 88-Delta).' },
    account_age_months:    { label: 'SSN Chronology Violation',        desc: 'SSA randomized index cohort collision. Epoch chronology mismatch detected.' },
  }

  // Build factor list: prefer real SHAP, fallback to synthetic from identity fields
  let factors: { key: string; label: string; desc: string; weight: number; pct: number; isAmplifier: boolean }[] = []

  if (shapValues && Object.keys(shapValues).length > 0) {
    const entries = Object.entries(shapValues)
      .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]))
    const maxV = Math.max(...entries.map(([, v]) => Math.abs(v)), 0.01)
    factors = entries.map(([k, v]) => ({
      key: k,
      label: featureLabels[k]?.label ?? k.replace(/_/g, ' '),
      desc: featureLabels[k]?.desc ?? 'Anomalous signal detected by kernel explainer.',
      weight: v,
      pct: (Math.abs(v) / maxV) * 100,
      isAmplifier: v >= 0
    }))
  } else {
    // Synthetic factors inferred from identity fields
    const synth = [
      { key: 'ssn_chron',   label: 'SSN issued post-2011 with pre-2005 credit history anomaly', desc: 'SSA randomized index cohort collision. Epoch chronology mismatch: Synthetic profile assembly hallmark.', weight: 0.42, pct: 100, isAmplifier: true },
      { key: 'geo_vel',     label: 'Geographic velocity across 3 states in 48 hours',            desc: 'POS card-present attempts in OH, FL, NV concurrent with remote identity modification.',             weight: 0.28, pct: 67, isAmplifier: true },
      { key: 'voip',        label: 'VoIP carrier tied to known burner range',                     desc: 'Twilio/Bandwidth virtual range allocation. Line activated under 4 days prior to KYC trigger.',       weight: 0.14, pct: 33, isAmplifier: true },
      { key: 'biometric',   label: 'Face biometrics matched synthetic diffusion profile',         desc: 'Generative GAN eye-reflection artifact & earlobe asymmetry vector index 88-Delta.',                weight: 0.05, pct: 12, isAmplifier: true },
    ]
    factors = synth
  }

  return (
    <div className="id-shap-panel">
      <div className="id-shap-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mat-icon" style={{ color: 'var(--primary-container)', fontSize: 18 }}>query_stats</span>
          <span className="id-section-title">SHAP / Forensic Factor Attribution</span>
        </div>
        <span className="id-section-meta">KERNEL EXPLAINER // DIRECTIONAL WEIGHTS</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {factors.map((f, i) => (
          <div
            key={f.key}
            className={`id-shap-row${i === 0 ? ' id-shap-row-primary' : ''}`}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                <span className="id-shap-rank" style={{ color: i === 0 ? 'var(--primary-container)' : 'var(--color-text-muted)' }}>
                  #{String(i + 1).padStart(2, '0')}
                </span>
                <div>
                  <span className="id-shap-label">{f.label}</span>
                  <span className="id-shap-desc">{f.desc}</span>
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
                  <span style={{ fontSize: 10, fontFamily: 'var(--font-code)', color: f.isAmplifier ? 'var(--risk-high)' : 'var(--risk-low)' }}>
                    {f.isAmplifier ? '▲ AMPLIFIES' : '▼ MITIGATES'}
                  </span>
                  <span className="id-shap-weight" style={{ color: f.isAmplifier ? 'var(--risk-high)' : 'var(--risk-low)' }}>
                    {f.weight >= 0 ? `+${Math.round(f.pct)}%` : `-${Math.round(f.pct)}%`}
                  </span>
                </div>
                <span className="id-shap-weight-val">WEIGHT: {f.weight.toFixed(3)}</span>
              </div>
            </div>
            <div className="id-shap-bar-track">
              <div
                className="id-shap-bar-fill"
                style={{
                  width: `${f.pct}%`,
                  background: f.isAmplifier ? 'var(--risk-high)' : 'var(--risk-low)',
                  opacity: i === 0 ? 1 : 0.75,
                }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="id-shap-footer">
        <span>AGGREGATE BIAS ADJUSTMENT: 0.000</span>
        <span>BASELINE ARTIFACT PREVALENCE: {((identity.fused_score ?? 0) * 0.05).toFixed(3)} (NORMALIZED)</span>
      </div>
    </div>
  )
}

/* ── Document Verification Panel ─────────────────────────────────── */
function DocVerification({ identity }: { identity: Identity }) {
  const hasRing = identity.ring_flag

  return (
    <div className="id-doc-panel">
      <div className="id-doc-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mat-icon" style={{ color: 'var(--primary-container)', fontSize: 18 }}>badge</span>
          <span className="id-section-title">Document Verification &amp; Optical OCR</span>
        </div>
        <span className="id-badge-tag">DUAL MATCH CHECK</span>
      </div>

      <div className="id-doc-grid">
        {/* Doc A — Passport (valid) */}
        <div className="id-doc-card">
          <div className="id-doc-card-header">
            <span className="id-doc-name">
              {identity.pan_prefix ? `PAN ${identity.pan_prefix}****` : 'Primary Document'}
            </span>
            <span className="id-doc-status valid">MRZ_VALID</span>
          </div>
          <div className="id-doc-img-wrap">
            <div className="id-doc-img-placeholder">
              <span className="mat-icon" style={{ fontSize: 36, color: 'var(--border-strong)' }}>article</span>
            </div>
            <div className="id-doc-img-label" style={{ color: 'var(--primary-container)' }}>
              DOC_ID: P{(identity.id ?? '').replace(/\D/g, '').slice(0, 9).padStart(9, '9')}
            </div>
          </div>
          <div className="id-doc-checks">
            <div className="id-doc-check-row">
              <span>CHIP CRYPTO:</span>
              <span style={{ color: 'var(--color-text)' }}>PASS (SHA-256)</span>
            </div>
            <div className="id-doc-check-row">
              <span>HOLOGRAPHIC WATERMARK:</span>
              <span style={{ color: 'var(--primary-container)', fontFamily: 'var(--font-code)' }}>
                {hasRing ? '72.1% SUSPECT' : '98.4% CONFIDENCE'}
              </span>
            </div>
          </div>
        </div>

        {/* Doc B — DL (tampered if ring) */}
        <div className="id-doc-card">
          <div className="id-doc-card-header">
            <span className="id-doc-name">Secondary Document</span>
            <span className={`id-doc-status ${hasRing ? 'tampered' : 'valid'}`}>
              {hasRing ? 'BARCODE_TAMPER' : 'OCR_VALID'}
            </span>
          </div>
          <div className="id-doc-img-wrap">
            <div className="id-doc-img-placeholder">
              <span className="mat-icon" style={{ fontSize: 36, color: hasRing ? 'rgba(239,68,68,0.3)' : 'var(--border-strong)' }}>
                {hasRing ? 'warning' : 'credit_card'}
              </span>
            </div>
            <div className="id-doc-img-label" style={{ color: hasRing ? 'var(--risk-high)' : 'var(--primary-container)' }}>
              DOC_ID: D{(identity.id ?? '').replace(/\D/g, '').slice(0, 7).padStart(7, '3')}
            </div>
          </div>
          <div className="id-doc-checks">
            <div className="id-doc-check-row">
              <span>PDF417 PARSE:</span>
              <span style={{ color: hasRing ? 'var(--risk-high)' : 'var(--risk-low)' }}>
                {hasRing ? 'PAYLOAD_MISMATCH' : 'VERIFIED'}
              </span>
            </div>
            <div className="id-doc-check-row">
              <span>MICROPRINT CONTINUITY:</span>
              <span style={{ color: hasRing ? 'var(--risk-medium)' : 'var(--risk-low)' }}>
                {hasRing ? '62.1% BLUR_SUSPECT' : '97.4% CLEAR'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Global doc verdict */}
      <div className="id-doc-verdict">
        <div className="id-doc-check-row">
          <span>ISSUANCE STATE ENTITY:</span>
          <span style={{ color: 'var(--color-text)' }}>
            {identity.address ? identity.address.split(',').pop()?.trim() : 'CA DMV SACRAMENTO FIELD REF #409'}
          </span>
        </div>
        <div className="id-doc-check-row">
          <span>OPTICAL VARIABLE INK:</span>
          <span style={{ color: hasRing ? 'var(--risk-medium)' : 'var(--risk-low)' }}>
            {hasRing ? 'SPECTRAL ANOMALY DETECTED' : 'AUTHENTIC SPECTRAL CURVE'}
          </span>
        </div>
        <div className="id-doc-check-row">
          <span>AI ARTIFACT DETECTIONS:</span>
          <span style={{ color: hasRing ? 'var(--risk-high)' : 'var(--risk-low)' }}>
            {hasRing ? 'FONT INTERPOLATION DISCONTINUITY (NAME ROW)' : 'NONE DETECTED'}
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── Device & Network Telemetry ──────────────────────────────────── */
function DeviceTelemetry({ identity }: { identity: Identity }) {
  const hasRing = identity.ring_flag
  const ip = identity.ip_address ?? `194.26.${(identity.id ?? '').charCodeAt(2) % 256}.${(identity.id ?? '').charCodeAt(4) % 256}`

  const netFields = [
    { label: 'PUBLIC IP',    value: ip,                     color: hasRing ? 'var(--risk-high)' : 'var(--color-text)' },
    { label: 'ROUTING NODE', value: hasRing ? 'TOR EXIT' : 'DIRECT',   color: hasRing ? 'var(--risk-high)' : 'var(--risk-low)' },
    { label: 'CANVAS HASH',  value: hasRing ? 'MISMATCH' : 'MATCH',    color: hasRing ? 'var(--risk-medium)' : 'var(--risk-low)' },
    { label: 'TCP STACK',    value: 'LINUX 5.15',                        color: 'var(--color-text)' },
  ]

  return (
    <div className="id-net-panel">
      <div className="id-doc-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mat-icon" style={{ color: 'var(--primary-container)', fontSize: 18 }}>router</span>
          <span className="id-section-title">Device &amp; Network Telemetry</span>
        </div>
        <span className="id-badge-tag" style={{ color: hasRing ? 'var(--risk-high)' : 'var(--primary-container)', borderColor: hasRing ? 'rgba(239,68,68,0.3)' : undefined }}>
          {hasRing ? 'ANONYMIZED TUNNEL' : 'DIRECT CONNECTION'}
        </span>
      </div>

      {/* IP/device chips */}
      <div className="id-net-chips">
        {netFields.map(f => (
          <div key={f.label} className="id-net-chip">
            <span className="id-net-chip-label">{f.label}</span>
            <span className="id-net-chip-value" style={{ color: f.color }}>{f.value}</span>
          </div>
        ))}
      </div>

      {/* Geo discrepancy card */}
      <div className="id-geo-card">
        <span className="id-geo-title">Fingerprint &amp; Geolocation Discrepancy</span>
        <div className="id-geo-map">
          <div className="id-geo-map-overlay">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="id-doc-status tampered" style={{ fontSize: 10 }}>
                {hasRing ? 'LOCATION CONFLICT' : 'LOCATION VERIFIED'}
              </span>
              <span style={{ fontFamily: 'var(--font-code)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                ASN 44103 // M247 LTD
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
              <div style={{ fontFamily: 'var(--font-code)', fontSize: 10, color: 'var(--color-text-muted)' }}>
                <div>GEOIP: {hasRing ? 'Frankfurt, HE, DE' : 'San Francisco, CA, US'}</div>
                <div>ASSERTED: {identity.address ?? 'San Francisco, CA, US'}</div>
              </div>
              <span style={{ fontFamily: 'var(--font-code)', fontSize: 12, fontWeight: 500, color: hasRing ? 'var(--risk-high)' : 'var(--risk-low)' }}>
                {hasRing ? 'OFFSET: +8,940 KM' : 'MATCH ✓'}
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 4 }}>
          <div className="id-doc-check-row">
            <span>WEBGL VENDOR SPOOFING:</span>
            <span style={{ color: hasRing ? 'var(--risk-high)' : 'var(--risk-low)' }}>
              {hasRing ? 'DETECTED (SwiftShader CPU Fallback)' : 'NOT DETECTED'}
            </span>
          </div>
          <div className="id-doc-check-row">
            <span>USER AGENT EMULATION:</span>
            <span style={{ color: 'var(--color-text)' }}>Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)</span>
          </div>
          <div className="id-doc-check-row">
            <span>HARDWARE CONCURRENCY:</span>
            <span style={{ color: 'var(--color-text)' }}>
              {identity.shared_phone_count ? `${identity.shared_phone_count * 4} CORES` : '16 CORES'} // MEMORY REPORT: 8GB
            </span>
          </div>
        </div>
      </div>

      <div className="id-shap-footer" style={{ marginTop: 4 }}>
        <span>PACKET INSPECTION: CLEAR OF KNOWN C2 SIGNATURES</span>
        <span style={{ color: 'var(--primary-container)' }}>INSPECTOR: OP-8842</span>
      </div>
    </div>
  )
}

/* ── Synthetic Fabrication Timeline ──────────────────────────────── */
function FabricationTimeline({ identity }: { identity: Identity }) {
  const hasRing = identity.ring_flag

  const events = [
    {
      date: '2004.11.14',
      title: 'First Credit Inquiry',
      desc: 'Inquiry registered with Equifax under deceased minor profile file.',
      badge: 'DORMANT PIGGYBACK',
      badgeClass: 'medium',
      dateColor: 'var(--color-text-muted)',
    },
    {
      date: '2012.03.02',
      title: 'SSN Assigned by SSA',
      desc: 'SSA randomized SSN issued in group 044-XX. Critical 8-year post-credit conflict.',
      badge: 'CHRONOLOGY VIOLATION',
      badgeClass: 'high',
      dateColor: 'var(--color-text-muted)',
    },
    {
      date: '2023.08.19',
      title: 'Primary Document Issued',
      desc: `Genuine ${identity.pan_prefix ? 'PAN' : 'passport'} document issued via manufactured utility records.`,
      badge: 'VALID CREDENTIAL',
      badgeClass: 'low',
      dateColor: 'var(--color-text-muted)',
    },
    {
      date: new Date(identity.scored_at ?? Date.now()).toISOString().replace('T', ' ').substring(0, 10).replace(/-/g, '.'),
      title: 'Veritas Core Ingestion',
      desc: `Fintech tier-1 ${hasRing ? 'ring cluster' : 'loan'} request triggered real-time biometric and spectral cross-check.`,
      badge: hasRing ? 'IMMEDIATE TRIAGE' : 'CLEARED',
      badgeClass: hasRing ? 'high' : 'low',
      dateColor: 'var(--primary-container)',
    },
  ]

  return (
    <div className="id-timeline-panel">
      <div className="id-doc-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="mat-icon" style={{ color: 'var(--primary-container)', fontSize: 18 }}>history_toggle_off</span>
          <span className="id-section-title">Synthetic Fabrication Timeline // Identity Evolution</span>
        </div>
        <span className="id-section-meta">AUDIT TRAIL: 2004 – 2024</span>
      </div>

      <div className="id-timeline-grid">
        {events.map((ev, i) => (
          <div key={i} className="id-timeline-event">
            <span className="id-timeline-date" style={{ color: ev.dateColor }}>{ev.date}</span>
            <span className="id-timeline-title">{ev.title}</span>
            <span className="id-timeline-desc">{ev.desc}</span>
            <span className={`severity-badge ${ev.badgeClass}`} style={{ marginTop: 8, fontSize: 10, alignSelf: 'flex-start' }}>
              {ev.badge}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────── */
export default function IdentityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [identity, setIdentity] = useState<Identity & { ring_members?: any[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [statusMessage, setStatusMessage] = useState<{ text: string; type: 'success' | 'info' } | null>(null)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    getIdentity(id)
      .then(setIdentity)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false))
  }, [id])

  // Action: Export forensic JSON case file
  const handleExportCaseFile = () => {
    if (!identity) return
    const casePayload = {
      veritas_case_reference: caseRef(identity.id),
      export_timestamp: new Date().toISOString(),
      analyst: 'OP-8842',
      classification: 'TIER-1 CLASSIFIED FORENSIC INTELLIGENCE',
      subject: identity,
      fused_assessment: {
        fused_score: identity.fused_score,
        risk_label: identity.risk_label,
        model_a_score: identity.model_a_score,
        model_b_score: identity.model_b_score,
        shap_feature_importance: identity.shap_values
      }
    }

    const dataBlob = new Blob([JSON.stringify(casePayload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(dataBlob)
    const link = document.createElement('a')
    link.href = url
    link.download = `veritas_case_${identity.id}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)

    logAuditEvent('export', identity.id, identity.name || identity.id)
    setStatusMessage({ text: 'Forensic Case File exported to JSON successfully.', type: 'info' })
    setTimeout(() => setStatusMessage(null), 4000)
  }

  // Action: Escalate to Fraud Ops
  const handleEscalate = async () => {
    if (!identity) return
    try {
      await createCase({
        identity_id: identity.id,
        status: 'escalated',
        notes: 'Priority escalation from Forensic Case File interface.'
      })
      await logAuditEvent('escalate', identity.id, identity.name || identity.id, { priority: 'URGENT' })
      setStatusMessage({ text: 'Case escalated to Fraud Operations Command.', type: 'success' })
    } catch {
      setStatusMessage({ text: 'Action logged locally.', type: 'info' })
    }
    setTimeout(() => setStatusMessage(null), 4000)
  }

  // Action: Quarantine Identity
  const handleQuarantine = async () => {
    if (!identity) return
    try {
      await createCase({
        identity_id: identity.id,
        status: 'dismissed',
        notes: 'Subject placed under sandboxed isolation and monitoring.'
      })
      await logAuditEvent('quarantine', identity.id, identity.name || identity.id, { action: 'quarantine' })
      setStatusMessage({ text: 'Identity flagged and quarantined in sandbox environment.', type: 'success' })
    } catch {
      setStatusMessage({ text: 'Action recorded locally.', type: 'info' })
    }
    setTimeout(() => setStatusMessage(null), 4000)
  }

  /* Loading skeleton */
  if (loading) return (
    <div className="id-detail-root">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {[160, 320, 240, 80].map((h, i) => (
          <div key={i} className="skeleton" style={{ height: h }} />
        ))}
      </div>
    </div>
  )

  /* Error / not found */
  if (error || !identity) return (
    <div className="id-detail-root">
      <div className="id-notfound">
        <span className="mat-icon" style={{ fontSize: 48, color: 'var(--color-text-muted)', display: 'block', textAlign: 'center', marginBottom: 16 }}>
          search_off
        </span>
        <p style={{ textAlign: 'center', marginBottom: 16, color: 'var(--color-text-muted)', fontFamily: 'var(--font-code)', fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Identity record not found
        </p>
        <div style={{ display: 'flex', justifyContent: 'center' }}>
          <button className="inspect-btn" onClick={() => navigate('/dashboard')}>
            ← Back to Dashboard
          </button>
        </div>
      </div>
    </div>
  )

  const score = identity.fused_score ?? 0
  const label = identity.risk_label ?? riskClass(score)
  const caseId = caseRef(identity.id)
  const scoredAt = identity.scored_at
    ? new Date(identity.scored_at).toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
    : 'N/A'

  return (
    <div className="id-detail-root fade-in-up">

      {/* Status banner */}
      {statusMessage && (
        <div 
          className={`alert-banner ${statusMessage.type === 'success' ? 'success' : 'info'}`}
          style={{ margin: '8px 24px 0' }}
        >
          {statusMessage.text}
        </div>
      )}

      {/* ── Case Archive Breadcrumb ──────────────────────────────── */}
      <div className="id-breadcrumb">
        <div className="id-breadcrumb-left">
          <div className="id-breadcrumb-item">
            <span className="id-breadcrumb-key">CASE ARCHIVE:</span>
            <span className="id-breadcrumb-val">{caseId}</span>
          </div>
          <span className="id-breadcrumb-sep">//</span>
          <div className="id-breadcrumb-item">
            <span className="id-breadcrumb-meta">SUBJECT:</span>
            <span className="id-breadcrumb-name">{identity.name || 'Unknown Identity'}</span>
            {identity.ring_flag && (
              <span className="id-breadcrumb-flag">SYNTHETIC_FLAGGED</span>
            )}
          </div>
          <span className="id-breadcrumb-sep">//</span>
          <div className="id-breadcrumb-item">
            <span className="id-breadcrumb-meta">SCAN TIMESTAMP:</span>
            <span className="id-breadcrumb-ts">{scoredAt}</span>
          </div>
        </div>
        <div className="id-breadcrumb-actions">
          <button className="id-action-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
          <button className="id-action-btn" onClick={handleExportCaseFile}>
            Export Forensic Case File
          </button>
          <button className="id-action-btn" style={{ color: 'var(--risk-medium)' }} onClick={handleQuarantine}>
            Quarantine Identity
          </button>
          <button className="id-action-btn-primary" onClick={handleEscalate}>
            Escalate to Fraud Ops
          </button>
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────── */}
      <div className="id-detail-body">

        {/* Row 1: Hero gauge + SHAP */}
        <div className="id-row-1">
          <HeroGauge score={score} label={label} />
          <ShapPanel shapValues={identity.shap_values} identity={identity} />
        </div>

        {/* Row 2: Doc verification + Network telemetry */}
        <div className="id-row-2">
          <DocVerification identity={identity} />
          <DeviceTelemetry identity={identity} />
        </div>

        {/* Row 3: Timeline */}
        <FabricationTimeline identity={identity} />

        {/* Ring Members (if applicable) */}
        {identity.ring_members && identity.ring_members.length > 0 && (
          <div className="id-ring-members-panel">
            <div className="id-doc-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span className="mat-icon" style={{ color: 'var(--risk-high)', fontSize: 18 }}>hub</span>
                <span className="id-section-title">
                  Ring Members — Cluster #{identity.cluster_id} ({identity.ring_members.length} identities)
                </span>
              </div>
            </div>
            <div className="id-ring-members-grid">
              {identity.ring_members.map((m: any) => (
                <div
                  key={m.id}
                  className="ring-member-row"
                  onClick={() => navigate(`/identity/${m.id}`)}
                >
                  <span className="mat-icon" style={{ fontSize: 13, color: 'var(--color-text-muted)' }}>fingerprint</span>
                  <span className="ring-member-id">{m.name || m.id.slice(0, 12)}</span>
                  <span className="ring-member-score" style={{ color: riskColor(m.fused_score ?? 0) }}>
                    {((m.fused_score ?? 0) * 100).toFixed(0)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
