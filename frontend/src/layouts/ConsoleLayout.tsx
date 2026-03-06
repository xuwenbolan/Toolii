import { useState } from 'react'
import { NavLink, Outlet, Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  BarChart3,
  CreditCard,
  ExternalLink,
  FolderOpen,
  HardDrive,
  LayoutDashboard,
  Menu,
  MessageSquare,
  Monitor,
  PanelLeftClose,
  PanelLeftOpen,
  Send,
  Settings2,
  Users,
  X,
} from 'lucide-react'

import { cn } from '@/lib/utils'
import { Logo } from '@/components/common/Logo'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { useAuthStore } from '@/stores/authStore'
import { TooltipProvider } from '@/components/ui/tooltip'

type NavItem = {
  to: string
  labelKey: string
  icon: React.ComponentType<{ className?: string }>
  end?: boolean
}

type NavGroup = {
  titleKey: string
  items: NavItem[]
}

const NAV_GROUPS: NavGroup[] = [
  {
    titleKey: 'console:navGroup.overview',
    items: [
      { to: '/console', labelKey: 'console:nav.dashboard', icon: LayoutDashboard, end: true },
      { to: '/console/operations', labelKey: 'console:nav.operations', icon: BarChart3 },
    ],
  },
  {
    titleKey: 'console:navGroup.management',
    items: [
      { to: '/console/users', labelKey: 'console:nav.users', icon: Users },
      { to: '/console/cards', labelKey: 'console:nav.cards', icon: CreditCard },
      { to: '/console/tools', labelKey: 'console:nav.tools', icon: Settings2 },
      { to: '/console/feedback', labelKey: 'console:nav.feedback', icon: MessageSquare },
    ],
  },
  {
    titleKey: 'console:navGroup.content',
    items: [
      { to: '/console/storage', labelKey: 'console:nav.storage', icon: HardDrive },
      { to: '/console/transfers', labelKey: 'console:nav.transfers', icon: Send },
      { to: '/console/files', labelKey: 'console:nav.files', icon: FolderOpen },
    ],
  },
  {
    titleKey: 'console:navGroup.system',
    items: [
      { to: '/console/system', labelKey: 'console:nav.system', icon: Monitor },
    ],
  },
]

export function ConsoleLayout() {
  const { t } = useTranslation('console')
  const user = useAuthStore((s) => s.user)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="flex h-svh overflow-hidden bg-background text-foreground">
      {/* Mobile overlay */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 lg:hidden',
          mobileOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
        onClick={() => setMobileOpen(false)}
      />

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-40 flex flex-col border-r border-border/50 bg-card transition-all duration-200 lg:static',
          collapsed ? 'lg:w-16' : 'lg:w-56',
          mobileOpen ? 'w-64 translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Sidebar header */}
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-border/50 px-3">
          <Link to="/console" className={cn(collapsed && 'lg:hidden')}>
            <Logo size={20} />
          </Link>
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="hidden rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground lg:block"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button
            type="button"
            onClick={() => setMobileOpen(false)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          >
            <X size={16} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2">
          {NAV_GROUPS.map((group) => (
            <div key={group.titleKey} className="mb-3">
              <p
                className={cn(
                  'mb-1 px-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70',
                  collapsed && 'lg:hidden',
                )}
              >
                {t(group.titleKey.replace('console:', ''))}
              </p>
              {group.items.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.end}
                  onClick={() => setMobileOpen(false)}
                  title={collapsed ? t(item.labelKey.replace('console:', '')) : undefined}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-2.5 rounded-md px-2.5 py-1.5 text-sm transition-colors',
                      collapsed && 'lg:justify-center lg:px-0',
                      isActive
                        ? 'bg-accent font-medium text-foreground'
                        : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground',
                    )
                  }
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  <span className={cn(collapsed && 'lg:hidden')}>
                    {t(item.labelKey.replace('console:', ''))}
                  </span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        {/* Sidebar footer */}
        <div className={cn('border-t border-border/50 p-3', collapsed && 'lg:p-2')}>
          <Link
            to="/"
            className={cn(
              'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent/50 hover:text-foreground',
              collapsed && 'lg:justify-center lg:px-0',
            )}
            title={collapsed ? t('backToSite') : undefined}
          >
            <ExternalLink className="h-4 w-4 shrink-0" />
            <span className={cn(collapsed && 'lg:hidden')}>{t('backToSite')}</span>
          </Link>
          {user && (
            <div className={cn('mt-2 px-2.5', collapsed && 'lg:hidden')}>
              <p className="truncate text-xs font-medium">{user.name || user.email}</p>
              <p className="truncate text-[11px] text-muted-foreground">{user.email}</p>
            </div>
          )}
        </div>
      </aside>

      {/* Main area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border/50 px-4">
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className="rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground lg:hidden"
          >
            <Menu size={18} />
          </button>
          <h1 className="text-sm font-medium">{t('title')}</h1>
          <div className="ml-auto">
            <LanguageSwitcher />
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-auto p-4 lg:p-6">
          <TooltipProvider>
            <div className="motion-safe:animate-fade-in">
              <Outlet />
            </div>
          </TooltipProvider>
        </main>
      </div>
    </div>
  )
}
