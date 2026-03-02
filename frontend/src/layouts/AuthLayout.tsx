import { Link, Outlet } from 'react-router-dom'

import { Logo } from '@/components/common/Logo'

export function AuthLayout() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-10">
      <Link to="/" className="mb-6">
        <Logo size={32} />
      </Link>
      <div className="w-full max-w-md">
        <Outlet />
      </div>
    </div>
  )
}
