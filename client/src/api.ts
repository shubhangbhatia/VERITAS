// Veritas API client — wraps all fetch calls to Express backend
import type { User, AuthResponse, SignupData, LoginData } from './types'

const BASE = '/api'

export function getAuthToken(): string | null {
  return localStorage.getItem('veritas_auth_token')
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('veritas_auth_token', token)
  } else {
    localStorage.removeItem('veritas_auth_token')
  }
}

function getHeaders(customHeaders: Record<string, string> = {}): Record<string, string> {
  const token = getAuthToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...customHeaders,
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

// ── Authentication API ──────────────────────────────────────────────────────
export async function signupUser(data: SignupData): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || 'Failed to register operator credentials.')
  }
  if (json.token) setAuthToken(json.token)
  return json
}

export async function loginUser(data: LoginData): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || 'Authentication failed. Please verify credentials.')
  }
  if (json.token) setAuthToken(json.token)
  return json
}

export async function demoLoginUser(preset: 'lead' | 'specialist' = 'lead'): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/demo-login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ preset }),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || 'Failed to establish demo session.')
  }
  if (json.token) setAuthToken(json.token)
  return json
}

export async function getMe(): Promise<{ user: User }> {
  const token = getAuthToken()
  if (!token) throw new Error('No active operator token.')

  const res = await fetch(`${BASE}/auth/me`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  })
  if (!res.ok) {
    setAuthToken(null)
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Session expired')
  }
  return res.json()
}

export async function updateUserProfile(data: Partial<User>): Promise<AuthResponse> {
  const res = await fetch(`${BASE}/auth/profile`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data),
  })
  const json = await res.json()
  if (!res.ok) {
    throw new Error(json.error || 'Failed to update profile')
  }
  if (json.token) setAuthToken(json.token)
  return json
}

export async function logoutUser(): Promise<void> {
  const token = getAuthToken()
  try {
    if (token) {
      await fetch(`${BASE}/auth/logout`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` },
      })
    }
  } catch {
    // ignore
  } finally {
    setAuthToken(null)
  }
}

// ── Forensic Operations & Data API ──────────────────────────────────────────
export async function uploadCSV(file: File) {
  const form = new FormData()
  form.append('file', file)
  const token = getAuthToken()
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`

  const res = await fetch(`${BASE}/upload`, { 
    method: 'POST', 
    headers,
    body: form 
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || 'Upload failed')
  }
  return res.json()
}

export function getTemplateDownloadUrl() {
  return `${BASE}/upload/template`
}

export async function getResults(params?: {
  risk_label?: string
  ring_flag?: boolean
  limit?: number
  skip?: number
}) {
  const qs = new URLSearchParams()
  if (params?.risk_label) qs.set('risk_label', params.risk_label)
  if (params?.ring_flag)  qs.set('ring_flag', 'true')
  if (params?.limit !== undefined) qs.set('limit', String(params.limit))
  if (params?.skip !== undefined)  qs.set('skip', String(params.skip))
  const res = await fetch(`${BASE}/results?${qs}`)
  if (!res.ok) throw new Error('Failed to fetch results')
  return res.json()
}

export async function getIdentity(id: string) {
  const res = await fetch(`${BASE}/results/${encodeURIComponent(id)}`)
  if (!res.ok) throw new Error('Identity not found')
  return res.json()
}

export async function getRings() {
  const res = await fetch(`${BASE}/results/rings/summary`)
  if (!res.ok) throw new Error('Failed to fetch rings')
  return res.json()
}

export async function demoInject() {
  const res = await fetch(`${BASE}/demo/inject`, { 
    method: 'POST', 
    headers: getHeaders() 
  })
  if (!res.ok) throw new Error('Demo inject failed')
  return res.json()
}

export async function checkHealth() {
  const res = await fetch(`${BASE}/health`)
  if (!res.ok) throw new Error('Health check unreachable')
  return res.json()
}

export async function searchIdentities(q: string) {
  const res = await fetch(`${BASE}/search?q=${encodeURIComponent(q)}`)
  if (!res.ok) throw new Error('Search failed')
  return res.json()
}

export async function createCase(data: {
  identity_id: string
  status?: 'open' | 'escalated' | 'dismissed' | 'seized'
  notes?: string
  analyst_id?: string
}) {
  const res = await fetch(`${BASE}/cases`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to create case')
  return res.json()
}

export async function updateCase(
  id: string,
  data: {
    status?: 'open' | 'escalated' | 'dismissed' | 'seized'
    notes?: string
    analyst_id?: string
  }
) {
  const res = await fetch(`${BASE}/cases/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    headers: getHeaders(),
    body: JSON.stringify(data)
  })
  if (!res.ok) throw new Error('Failed to update case')
  return res.json()
}

export async function getCases(params?: {
  status?: string
  limit?: number
  skip?: number
}) {
  const qs = new URLSearchParams()
  if (params?.status) qs.set('status', params.status)
  if (params?.limit)  qs.set('limit', String(params.limit))
  if (params?.skip)   qs.set('skip', String(params.skip))
  const res = await fetch(`${BASE}/cases?${qs}`)
  if (!res.ok) throw new Error('Failed to fetch cases')
  return res.json()
}

export async function logAuditEvent(
  action: 'upload' | 'inspect' | 'escalate' | 'dismiss' | 'seize' | 'quarantine' | 'search' | 'export' | 'login' | 'signup' | 'logout',
  target_id: string = '',
  target_name: string = '',
  meta: any = {}
) {
  try {
    const res = await fetch(`${BASE}/audit`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ action, target_id, target_name, meta })
    })
    return res.json()
  } catch (err) {
    console.warn('Audit logging non-fatal error:', err)
  }
}

export async function getAuditLog(limit: number = 20) {
  const res = await fetch(`${BASE}/audit?limit=${limit}`)
  if (!res.ok) throw new Error('Failed to fetch audit log')
  return res.json()
}
