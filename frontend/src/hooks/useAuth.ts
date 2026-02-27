import { useCallback } from 'react'

import { fetchMe } from '@/services/authApi'
import { useAuthStore } from '@/stores/authStore'

export function useAuth() {
  const user = useAuthStore((s) => s.user)
  const accessToken = useAuthStore((s) => s.accessToken)
  const refreshToken = useAuthStore((s) => s.refreshToken)
  const clear = useAuthStore((s) => s.clear)

  const bootstrap = useCallback(async () => {
    if (!accessToken && !refreshToken) return
    try {
      await fetchMe()
    } catch {
      clear()
    }
  }, [accessToken, refreshToken, clear])

  return {
    user,
    isAuthenticated: Boolean(user),
    bootstrap,
    logout: clear,
  }
}
