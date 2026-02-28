export type FormatId = 'jpg' | 'png' | 'webp'

export type FormatPair = {
  from: FormatId
  to: FormatId
  slug: string
  i18nKey: string
  apiFormat: string
  acceptMime: string
}

export const FORMAT_PAIRS: FormatPair[] = [
  { from: 'jpg', to: 'png',  slug: 'jpg-to-png',  i18nKey: 'jpgToPng',  apiFormat: 'png',  acceptMime: 'image/jpeg' },
  { from: 'jpg', to: 'webp', slug: 'jpg-to-webp', i18nKey: 'jpgToWebp', apiFormat: 'webp', acceptMime: 'image/jpeg' },
  { from: 'png', to: 'jpg',  slug: 'png-to-jpg',  i18nKey: 'pngToJpg',  apiFormat: 'jpeg', acceptMime: 'image/png' },
  { from: 'png', to: 'webp', slug: 'png-to-webp', i18nKey: 'pngToWebp', apiFormat: 'webp', acceptMime: 'image/png' },
  { from: 'webp', to: 'jpg', slug: 'webp-to-jpg', i18nKey: 'webpToJpg', apiFormat: 'jpeg', acceptMime: 'image/webp' },
  { from: 'webp', to: 'png', slug: 'webp-to-png', i18nKey: 'webpToPng', apiFormat: 'png',  acceptMime: 'image/webp' },
]
