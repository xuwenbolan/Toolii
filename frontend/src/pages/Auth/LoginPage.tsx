import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SEOHead } from '@/components/common/SEOHead'
import { LoginForm } from '@/components/auth/LoginForm'
import { GoogleOAuthButton } from '@/components/auth/GoogleOAuthButton'
import { Separator } from '@/components/ui/separator'

export function LoginPage() {
  const { t } = useTranslation('auth')

  return (
    <>
      <SEOHead title={t('login')} noindex />
      <Card>
      <CardHeader>
        <CardTitle>{t('login')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <LoginForm />
        <div className="relative">
          <Separator />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-xs text-muted-foreground">
            {t('or')}
          </span>
        </div>
        <GoogleOAuthButton />
        <p className="text-center text-sm text-muted-foreground">
          {t('loginPage.noAccount')}{' '}
          <Link className="text-foreground underline underline-offset-4" to="/auth/register">
            {t('loginPage.goRegister')}
          </Link>
        </p>
      </CardContent>
    </Card>
    </>
  )
}
