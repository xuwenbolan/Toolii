import { Outlet } from 'react-router-dom'

export function AuthLayout() {
  return (
    <div className="mx-auto w-full max-w-screen-sm px-4 py-10">
      <Outlet />
    </div>
  )
}

