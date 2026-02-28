const SITE_URL =
  (import.meta.env.VITE_SITE_URL as string | undefined)?.replace(/\/+$/, '') ??
  'https://www.toolii.cc'

export function buildToolJsonLd(opts: {
  name: string
  description: string
  url: string
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: opts.name,
    description: opts.description,
    url: `${SITE_URL}${opts.url}`,
    applicationCategory: 'UtilitiesApplication',
    operatingSystem: 'Any',
    offers: {
      '@type': 'Offer',
      price: '0',
      priceCurrency: 'USD',
    },
    provider: {
      '@type': 'Organization',
      name: 'Toolii',
      url: SITE_URL,
    },
  }
}
