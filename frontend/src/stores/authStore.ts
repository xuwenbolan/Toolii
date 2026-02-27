import { create } from 'zustand'
import { persist } from 'zustand/middleware'

export type AuthUser = {
  id: number
  email: string
  name: string | null
  is_active: boolean
}

type AuthState = {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  setSession: (session: {
    user: AuthUser
    accessToken: string
    refreshToken: string
  }) => void
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void
  clear: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setSession: ({ user, accessToken, refreshToken }) =>
        set({ user, accessToken, refreshToken }),
      setTokens: ({ accessToken, refreshToken }) =>
        set({ accessToken, refreshToken }),
      clear: () => set({ user: null, accessToken: null, refreshToken: null }),
    }),
    {
      name: 'toolii_auth',
      version: 1,
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        refreshToken: state.refreshToken,
      }),
    },
  ),
)

