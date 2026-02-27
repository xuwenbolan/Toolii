import { useEffect } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

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

  useEffect(() => {
    void bootstrap()
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

  return (
    <div className="min-h-dvh bg-background text-foreground">
      <Header />
      <main className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
        <Outlet />
      </main>
      <Footer />
      <CookieBanner />
    </div>
  )
}
