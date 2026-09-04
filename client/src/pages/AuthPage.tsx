import { useState, useEffect } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

interface AuthPageProps {
  initialMode?: 'login' | 'signup'
}

export default function AuthPage({ initialMode = 'login' }: AuthPageProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, login, signup, demoLogin, isAuthenticated, isLoading } = useAuth()

  // Determine mode from path or prop
  const isSignupPath = location.pathname === '/signup' || initialMode === 'signup'
  const [mode, setMode] = useState<'login' | 'signup'>(isSignupPath ? 'signup' : 'login')

  useEffect(() => {
    if (location.pathname === '/signup') {
      setMode('signup')
    } else if (location.pathname === '/login') {
      setMode('login')
    }
  }, [location.pathname])

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && user) {
      navigate('/dashboard', { replace: true })
    }
  }, [isAuthenticated, user, navigate])

  // Form states
  const [loginEmail, setLoginEmail] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Signup states
  const [signupName, setSignupName] = useState('')
  const [signupEmail, setSignupEmail] = useState('')
  const [signupPassword, setSignupPassword] = useState('')
  const [signupBadgeId, setSignupBadgeId] = useState(`OP-${Math.floor(1000 + Math.random() * 9000)}`)
  const [signupRole, setSignupRole] = useState('Lead Forensic Investigator')
  const [signupClearance, setSignupClearance] = useState('LEVEL-3 TOP SECRET')
  const [signupDept, setSignupDept] = useState('Synthetic ID Taskforce')

  // UI status
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  // Clear errors when switching tabs
  const handleTabChange = (newMode: 'login' | 'signup') => {
    setMode(newMode)
    setError(null)
    setSuccessMessage(null)
  }

  // Handle Login submission
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await login({ email: loginEmail, password: loginPassword })
      const from = (location.state as any)?.from?.pathname || '/dashboard'
      setSuccessMessage('Credentials validated. Enclave session established.')
      setTimeout(() => navigate(from), 400)
    } catch (err: any) {
      setError(err.message || 'Authentication failed. Please verify credentials.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Signup submission
  const handleSignupSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSubmitting(true)

    try {
      await signup({
        name: signupName,
        email: signupEmail,
        password: signupPassword,
        badgeId: signupBadgeId,
        role: signupRole,
        clearance: signupClearance,
        department: signupDept,
      })
      const from = (location.state as any)?.from?.pathname || '/dashboard'
      setSuccessMessage('Operator credentials provisioned. Redirecting to terminal...')
      setTimeout(() => navigate(from), 500)
    } catch (err: any) {
      setError(err.message || 'Failed to enlist operator.')
    } finally {
      setSubmitting(false)
    }
  }

  // Handle Quick Demo Login
  const handleDemoLogin = async (preset: 'lead' | 'specialist') => {
    setError(null)
    setSubmitting(true)
    try {
      await demoLogin(preset)
      const from = (location.state as any)?.from?.pathname || '/dashboard'
      setSuccessMessage(`Demo session authorized as ${preset === 'lead' ? 'Lead Investigator OP-8842' : 'Analyst OP-4109'}.`)
      setTimeout(() => navigate(from), 400)
    } catch (err: any) {
      setError(err.message || 'Quick demo login failed.')
    } finally {
      setSubmitting(false)
    }
  }

  const generateNewBadge = () => {
    setSignupBadgeId(`OP-${Math.floor(1000 + Math.random() * 9000)}`)
  }

  return (
    <div className="auth-page-container">
      {/* Background Matrix/Grid accent */}
      <div className="auth-grid-overlay" />

      <div className="auth-wrapper">
        {/* Top security header bar */}
        <div className="auth-security-banner">
          <div className="auth-security-left">
            <span className="status-dot cyan" />
            <span className="auth-security-title">SECURITY ENCLAVE // AUTHENTICATION GATE</span>
          </div>
          <div className="auth-security-right">
            <span className="auth-hash-tag">PROTOCOL: ED25519-TLS</span>
          </div>
        </div>

        {/* Main card */}
        <div className="auth-card">
          {/* Brand header */}
          <div className="auth-header">
            <div className="auth-logo-badge">
              <span className="mat-icon auth-logo-icon">shield_lock</span>
            </div>
            <h1 className="auth-title">
              VERITAS <span className="auth-title-tag">// IDENTITY FORENSICS</span>
            </h1>
            <p className="auth-subtitle">
              Classified Synthetic Identity & Fraud Ring Investigation System
            </p>
          </div>

          {/* Mode Tabs */}
          <div className="auth-tabs">
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'login' ? 'active' : ''}`}
              onClick={() => handleTabChange('login')}
            >
              <span className="mat-icon" style={{ fontSize: 16 }}>login</span>
              OPERATOR SIGN IN
            </button>
            <button
              type="button"
              className={`auth-tab-btn ${mode === 'signup' ? 'active' : ''}`}
              onClick={() => handleTabChange('signup')}
            >
              <span className="mat-icon" style={{ fontSize: 16 }}>badge</span>
              ANALYST ENLISTMENT
            </button>
          </div>

          {/* Error Banner */}
          {error && (
            <div className="auth-alert error">
              <span className="mat-icon auth-alert-icon">error</span>
              <div className="auth-alert-content">
                <span className="auth-alert-heading">ACCESS DENIED</span>
                <span className="auth-alert-text">{error}</span>
              </div>
            </div>
          )}

          {/* Success Banner */}
          {successMessage && (
            <div className="auth-alert success">
              <span className="mat-icon auth-alert-icon">verified_user</span>
              <div className="auth-alert-content">
                <span className="auth-alert-heading">CREDENTIAL AUTHORIZED</span>
                <span className="auth-alert-text">{successMessage}</span>
              </div>
            </div>
          )}

          {/* Form: LOGIN */}
          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="auth-form">
              <div className="auth-field">
                <label className="auth-label">
                  <span className="mat-icon" style={{ fontSize: 14 }}>mail</span>
                  OFFICIAL WORK EMAIL
                </label>
                <div className="auth-input-wrap">
                  <input
                    type="email"
                    required
                    placeholder="e.g. operator@veritas.sec"
                    value={loginEmail}
                    onChange={e => setLoginEmail(e.target.value)}
                    className="auth-input"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="auth-field">
                <div className="auth-label-split">
                  <label className="auth-label">
                    <span className="mat-icon" style={{ fontSize: 14 }}>key</span>
                    SECURITY PASSWORD
                  </label>
                  <button
                    type="button"
                    className="auth-link-btn"
                    onClick={() => {
                      setLoginEmail('operator@veritas.sec')
                      setLoginPassword('veritas2026')
                    }}
                  >
                    Use Demo Credentials
                  </button>
                </div>
                <div className="auth-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Enter security passphrase"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    className="auth-input"
                    autoComplete="current-password"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    <span className="mat-icon" style={{ fontSize: 18 }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || isLoading}
                className="auth-submit-btn primary"
              >
                {submitting ? (
                  <>
                    <span className="mat-icon spin" style={{ fontSize: 16 }}>sync</span>
                    VERIFYING ENCLAVE CIPHER...
                  </>
                ) : (
                  <>
                    <span className="mat-icon" style={{ fontSize: 16 }}>lock_open</span>
                    AUTHENTICATE SESSION
                  </>
                )}
              </button>

              {/* Quick 1-Click Demo Evaluation Box */}
              <div className="auth-demo-box">
                <div className="auth-demo-header">
                  <span className="mat-icon" style={{ fontSize: 14, color: 'var(--color-accent)' }}>flash_on</span>
                  <span>EVALUATOR QUICK-CONNECT (ONE CLICK)</span>
                </div>
                <div className="auth-demo-grid">
                  <button
                    type="button"
                    className="auth-demo-card"
                    onClick={() => handleDemoLogin('lead')}
                    disabled={submitting}
                  >
                    <div className="auth-demo-info">
                      <span className="auth-demo-role">Sarah Lin</span>
                      <span className="auth-demo-sub">Lead Investigator • OP-8842</span>
                    </div>
                    <span className="auth-demo-badge">LEVEL-3</span>
                  </button>
                  <button
                    type="button"
                    className="auth-demo-card"
                    onClick={() => handleDemoLogin('specialist')}
                    disabled={submitting}
                  >
                    <div className="auth-demo-info">
                      <span className="auth-demo-role">David Chen</span>
                      <span className="auth-demo-sub">Forensic Analyst • OP-4109</span>
                    </div>
                    <span className="auth-demo-badge">LEVEL-2</span>
                  </button>
                </div>
              </div>
            </form>
          ) : (
            /* Form: SIGNUP */
            <form onSubmit={handleSignupSubmit} className="auth-form">
              <div className="auth-form-row">
                <div className="auth-field">
                  <label className="auth-label">
                    <span className="mat-icon" style={{ fontSize: 14 }}>person</span>
                    OPERATOR NAME
                  </label>
                  <div className="auth-input-wrap">
                    <input
                      type="text"
                      required
                      placeholder="e.g. Alex Mercer"
                      value={signupName}
                      onChange={e => setSignupName(e.target.value)}
                      className="auth-input"
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <div className="auth-label-split">
                    <label className="auth-label">
                      <span className="mat-icon" style={{ fontSize: 14 }}>badge</span>
                      BADGE CALLSIGN
                    </label>
                    <button
                      type="button"
                      className="auth-link-btn"
                      onClick={generateNewBadge}
                      title="Generate unique operator badge ID"
                    >
                      Regenerate
                    </button>
                  </div>
                  <div className="auth-input-wrap">
                    <input
                      type="text"
                      required
                      value={signupBadgeId}
                      onChange={e => setSignupBadgeId(e.target.value.toUpperCase())}
                      className="auth-input font-code"
                      placeholder="OP-XXXX"
                    />
                  </div>
                </div>
              </div>

              <div className="auth-field">
                <label className="auth-label">
                  <span className="mat-icon" style={{ fontSize: 14 }}>mail</span>
                  OFFICIAL EMAIL ADDRESS
                </label>
                <div className="auth-input-wrap">
                  <input
                    type="email"
                    required
                    placeholder="e.g. mercer@veritas.sec"
                    value={signupEmail}
                    onChange={e => setSignupEmail(e.target.value)}
                    className="auth-input"
                    autoComplete="email"
                  />
                </div>
              </div>

              <div className="auth-form-row">
                <div className="auth-field">
                  <label className="auth-label">
                    <span className="mat-icon" style={{ fontSize: 14 }}>military_tech</span>
                    ASSIGNED ROLE
                  </label>
                  <div className="auth-input-wrap">
                    <select
                      value={signupRole}
                      onChange={e => setSignupRole(e.target.value)}
                      className="auth-select"
                    >
                      <option value="Lead Forensic Investigator">Lead Forensic Investigator</option>
                      <option value="Synthetic ID Specialist">Synthetic ID Specialist</option>
                      <option value="AML Fraud Analyst">AML Fraud Analyst</option>
                      <option value="Vector Graph Intelligence Officer">Vector Graph Intelligence Officer</option>
                      <option value="Senior Risk Auditor">Senior Risk Auditor</option>
                    </select>
                  </div>
                </div>

                <div className="auth-field">
                  <label className="auth-label">
                    <span className="mat-icon" style={{ fontSize: 14 }}>security</span>
                    CLEARANCE TIER
                  </label>
                  <div className="auth-input-wrap">
                    <select
                      value={signupClearance}
                      onChange={e => setSignupClearance(e.target.value)}
                      className="auth-select"
                    >
                      <option value="LEVEL-3 TOP SECRET">LEVEL-3 TOP SECRET</option>
                      <option value="LEVEL-2 CONFIDENTIAL">LEVEL-2 CONFIDENTIAL</option>
                      <option value="LEVEL-1 STANDARD">LEVEL-1 STANDARD</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="auth-field">
                <label className="auth-label">
                  <span className="mat-icon" style={{ fontSize: 14 }}>domain</span>
                  DEPARTMENT / UNIT
                </label>
                <div className="auth-input-wrap">
                  <input
                    type="text"
                    required
                    value={signupDept}
                    onChange={e => setSignupDept(e.target.value)}
                    className="auth-input"
                    placeholder="e.g. Synthetic ID Taskforce"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label className="auth-label">
                  <span className="mat-icon" style={{ fontSize: 14 }}>lock</span>
                  MASTER SECURITY PASSPHRASE
                </label>
                <div className="auth-input-wrap">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={6}
                    placeholder="Minimum 6 characters"
                    value={signupPassword}
                    onChange={e => setSignupPassword(e.target.value)}
                    className="auth-input"
                    autoComplete="new-password"
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    <span className="mat-icon" style={{ fontSize: 18 }}>
                      {showPassword ? 'visibility_off' : 'visibility'}
                    </span>
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || isLoading}
                className="auth-submit-btn primary"
              >
                {submitting ? (
                  <>
                    <span className="mat-icon spin" style={{ fontSize: 16 }}>sync</span>
                    PROVISIONING CREDENTIAL...
                  </>
                ) : (
                  <>
                    <span className="mat-icon" style={{ fontSize: 16 }}>how_to_reg</span>
                    PROVISION OPERATOR IDENTITY
                  </>
                )}
              </button>
            </form>
          )}

          {/* Footer actions */}
          <div className="auth-footer">
            <span className="auth-footer-text">Need immediate triage without sign-in?</span>
            <button
              type="button"
              className="auth-guest-link"
              onClick={() => navigate('/dashboard')}
            >
              Continue as Guest Auditor <span className="mat-icon" style={{ fontSize: 14 }}>arrow_forward</span>
            </button>
          </div>
        </div>

        {/* Security badge at bottom */}
        <div className="auth-footnote">
          <span className="mat-icon" style={{ fontSize: 14, color: 'var(--color-accent)' }}>verified</span>
          <span>VERITAS CRYPTOGRAPHIC INTEGRITY ENCLAVE // RESTRICTED ACCESS SYSTEM</span>
        </div>
      </div>
    </div>
  )
}
