import { useState, useEffect, useRef } from 'react'
import { BrowserRouter, Routes, Route, NavLink, useNavigate } from 'react-router-dom'
import UploadPage from './pages/Upload'
import DashboardPage from './pages/Dashboard'
import IdentityDetailPage from './pages/IdentityDetail'
import FraudRingsPage from './pages/FraudRings'
import AuthPage from './pages/AuthPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { checkHealth, searchIdentities } from './api'
import './index.css'

/* ── Live session clock & timer ─────────────────────────────────────────── */
function useClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  return now
}

function useSessionTimer() {
  const [secs, setSecs] = useState(0)
  useEffect(() => {
    const id = setInterval(() => setSecs(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [])
  const h = String(Math.floor(secs / 3600)).padStart(2, '0')
  const m = String(Math.floor((secs % 3600) / 60)).padStart(2, '0')
  const s = String(secs % 60).padStart(2, '0')
  return `${h}:${m}:${s}`
}

/* ── Live Backend & ML Health Hook ──────────────────────────────────────── */
function useHealthStatus() {
  const [health, setHealth] = useState<{
    status: string
    latency: number
    db: string
    mlOk: boolean
  }>({
    status: 'SYSTEM ACTIVE',
    latency: 14,
    db: 'connected',
    mlOk: true
  })

  useEffect(() => {
    let mounted = true
    const queryHealth = async () => {
      try {
        const data = await checkHealth()
        if (mounted) {
          const mlAvailable = data.ml && data.ml.status === 'ok'
          setHealth({
            status: mlAvailable ? 'SYSTEM ACTIVE' : 'ML ENGINE DEGRADED',
            latency: data.latency_ms || 12,
            db: data.db || 'connected',
            mlOk: Boolean(mlAvailable)
          })
        }
      } catch {
        if (mounted) {
          setHealth({
            status: 'OFFLINE / STANDALONE',
            latency: 999,
            db: 'disconnected',
            mlOk: false
          })
        }
      }
    }

    queryHealth()
    const timer = setInterval(queryHealth, 15000)
    return () => {
      mounted = false
      clearInterval(timer)
    }
  }, [])

  return health
}

/* ── Top Navigation Header with Live Search & Health ─────────────────────── */
function TopHeader() {
  const now = useClock()
  const session = useSessionTimer()
  const health = useHealthStatus()
  const navigate = useNavigate()

  // Search state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<any[]>([])
  const [searchOpen, setSearchOpen] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const searchWrapRef = useRef<HTMLDivElement>(null)

  const utcTime = now.toISOString().slice(11, 19) + ' UTC'
  const utcDate = now.toISOString().slice(0, 10).replace(/-/g, '.')

  // Close search dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (searchWrapRef.current && !searchWrapRef.current.contains(e.target as Node)) {
        setSearchOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([])
      setSearchOpen(false)
      return
    }

    const timer = setTimeout(async () => {
      setIsSearching(true)
      try {
        const data = await searchIdentities(searchQuery)
        setSearchResults(data.results || [])
        setSearchOpen(true)
      } catch {
        setSearchResults([])
      } finally {
        setIsSearching(false)
      }
    }, 250)

    return () => clearTimeout(timer)
  }, [searchQuery])

  const handleSelectResult = (id: string) => {
    setSearchOpen(false)
    setSearchQuery('')
    navigate(`/identity/${id}`)
  }

  const { user, isAuthenticated, logout } = useAuth()
  const [profileOpen, setProfileOpen] = useState(false)
  const profileWrapRef = useRef<HTMLDivElement>(null)

  // Close profile dropdown on click outside
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (profileWrapRef.current && !profileWrapRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  return (
    <header className="top-header">
      <div className="top-header-inner">
        {/* Logo */}
        <div className="header-logo" onClick={() => navigate('/')} style={{ cursor: 'pointer' }}>
          <div className="header-logo-info">
            <span className="header-logo-title">
              VERITAS{' '}
              <span className="header-logo-subtitle">// FORENSIC IDENTITY</span>
            </span>
            <div className="header-status">
              <span 
                className="status-dot" 
                style={{ 
                  background: health.mlOk ? 'var(--risk-low)' : 'var(--risk-medium)',
                  boxShadow: health.mlOk ? '0 0 8px var(--risk-low)' : '0 0 8px var(--risk-medium)'
                }}
              />
              <span className="status-text">
                {health.status} <span style={{ color: 'var(--border)' }}>|</span> {health.latency}MS LATENCY
              </span>
            </div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="top-nav">
          <NavLink
            to="/"
            end
            className={({ isActive }) => `top-nav-link${isActive ? ' active' : ''}`}
          >
            Analyst Dashboard
          </NavLink>
          <NavLink
            to="/dashboard"
            className={({ isActive }) => `top-nav-link${isActive ? ' active' : ''}`}
          >
            Triage Queue
          </NavLink>
          <NavLink
            to="/rings"
            className={({ isActive }) => `top-nav-link${isActive ? ' active' : ''}`}
          >
            Fraud Ring Investigation
          </NavLink>
        </nav>

        {/* Live Search */}
        <div className="header-search-wrap" ref={searchWrapRef}>
          <div className="header-search">
            <span 
              className="mat-icon search-icon" 
              style={{ 
                position: 'absolute', 
                left: 10, 
                top: '50%', 
                transform: 'translateY(-50%)', 
                fontSize: 16, 
                color: 'var(--outline)', 
                pointerEvents: 'none' 
              }}
            >
              {isSearching ? 'sync' : 'search'}
            </span>
            <input
              type="text"
              placeholder="Query identity hash, SSN/TIN, case #..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              onFocus={() => { if (searchResults.length > 0) setSearchOpen(true) }}
              onKeyDown={e => {
                if (e.key === 'Escape') setSearchOpen(false)
              }}
            />
          </div>

          {/* Search Results Dropdown */}
          {searchOpen && (
            <div className="search-dropdown-overlay">
              <div className="search-dropdown-header">
                <span>FORENSIC MATCHES ({searchResults.length})</span>
                <span>ESC to close</span>
              </div>
              <div className="search-dropdown-list">
                {searchResults.length === 0 ? (
                  <div className="search-dropdown-empty">
                    No matching identities found for "{searchQuery}"
                  </div>
                ) : (
                  searchResults.map(item => (
                    <div
                      key={item.id}
                      className="search-dropdown-item"
                      onClick={() => handleSelectResult(item.id)}
                    >
                      <div className="search-item-left">
                        <span className="mat-icon" style={{ fontSize: 16, color: 'var(--primary-container)' }}>
                          {item.ring_flag ? 'hub' : 'fingerprint'}
                        </span>
                        <div>
                          <span className="search-item-name">{item.name}</span>
                          <span className="search-item-id">{item.id}</span>
                        </div>
                      </div>
                      <div className="search-item-right">
                        <span 
                          className="search-item-score"
                          style={{
                            color: item.risk_label === 'HIGH' ? 'var(--risk-high)' : item.risk_label === 'MEDIUM' ? 'var(--risk-medium)' : 'var(--risk-low)'
                          }}
                        >
                          {((item.fused_score || 0) * 100).toFixed(0)}% RISK
                        </span>
                        {item.cluster_id >= 0 && (
                          <span className="cluster-badge accent" style={{ fontSize: 10, padding: '2px 4px' }}>
                            RING #{item.cluster_id}
                          </span>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right meta */}
        <div className="header-right">
          <div className="session-badge">
            <span className="status-dot cyan"></span>
            <span className="session-label">LIVE SESSION</span>
            <span className="session-timer">{session}</span>
          </div>

          <div className="header-clock">
            <span className="header-clock-time">{utcTime}</span>
            <span className="header-clock-date">{utcDate}</span>
          </div>

          {/* Operator Authentication & Profile Control */}
          {isAuthenticated && user ? (
            <div className="operator-wrapper" ref={profileWrapRef}>
              <div 
                className="operator-section interactive"
                onClick={() => setProfileOpen(!profileOpen)}
                title="View Operator Dossier & Session"
              >
                <div className="operator-text-stack">
                  <span className="operator-badge">{user.badgeId}</span>
                  <span className="operator-subtext">{user.name.split(' ')[0]}</span>
                </div>
                <div className="operator-avatar">
                  <span className="mat-icon" style={{ fontSize: 18 }}>shield_person</span>
                </div>
              </div>

              {/* Operator Dossier Flyout */}
              {profileOpen && (
                <div className="operator-profile-flyout">
                  <div className="flyout-header">
                    <div className="flyout-badge-circle">
                      <span className="mat-icon" style={{ fontSize: 20, color: 'var(--color-accent)' }}>verified</span>
                    </div>
                    <div className="flyout-user-meta">
                      <div className="flyout-user-name">{user.name}</div>
                      <div className="flyout-user-email">{user.email}</div>
                      <div className="flyout-badge-tag">{user.badgeId}</div>
                    </div>
                  </div>

                  <div className="flyout-divider" />

                  <div className="flyout-grid">
                    <div className="flyout-row">
                      <span className="flyout-label">ASSIGNED ROLE</span>
                      <span className="flyout-value">{user.role}</span>
                    </div>
                    <div className="flyout-row">
                      <span className="flyout-label">CLEARANCE LEVEL</span>
                      <span className="flyout-clearance-tag">{user.clearance}</span>
                    </div>
                    <div className="flyout-row">
                      <span className="flyout-label">INVESTIGATION UNIT</span>
                      <span className="flyout-value">{user.department}</span>
                    </div>
                    <div className="flyout-row">
                      <span className="flyout-label">SESSION STATUS</span>
                      <span className="flyout-status-val">
                        <span className="status-dot green" />
                        ACTIVE ON DUTY
                      </span>
                    </div>
                  </div>

                  <div className="flyout-divider" />

                  <div className="flyout-footer">
                    <button
                      type="button"
                      className="flyout-logout-btn"
                      onClick={async () => {
                        setProfileOpen(false)
                        await logout()
                        navigate('/login')
                      }}
                    >
                      <span className="mat-icon" style={{ fontSize: 16 }}>power_settings_new</span>
                      DISCONNECT ENCLAVE SESSION
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="operator-guest-section">
              <button
                type="button"
                className="header-login-btn"
                onClick={() => navigate('/login')}
              >
                <span className="mat-icon" style={{ fontSize: 16 }}>login</span>
                OPERATOR LOGIN
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  )
}

/* ── Pipeline Status Ribbon ──────────────────────────────────────────────── */
function PipelineRibbon() {
  return (
    <div className="pipeline-ribbon">
      <div className="ribbon-left">
        <span className="ribbon-badge">
          <span className="status-dot"></span>
          STREAM ENGINE READY
        </span>
        <span className="ribbon-text">
          PIPELINE: <span>SYNTH-DETECTOR-v4.2.0</span>
        </span>
      </div>
      <div className="ribbon-right">
        <span className="ribbon-stat">
          <span className="mat-icon" style={{ fontSize: 14, color: 'var(--risk-low)' }}>shield</span>
          MEMORY ENCLAVE: ISOLATED
        </span>
        <span className="ribbon-separator">|</span>
        <span className="ribbon-stat">
          <span className="mat-icon" style={{ fontSize: 14, color: 'var(--primary-container)' }}>memory</span>
          DUAL-CORE INFERENCE CLUSTER
        </span>
      </div>
    </div>
  )
}

/* ── App Shell ───────────────────────────────────────────────────────────── */
function AppContent() {
  return (
    <div className="app-layout">
      <TopHeader />
      <main className="main-content">
        <PipelineRibbon />
        <Routes>
          <Route path="/" element={<UploadPage />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/identities" element={<DashboardPage />} />
          <Route path="/identity/:id" element={<IdentityDetailPage />} />
          <Route path="/rings" element={<FraudRingsPage />} />
          <Route path="/login" element={<AuthPage initialMode="login" />} />
          <Route path="/signup" element={<AuthPage initialMode="signup" />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BrowserRouter>
  )
}
