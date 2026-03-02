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

export function buildWebSiteJsonLd() {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Toolii',
    url: SITE_URL,
    description:
      'Free online tools for ID photo processing, image compression, format conversion, PDF tools, and text utilities.',
    publisher: {
      '@type': 'Organization',
      name: 'Toolii',
      url: SITE_URL,
      logo: { '@type': 'ImageObject', url: `${SITE_URL}/favicon.svg` },
    },
  }
}

export function buildBreadcrumbJsonLd(
  items: Array<{ name: string; path: string }>,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  }
}
