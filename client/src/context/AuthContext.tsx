import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import type { User, SignupData, LoginData } from '../types'
import { getMe, loginUser, signupUser, demoLoginUser, logoutUser, updateUserProfile, getAuthToken, setAuthToken } from '../api'

interface AuthContextType {
  user: User | null
  token: string | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (data: LoginData) => Promise<void>
  signup: (data: SignupData) => Promise<void>
  demoLogin: (preset?: 'lead' | 'specialist') => Promise<void>
  logout: () => Promise<void>
  updateProfile: (data: Partial<User>) => Promise<void>
  refreshUser: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('veritas_user_profile')
    if (saved) {
      try {
        return JSON.parse(saved)
      } catch {
        return null
      }
    }
    return null
  })
  const [token, setToken] = useState<string | null>(getAuthToken())
  const [isLoading, setIsLoading] = useState<boolean>(true)

  // Sync user state to localStorage cache
  useEffect(() => {
    if (user) {
      localStorage.setItem('veritas_user_profile', JSON.stringify(user))
    } else {
      localStorage.removeItem('veritas_user_profile')
    }
  }, [user])

  // Hydrate user on mount if token exists
  const refreshUser = useCallback(async () => {
    const activeToken = getAuthToken()
    if (!activeToken) {
      setUser(null)
      setIsLoading(false)
      return
    }

    try {
      const data = await getMe()
      setUser(data.user)
      setToken(activeToken)
    } catch (err) {
      console.warn('Operator session invalid, clearing credentials:', err)
      setUser(null)
      setToken(null)
      setAuthToken(null)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    refreshUser()
  }, [refreshUser])

  const login = async (data: LoginData) => {
    setIsLoading(true)
    try {
      const res = await loginUser(data)
      setUser(res.user)
      setToken(res.token)
    } finally {
      setIsLoading(false)
    }
  }

  const signup = async (data: SignupData) => {
    setIsLoading(true)
    try {
      const res = await signupUser(data)
      setUser(res.user)
      setToken(res.token)
    } finally {
      setIsLoading(false)
    }
  }

  const demoLogin = async (preset: 'lead' | 'specialist' = 'lead') => {
    setIsLoading(true)
    try {
      const res = await demoLoginUser(preset)
      setUser(res.user)
      setToken(res.token)
    } finally {
      setIsLoading(false)
    }
  }

  const logout = async () => {
    setIsLoading(true)
    try {
      await logoutUser()
      setUser(null)
      setToken(null)
    } finally {
      setIsLoading(false)
    }
  }

  const updateProfile = async (data: Partial<User>) => {
    const res = await updateUserProfile(data)
    setUser(res.user)
    if (res.token) setToken(res.token)
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isLoading,
        isAuthenticated: Boolean(user && token),
        login,
        signup,
        demoLogin,
        logout,
        updateProfile,
        refreshUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
