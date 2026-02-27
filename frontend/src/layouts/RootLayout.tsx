import { useEffect, useState } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { EmailVerificationBanner } from '@/components/auth/EmailVerificationBanner'
import { CookieBanner } from '@/components/consent/CookieBanner'
import { Footer } from '@/components/layout/Footer'
import { Header } from '@/components/layout/Header'
import { useAuth } from '@/hooks/useAuth'
import { initAnalytics, trackPageView } from '@/lib/analytics'
import { useConsentStore } from '@/stores/consentStore'

const gaMeasurementId = import.meta.env.VITE_GA_MEASUREMENT_ID as string | undefined

export function RootLayout() {
  const { bootstrap } = useAuth()
  const location = useLocation()
  const cookieConsent = useConsentStore((s) => s.cookieConsent)
  const [isBootstrapping, setIsBootstrapping] = useState(true)

  useEffect(() => {
    bootstrap().finally(() => setIsBootstrapping(false))
  }, [bootstrap])

  useEffect(() => {
    if (cookieConsent !== 'accepted') return
    initAnalytics(gaMeasurementId)
  }, [cookieConsent])

  useEffect(() => {
    if (cookieConsent !== 'accepted') return
    const path = `${location.pathname}${location.search}${location.hash}`
    trackPageView(path)
  }, [cookieConsent, location.hash, location.pathname, location.search])

  if (isBootstrapping) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-background text-foreground">
        <div className="text-muted-foreground text-sm">Loading...</div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <Header />
      <EmailVerificationBanner />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
      <Footer />
      <CookieBanner />
    </div>
  )
}
