import { useMemo, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { loginWithEmail } from '@/services/authApi'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { sanitizeRedirect } from '@/lib/authRedirect'

type LoginValues = { email: string; password: string }

export function LoginForm() {
  const { t } = useTranslation('auth')
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const redirectTo = useMemo(() => sanitizeRedirect(params.get('redirect')), [params])

  const loginSchema = useMemo(
    () =>
      z.object({
        email: z.string().min(1, t('loginForm.emailRequired')).email(t('loginForm.emailInvalid')),
        password: z.string().min(1, t('loginForm.passwordRequired')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginValues>({ resolver: zodResolver(loginSchema) })

  const onSubmit = async (values: LoginValues) => {
    setError(null)
    try {
      await loginWithEmail(values.email, values.password)
      navigate(redirectTo, { replace: true })
    } catch (err: unknown) {
      setError(getTranslatedApiError(err, t('loginForm.loginFailed')))
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
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
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">{t('password')}</Label>
          <Link
            to="/auth/forgot-password"
            className="text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            {t('loginForm.forgotPassword')}
          </Link>
        </div>
        <PasswordInput
          id="password"
          autoComplete="current-password"
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('loginForm.loggingIn') : t('login')}
      </Button>
    </form>
  )
}
