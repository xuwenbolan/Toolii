import type { PhotoStandard } from '@/services/idPhotoApi'

// Map standard code to idPhoto namespace translation key
export const STANDARD_I18N_MAP: Record<string, string> = {
  'uk-passport': 'standards.ukPassport',
  'schengen-visa': 'standards.schengenVisa',
  'cn-passport': 'standards.cnPassport',
  'us-2x2': 'standards.us2x2',
}

export const PHOTO_STANDARDS_FALLBACK: PhotoStandard[] = [
  {
    code: 'uk-passport',
    name: 'UK Passport',
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
    name: 'Schengen Visa',
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
    name: 'Chinese Passport/Visa',
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
    name: 'US 2x2 Inch',
    country: 'US',
    width_mm: 50.8,
    height_mm: 50.8,
    dpi: 300,
    face_height_ratio: 0.62,
    top_margin_ratio: 0.1,
    layout_default_copies: 4,
  },
]

