import { useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router-dom'

import { useAuth } from '@/hooks/useAuth'
import { useAuthStore } from '@/stores/authStore'

type Props = {
  children: React.ReactNode
}

export function AdminRoute({ children }: Props) {
  const { bootstrap } = useAuth()
  const user = useAuthStore((s) => s.user)
  const location = useLocation()
  const [ready, setReady] = useState(false)

  useEffect(() => {
    bootstrap().finally(() => setReady(true))
  }, [bootstrap])

  if (!ready) {
    return (
      <div className="flex h-svh items-center justify-center bg-background text-foreground">
        <div className="text-sm text-muted-foreground">Loading...</div>
      </div>
    )
  }

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/auth/login?redirect=${redirect}`} replace />
  }

  if (!user.is_admin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
