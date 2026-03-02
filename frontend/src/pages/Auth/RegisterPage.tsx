import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { SEOHead } from '@/components/common/SEOHead'
import { RegisterForm } from '@/components/auth/RegisterForm'
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton'

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
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            {t('or')}
          </span>
        </div>
        <GoogleOAuthButton />
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
