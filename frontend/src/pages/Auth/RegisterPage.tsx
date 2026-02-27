import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SEOHead } from '@/components/common/SEOHead'
import { RegisterForm } from '@/components/auth/RegisterForm'

export function RegisterPage() {
  const { t } = useTranslation('auth')

  return (
    <>
      <SEOHead title={t('register')} noindex />
      <Card>
      <CardHeader>
        <CardTitle>{t('register')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <RegisterForm />
        <p className="text-center text-sm text-muted-foreground">
          {t('registerPage.hasAccount')}{' '}
          <Link className="text-foreground underline underline-offset-4" to="/auth/login">
            {t('registerPage.goLogin')}
          </Link>
        </p>
      </CardContent>
    </Card>
    </>
  )
}
