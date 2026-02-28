import { Link } from 'react-router-dom'
import { useTranslation } from 'react-i18next'

export function Footer() {
  const { t } = useTranslation('common')

  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-center gap-3 px-4 py-6 text-center text-xs text-muted-foreground sm:justify-between sm:px-6 sm:text-left lg:px-8">
        <p>&copy; {new Date().getFullYear()} Toolii</p>
        <div className="flex items-center gap-3">
          <Link className="inline-flex h-10 items-center transition hover:text-foreground" to="/legal/privacy">
            {t('footer.privacy')}
          </Link>
          <Link className="inline-flex h-10 items-center transition hover:text-foreground" to="/legal/terms">
            {t('footer.terms')}
          </Link>
          <a className="inline-flex h-10 items-center transition hover:text-foreground" href="mailto:contact@toolii.cc">
            {t('footer.contact')}
          </a>
        </div>
      </div>
    </footer>
  )
}
