import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'
import { useAuthStore } from '@/stores/authStore'

const NAV_ITEMS = [
  { to: '/admin', labelKey: 'admin:nav.dashboard', end: true },
  { to: '/admin/users', labelKey: 'admin:nav.users' },
  { to: '/admin/cards', labelKey: 'admin:nav.cards' },
  { to: '/admin/tools', labelKey: 'admin:nav.tools' },
  { to: '/admin/operations', labelKey: 'admin:nav.operations' },
  { to: '/admin/feedback', labelKey: 'admin:nav.feedback' },
]

export function AdminLayout() {
  const { t } = useTranslation('admin')
  const user = useAuthStore((s) => s.user)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex min-h-[calc(100vh-4rem)]">
      {/* Mobile sidebar toggle */}
      <button
        type="button"
        className="fixed bottom-4 right-4 z-50 rounded-full bg-primary p-3 text-primary-foreground shadow-lg lg:hidden"
        onClick={() => setSidebarOpen(!sidebarOpen)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {sidebarOpen ? (
            <path d="M18 6 6 18M6 6l12 12" />
          ) : (
            <path d="M3 12h18M3 6h18M3 18h18" />
          )}
        </svg>
      </button>

      {/* Sidebar overlay for mobile */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 lg:hidden transition-opacity duration-[var(--duration-normal)] ease-[var(--ease-out)]',
          sidebarOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setSidebarOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r bg-card transition-transform duration-[var(--duration-normal)] ease-[var(--ease-out)] lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b px-4 py-4">
          <h2 className="text-lg font-semibold">{t('title')}</h2>
          <Link
            to="/"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            {t('backToSite')}
          </Link>
        </div>

        <nav className="flex-1 space-y-1 p-3 [&>a]:motion-safe:animate-[section-in_0.25s_var(--ease-out)_both] [&>a:nth-child(1)]:motion-safe:[animation-delay:50ms] [&>a:nth-child(2)]:motion-safe:[animation-delay:100ms] [&>a:nth-child(3)]:motion-safe:[animation-delay:150ms] [&>a:nth-child(4)]:motion-safe:[animation-delay:200ms] [&>a:nth-child(5)]:motion-safe:[animation-delay:250ms] [&>a:nth-child(6)]:motion-safe:[animation-delay:300ms]">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                cn(
                  'flex items-center rounded-md px-3 py-2 text-sm transition-colors',
                  isActive
                    ? 'bg-accent font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                )
              }
            >
              {t(item.labelKey.replace('admin:', ''))}
            </NavLink>
          ))}
        </nav>

        {user && (
          <div className="border-t p-4">
            <p className="truncate text-sm font-medium">{user.name || user.email}</p>
            <p className="truncate text-xs text-muted-foreground">{user.email}</p>
          </div>
        )}
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-auto p-4 lg:p-6">
        <div className="motion-safe:animate-[section-in_0.3s_var(--ease-out)_both]">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
