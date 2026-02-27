import { Navigate, useLocation } from 'react-router-dom'

import { useAuthStore } from '@/stores/authStore'

type Props = {
  children: React.ReactNode
}

export function AdminRoute({ children }: Props) {
  const user = useAuthStore((s) => s.user)
  const location = useLocation()

  if (!user) {
    const redirect = encodeURIComponent(location.pathname + location.search)
    return <Navigate to={`/auth/login?redirect=${redirect}`} replace />
  }

  if (!user.is_admin) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
