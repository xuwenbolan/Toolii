import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useTranslation } from 'react-i18next'
import {
  Camera,
  FileText,
  Home,
  ImageIcon,
  LayoutDashboard,
  LogIn,
  LogOut,
  Menu,
  UserPlus,
  Wallet,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/common/Logo'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { Separator } from '@/components/ui/separator'
import { useAuth } from '@/hooks/useAuth'

// Translation keys for nav items
const NAV_ITEMS = [
  { labelKey: 'nav.home', to: '/', icon: Home },
  { labelKey: 'nav.idPhoto', to: '/id-photo', icon: Camera },
  { labelKey: 'nav.imageTools', to: '/image-tools', icon: ImageIcon },
  { labelKey: 'nav.pdfTools', to: '/pdf-tools', icon: FileText },
]

const AUTH_NAV = [
  { labelKey: 'nav.dashboard', to: '/dashboard', icon: LayoutDashboard },
  { labelKey: 'nav.redeemCredits', to: '/dashboard/redeem', icon: Wallet },
]

export function MobileNav() {
  const [open, setOpen] = useState(false)
  const { user, logout } = useAuth()
  const location = useLocation()
  const { t } = useTranslation('common')

  const isActive = (to: string) =>
    to === '/' ? location.pathname === '/' : location.pathname.startsWith(to)

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden">
          <Menu className="h-5 w-5" />
          <span className="sr-only">Menu</span>
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[85vw] max-w-xs p-0">
        <SheetHeader className="flex flex-row items-center justify-between px-4 pt-4 pb-2">
          <SheetTitle className="text-left text-base">
            <Logo size={20} />
          </SheetTitle>
          <LanguageSwitcher />
        </SheetHeader>
        <nav className="flex flex-col gap-1 px-2 py-2">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                isActive(item.to)
                  ? 'bg-accent font-medium text-accent-foreground'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              }`}
            >
              <item.icon className="h-4 w-4" />
              {t(item.labelKey)}
            </Link>
          ))}

          <Separator className="my-2" />

          {user ? (
            <>
              {AUTH_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setOpen(false)}
                  className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm transition ${
                    isActive(item.to)
                      ? 'bg-accent font-medium text-accent-foreground'
                      : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {t(item.labelKey)}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  logout()
                  setOpen(false)
                }}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
              >
                <LogOut className="h-4 w-4" />
                {t('nav.logoutFull')}
              </button>
            </>
          ) : (
            <>
              <Link
                to="/auth/login"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
              >
                <LogIn className="h-4 w-4" />
                {t('nav.login')}
              </Link>
              <Link
                to="/auth/register"
                onClick={() => setOpen(false)}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground transition hover:bg-accent/50 hover:text-foreground"
              >
                <UserPlus className="h-4 w-4" />
                {t('nav.register')}
              </Link>
            </>
          )}
        </nav>
      </SheetContent>
    </Sheet>
  )
}
