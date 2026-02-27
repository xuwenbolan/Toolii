import type { PhotoStandard } from '@/services/idPhotoApi'

export const PHOTO_STANDARDS_FALLBACK: PhotoStandard[] = [
  {
    code: 'uk-passport',
    name: '英国护照',
    country: 'UK',
    width_mm: 35,
    height_mm: 45,
    dpi: 300,
    face_height_ratio: 0.68,
    top_margin_ratio: 0.12,
    layout_default_copies: 8,
  },
  {
    code: 'schengen-visa',
    name: '申根签证',
    country: 'EU',
    width_mm: 35,
    height_mm: 45,
    dpi: 300,
    face_height_ratio: 0.7,
    top_margin_ratio: 0.1,
    layout_default_copies: 8,
  },
  {
    code: 'cn-passport',
    name: '中国护照/签证',
    country: 'CN',
    width_mm: 33,
    height_mm: 48,
    dpi: 300,
    face_height_ratio: 0.64,
    top_margin_ratio: 0.12,
    layout_default_copies: 8,
  },
  {
    code: 'us-2x2',
    name: '美国 2x2 英寸',
    country: 'US',
    width_mm: 50.8,
    height_mm: 50.8,
    dpi: 300,
    face_height_ratio: 0.62,
    top_margin_ratio: 0.1,
    layout_default_copies: 4,
  },
]

