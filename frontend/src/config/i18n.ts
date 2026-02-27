import i18n from 'i18next'
import HttpBackend from 'i18next-http-backend'
import { initReactI18next } from 'react-i18next'

void i18n
  .use(HttpBackend)
  .use(initReactI18next)
  .init({
    lng: 'zh-CN',
    fallbackLng: 'zh-CN',
    supportedLngs: ['zh-CN', 'zh'],
    load: 'currentOnly',
    ns: ['common', 'tools', 'idPhoto', 'credits', 'auth', 'legal', 'consent'],
    defaultNS: 'common',
    debug: import.meta.env.DEV,
    backend: {
      loadPath: '/locales/{{lng}}/{{ns}}.json',
    },
    interpolation: {
      escapeValue: false,
    },
  })

export default i18n
