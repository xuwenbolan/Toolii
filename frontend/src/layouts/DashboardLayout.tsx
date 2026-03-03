import { NavLink, Outlet } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

// Translation keys for dashboard nav items
const ITEMS = [
  { to: '/dashboard', labelKey: 'dashboard.overview', end: true },
  { to: '/dashboard/transactions', labelKey: 'dashboard.transactions' },
  { to: '/dashboard/history', labelKey: 'dashboard.processingHistory' },
  { to: '/dashboard/redeem', labelKey: 'dashboard.redeemShare' },
  { to: '/dashboard/transfers', labelKey: 'dashboard.transfers' },
  { to: '/dashboard/settings', labelKey: 'dashboard.settings' },
  { to: '/dashboard/feedback', labelKey: 'dashboard.feedback' },
]

export function DashboardLayout() {
  const { t } = useTranslation('common')

  return (
    <div className="space-y-5">
      <nav className="relative rounded-xl border p-2">
        <div className="overflow-x-auto no-scrollbar snap-x snap-mandatory">
          <div className="flex gap-2 min-w-max">
            {ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'snap-start shrink-0 rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-[color,background-color] duration-[var(--duration-normal)] ease-[var(--ease-out)]',
                    isActive && 'bg-accent text-foreground',
                  )
                }
              >
                {t(item.labelKey)}
              </NavLink>
            ))}
          </div>
        </div>
        <div className="pointer-events-none absolute inset-y-0 right-0 w-6 rounded-r-xl bg-gradient-to-l from-background to-transparent sm:hidden" />
      </nav>
      <div className="motion-safe:animate-[section-in_0.3s_var(--ease-out)_both]">
        <Outlet />
      </div>
    </div>
  )
}
