type GtagFn = (...args: unknown[]) => void

declare global {
  interface Window {
    dataLayer?: unknown[]
    gtag?: GtagFn
  }
}

let initializedMeasurementId: string | null = null

function getMeasurementId(rawId?: string): string | null {
  const id = rawId?.trim()
  if (!id) return null
  return id
}

function injectGtagScript(measurementId: string): void {
  if (typeof document === 'undefined') return
  const existing = document.querySelector<HTMLScriptElement>(
    `script[data-ga-id="${measurementId}"]`,
  )
  if (existing) return

  const script = document.createElement('script')
  script.async = true
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`
  script.setAttribute('data-ga-id', measurementId)
  document.head.appendChild(script)
}

export function initAnalytics(rawMeasurementId?: string): boolean {
  if (typeof window === 'undefined') return false
  const measurementId = getMeasurementId(rawMeasurementId)
  if (!measurementId) return false
  if (initializedMeasurementId === measurementId) return true

  injectGtagScript(measurementId)

  window.dataLayer = window.dataLayer ?? []
  window.gtag =
    window.gtag ??
    function gtag(...args: unknown[]) {
      window.dataLayer?.push(args)
    }

  window.gtag('js', new Date())
  window.gtag('config', measurementId, { send_page_view: false, anonymize_ip: true })
  initializedMeasurementId = measurementId
  return true
}

export function trackPageView(path: string, title?: string): void {
  if (typeof window === 'undefined') return
  if (!initializedMeasurementId) return
  if (!window.gtag) return

  window.gtag('event', 'page_view', {
    page_title: title ?? document.title,
    page_path: path,
  })
}
