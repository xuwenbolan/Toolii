import { useCallback } from 'react'

import { fetchMe, logoutApi } from '@/services/authApi'
import { api } from '@/services/api'
import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const clear = useAuthStore((s) => s.clear)

  const bootstrap = useCallback(async () => {
    // If we already have an access token in memory, validate with /me
    if (accessToken) {
      try {
        await fetchMe()
      } catch {
        clear()
      }
      return
    }
    // No access token in memory -> try refreshing via HttpOnly cookie
    try {
      const res = await api.post('/api/auth/refresh')
      const access = res.data?.tokens?.access_token as string | undefined
      if (access) {
        useAuthStore.getState().setAccessToken(access)
        await fetchMe()
      }
    } catch {
      clear()
    }
  }, [accessToken, clear])

  return {
    user,
    isAuthenticated: Boolean(user),
    bootstrap,
    logout: logoutApi,
  }
}
