import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { SEOHead } from '@/components/common/SEOHead'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { PasswordStrength } from '@/components/auth/PasswordStrength'
import { api } from '@/services/api'
import { getTranslatedApiError } from '@/lib/apiErrors'

type FormValues = { password: string; confirmPassword: string }

export function ResetPasswordPage() {
  const { t } = useTranslation('auth')
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token')
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const schema = useMemo(
    () =>
      z
        .object({
          password: z.string().min(8, t('resetPassword.passwordMin')).max(128),
          confirmPassword: z.string().min(1, t('resetPassword.confirmRequired')),
        })
        .refine((v) => v.password === v.confirmPassword, {
          message: t('resetPassword.mismatch'),
          path: ['confirmPassword'],
        }),
    [t],
  )

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) })

  const passwordValue = watch('password', '')

  if (!token) {
    return (
      <>
        <SEOHead title={t('resetPassword.title')} noindex />
        <Card className="mx-auto max-w-md">
          <CardHeader>
            <CardTitle>{t('resetPassword.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-destructive">{t('resetPassword.missingToken')}</p>
            <Link
              to="/auth/forgot-password"
              className="mt-3 inline-block text-sm text-foreground underline underline-offset-4"
            >
              {t('resetPassword.reapply')}
            </Link>
          </CardContent>
        </Card>
      </>
    )
  }

  const onSubmit = async (values: FormValues) => {
    setError(null)
    try {
      await api.post('/api/auth/reset-password', {
        token,
        password: values.password,
      })
      setSuccess(true)
    } catch (err: unknown) {
      setError(getTranslatedApiError(err, t('resetPassword.resetFailed')))
    }
  }

  return (
    <>
      <SEOHead title={t('resetPassword.title')} noindex />
      <Card>
        <CardHeader>
          <CardTitle>{t('resetPassword.title')}</CardTitle>
        </CardHeader>
      <CardContent>
        {success ? (
          <div className="space-y-3">
            <p className="text-success">
              {t('resetPassword.success')}
            </p>
            <Link
              to="/auth/login"
              className="inline-block text-sm text-foreground underline underline-offset-4"
            >
              {t('resetPassword.goLogin')}
            </Link>
          </div>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
            <div className="space-y-2">
              <Label htmlFor="password">{t('newPassword')}</Label>
              <PasswordInput
                id="password"
                autoComplete="new-password"
                {...register('password')}
              />
              {errors.password ? (
                <p className="text-sm text-destructive">{errors.password.message}</p>
              ) : (
                <PasswordStrength password={passwordValue} />
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirmPassword">{t('confirmPassword')}</Label>
              <PasswordInput
                id="confirmPassword"
                autoComplete="new-password"
                {...register('confirmPassword')}
              />
              {errors.confirmPassword ? (
                <p className="text-sm text-destructive">
                  {errors.confirmPassword.message}
                </p>
              ) : null}
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="w-full" type="submit" disabled={isSubmitting}>
              {isSubmitting ? t('resetPassword.resetting') : t('resetPassword.title')}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
    </>
  )
}
