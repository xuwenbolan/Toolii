import { useEffect, useRef } from 'react'
import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'

type JsonLdObject = Record<string, unknown>

type SEOHeadProps = {
  title: string
  description?: string
  keywords?: string
  canonicalPath?: string
  noindex?: boolean
  jsonLd?: JsonLdObject | JsonLdObject[]
  ogImage?: string
}

const SITE_NAME = 'Toolii'
const DEFAULT_SITE_URL = 'https://www.toolii.cc'

function getSiteUrl(): string {
  return (
    (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '') ??
    DEFAULT_SITE_URL
  )
}

function buildCanonicalUrl(canonicalPath?: string): string | undefined {
  if (!canonicalPath) return undefined
  const siteUrl = getSiteUrl()
  const normalizedPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`
  if (siteUrl) return `${siteUrl}${normalizedPath}`
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}${normalizedPath}`
}

function useJsonLd(jsonLd?: JsonLdObject | JsonLdObject[]) {
  const elsRef = useRef<HTMLScriptElement[]>([])

  useEffect(() => {
    if (!jsonLd) return
    const items = Array.isArray(jsonLd) ? jsonLd : [jsonLd]
    const scripts: HTMLScriptElement[] = []
    for (const item of items) {
      const script = document.createElement('script')
      script.type = 'application/ld+json'
      script.textContent = JSON.stringify(item)
      document.head.appendChild(script)
      scripts.push(script)
    }
    elsRef.current = scripts
    return () => {
      for (const s of scripts) s.remove()
      elsRef.current = []
    }
  }, [JSON.stringify(jsonLd)]) // eslint-disable-line react-hooks/exhaustive-deps
}

export function SEOHead({
  title,
  description,
  keywords,
  canonicalPath,
  noindex = false,
  jsonLd,
  ogImage,
}: SEOHeadProps) {
  const { t } = useTranslation('common')
  const resolvedDescription = description ?? t('seo.defaultDescription')
  const fullTitle = `${title} | ${SITE_NAME}`
  const canonicalUrl = buildCanonicalUrl(canonicalPath)
  const resolvedOgImage = ogImage ?? `${getSiteUrl()}/og-image.png`

  useJsonLd(jsonLd)

  return (
    <Helmet prioritizeSeoTags>
      <title>{fullTitle}</title>
      <meta name="description" content={resolvedDescription} />
      {keywords ? <meta name="keywords" content={keywords} /> : null}
      {noindex ? <meta name="robots" content="noindex,nofollow" /> : <meta name="robots" content="index,follow" />}
      <meta property="og:type" content="website" />
      <meta property="og:site_name" content={SITE_NAME} />
      <meta property="og:title" content={fullTitle} />
      <meta property="og:description" content={resolvedDescription} />
      {canonicalUrl ? <meta property="og:url" content={canonicalUrl} /> : null}
      <meta property="og:image" content={resolvedOgImage} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      <meta name="twitter:image" content={resolvedOgImage} />
      {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
      {canonicalUrl ? <link rel="alternate" hrefLang="en" href={canonicalUrl} /> : null}
      {canonicalUrl ? <link rel="alternate" hrefLang="zh-Hans" href={canonicalUrl} /> : null}
      {canonicalUrl ? <link rel="alternate" hrefLang="x-default" href={canonicalUrl} /> : null}
    </Helmet>
  )
}
