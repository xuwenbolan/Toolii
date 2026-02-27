import { NavLink, Outlet } from 'react-router-dom'

import { cn } from '@/lib/utils'

const ITEMS = [
  { to: '/dashboard', label: '概览', end: true },
  { to: '/dashboard/transactions', label: '交易流水' },
  { to: '/dashboard/history', label: '处理历史' },
  { to: '/credits/redeem', label: '兑换/分享' },
]

export function DashboardLayout() {
  return (
    <div className="space-y-5">
      <nav className="flex flex-wrap gap-2 rounded-xl border p-2">
        {ITEMS.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                'rounded-md px-3 py-1.5 text-sm text-muted-foreground transition',
                isActive && 'bg-accent text-foreground',
              )
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
