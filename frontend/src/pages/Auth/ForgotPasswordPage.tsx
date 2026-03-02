import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SEOHead } from '@/components/common/SEOHead'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { api } from '@/services/api'
import { getTranslatedApiError } from '@/lib/apiErrors'

type FormValues = { email: string }

export function ForgotPasswordPage() {
  const { t } = useTranslation('auth')
  const [submitted, setSubmitted] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .min(1, t('forgotPassword.emailRequired'))
          .email(t('forgotPassword.emailInvalid')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const onSubmit = async (values: FormValues) => {
    setError(null)
    try {
      await api.post('/api/auth/forgot-password', { email: values.email })
      setSubmitted(true)
    } catch (err: unknown) {
      setError(getTranslatedApiError(err, t('forgotPassword.requestFailed')))
    }
  }

  return (
    <>
      <SEOHead title={t('forgotPassword.title')} noindex />
      <Card>
      <CardHeader>
        <CardTitle>{t('forgotPassword.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {submitted ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              {t('forgotPassword.successMessage')}
            </p>
            <Link
              to="/auth/login"
              className="inline-block text-sm text-foreground underline underline-offset-4"
            >
              {t('forgotPassword.backToLogin')}
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <p className="text-sm text-muted-foreground">
              {t('forgotPassword.description')}
            </p>
            <div className="space-y-2">
              <Label htmlFor="email">{t('email')}</Label>
              <Input
                id="email"
                inputMode="email"
                autoComplete="email"
                placeholder="name@example.com"
                {...register('email')}
              />
              {errors.email ? (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('forgotPassword.sending') : t('forgotPassword.sendLink')}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link
                to="/auth/login"
                className="text-foreground underline underline-offset-4"
              >
                {t('forgotPassword.backToLogin')}
              </Link>
            </p>
          </form>
        )}
      </CardContent>
    </Card>
    </>
  )
}
