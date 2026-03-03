import { Suspense, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Outlet, useLocation } from 'react-router-dom'

import { EmailVerificationBanner } from '@/components/auth/EmailVerificationBanner'
import { CookieBanner } from '@/components/consent/CookieBanner'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { initAnalytics, trackPageView } from '@/lib/analytics'
import { useConsentStore } from '@/stores/consentStore'
import { useToolStore } from '@/stores/toolStore'

const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined

export function RootLayout() {
  const { bootstrap } = useAuth()
  const location = useLocation()
  const { t } = useTranslation('common')
  const cookieConsent = useConsentStore((s) => s.cookieConsent)
  const [isBootstrapping, setIsBootstrapping] = useState(true)
  const isToolWorkspaceRoute =
    location.pathname === '/id-photo' ||
    location.pathname === '/facemap' ||
    location.pathname.startsWith('/image-tools/') ||
    location.pathname === '/pdf-tools' ||
    location.pathname.startsWith('/pdf-tools/') ||
    location.pathname === '/text-tools/word-counter'

  const fetchToolConfigs = useToolStore((s) => s.fetchTools)

  useEffect(() => {
    bootstrap().finally(() => setIsBootstrapping(false))
    fetchToolConfigs()
  }, [bootstrap, fetchToolConfigs])

  useEffect(() => {
    if (cookieConsent === 'rejected') return
    initAnalytics(gaMeasurementId)
  }, [cookieConsent])

  useEffect(() => {
    if (cookieConsent === 'rejected') return
    const path = `${location.pathname}${location.search}${location.hash}`
    trackPageView(path)
  }, [cookieConsent, location.hash, location.pathname, location.search])

  if (isBootstrapping) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <div className="text-muted-foreground text-sm" role="status" aria-live="polite">
          {t('actions.processingWait')}
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Header />
      <EmailVerificationBanner />
      <main
        className={[
          'mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8',
          isToolWorkspaceRoute ? 'pb-28 lg:pb-32' : null,
        ].filter(Boolean).join(' ')}
      >
        <Suspense fallback={<div className="text-sm text-muted-foreground">{t('actions.processingWait')}</div>}>
          <div
            key={location.pathname}
            className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1 motion-safe:duration-200 motion-reduce:animate-none"
          >
            <Outlet />
          </div>
        </Suspense>
      </main>
      {isToolWorkspaceRoute ? null : <Footer />}
      <CookieBanner />
    </div>
  )
}
