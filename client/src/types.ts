// Shared TypeScript types for Veritas

export interface Identity {
  id: string
  name?: string
  age?: number
  address?: string
  zip_code?: string
  phone?: string
  email?: string
  pan_prefix?: string
  account_age_months?: number
  address_history_count?: number
  shared_phone_count?: number
  shared_email_count?: number
  payment_smoothness?: number
  age_address_mismatch?: number
  ring_id?: number
  is_fraud?: number
  ip_address?: string
  dob?: string

  // Model outputs
  model_a_score?: number
  model_b_score?: number
  fused_score?: number
  risk_label?: 'LOW' | 'MEDIUM' | 'HIGH'
  shap_values?: Record<string, number>
  cluster_id?: number
  ring_flag?: boolean
  batch_id?: string
  scored_at?: string
}

export interface ResultsSummary {
  total: number
  high_risk_count: number
  fraud_rings_count: number
  avg_fused_score: number | string
  identities: Identity[]
}

export interface RingSummary {
  _id: number
  member_count: number
  avg_fused_score: number
  max_fused_score: number
  members: Array<{ id: string; name: string; fused_score: number }>
}

export interface UploadResult {
  success: boolean
  batch_id: string
  count: number
  db_saved: boolean
  results: Identity[]
}

export interface User {
  _id?: string
  id?: string
  name: string
  email: string
  badgeId: string
  role: string
  clearance: string
  department: string
  avatar?: string
  lastLogin?: string
  created_at?: string
}

export interface AuthResponse {
  message?: string
  token: string
  user: User
}

export interface SignupData {
  name: string
  email: string
  password: string
  badgeId?: string
  role?: string
  clearance?: string
  department?: string
}

export interface LoginData {
  email: string
  password: string
}

