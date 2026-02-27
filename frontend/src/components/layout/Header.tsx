import { Link, NavLink } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/common/Logo'
import { LanguageSwitcher } from '@/components/layout/LanguageSwitcher'
import { MobileNav } from '@/components/layout/MobileNav'
import { useAuth } from '@/hooks/useAuth'

export function Header() {
  const { user, logout } = useAuth()
  const { t } = useTranslation('common')

  return (
    <header className="sticky top-0 z-50 border-b bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:px-6 lg:px-8">
        <MobileNav />
        <Link to="/">
          <Logo size={22} />
        </Link>
        <nav className="ml-auto hidden items-center gap-2 md:flex">
          {user ? (
            <>
              {user.is_admin && (
                <NavLink to="/admin">
                  <Button variant="ghost" size="sm">
                    {t('nav.admin', 'Admin')}
                  </Button>
                </NavLink>
              )}
              <NavLink to="/dashboard">
                <Button variant="ghost" size="sm">
                  {t('nav.dashboard')}
                </Button>
              </NavLink>
              <Button variant="outline" size="sm" onClick={logout}>
                {t('nav.logout')}
              </Button>
            </>
          ) : (
            <>
              <NavLink to="/auth/login">
                <Button variant="ghost" size="sm">
                  {t('nav.login')}
                </Button>
              </NavLink>
              <NavLink to="/auth/register">
                <Button size="sm">{t('nav.register')}</Button>
              </NavLink>
            </>
          )}
          <LanguageSwitcher />
        </nav>
      </div>
    </header>
  )
}
