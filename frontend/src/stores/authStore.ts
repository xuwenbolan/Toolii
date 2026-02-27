import { create } from 'zustand'

export type AuthUser = {
  id: number
  email: string
  name: string | null
  is_active: boolean
  email_verified: boolean
  is_admin: boolean
}

type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  setSession: (session: { user: AuthUser; accessToken: string }) => void
  setAccessToken: (accessToken: string) => void
  setUser: (user: AuthUser) => void
  clear: () => void
}

// Clean up legacy localStorage key from previous persist middleware
if (typeof window !== 'undefined') {
  localStorage.removeItem('toolii_auth')
}

export const useAuthStore = create<AuthState>()((set) => ({
  user: null,
  accessToken: null,
  setSession: ({ user, accessToken }) => set({ user, accessToken }),
  setAccessToken: (accessToken) => set({ accessToken }),
  setUser: (user) => set({ user }),
  clear: () => set({ user: null, accessToken: null }),
}))
