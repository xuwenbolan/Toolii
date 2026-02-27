import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import HttpBackend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'

void i18n
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'zh', 'en'],
    load: 'currentOnly',
    ns: ['common', 'tools', 'idPhoto', 'credits', 'auth', 'legal', 'consent'],
    defaultNS: 'common',
    debug: import.meta.env.DEV,
    detection: {
      order: ['localStorage', 'navigator'],
      lookupLocalStorage: 'i18n-lang',
      caches: ['localStorage'],
    },
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
