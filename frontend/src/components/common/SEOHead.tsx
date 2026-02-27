import { Helmet } from 'react-helmet-async'
import { useTranslation } from 'react-i18next'

type SEOHeadProps = {
  title: string
  description?: string
  keywords?: string
  canonicalPath?: string
  noindex?: boolean
}

const SITE_NAME = 'Toolii'

function buildCanonicalUrl(canonicalPath?: string): string | undefined {
  if (!canonicalPath) return undefined
  const siteUrl = (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '')
  const normalizedPath = canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`
  if (siteUrl) return `${siteUrl}${normalizedPath}`
  if (typeof window === 'undefined') return undefined
  return `${window.location.origin}${normalizedPath}`
}

export function SEOHead({
  title,
  description,
  keywords,
  canonicalPath,
  noindex = false,
}: SEOHeadProps) {
  const { t } = useTranslation('common')
  const resolvedDescription = description ?? t('seo.defaultDescription')
  const fullTitle = `${title} | ${SITE_NAME}`
  const canonicalUrl = buildCanonicalUrl(canonicalPath)

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
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:title" content={fullTitle} />
      <meta name="twitter:description" content={resolvedDescription} />
      {canonicalUrl ? <link rel="canonical" href={canonicalUrl} /> : null}
    </Helmet>
  )
}
