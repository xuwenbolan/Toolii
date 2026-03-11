import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'

// Synchronous i18n init for test environment — no HTTP backend, inline resources.
await i18n.use(initReactI18next).init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['common'],
  defaultNS: 'common',
  resources: {
    en: {
      common: {
        'errors.fileTooLarge': 'File too large (max {{max}} MB)',
      },
    },
  },
  interpolation: {
    escapeValue: false,
  },
})
