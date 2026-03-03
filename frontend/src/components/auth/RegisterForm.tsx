import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { registerWithEmail } from '@/services/authApi'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { PasswordInput } from '@/components/ui/password-input'
import { Label } from '@/components/ui/label'
import { PasswordStrength } from '@/components/auth/PasswordStrength'

type RegisterValues = { name?: string; email: string; password: string; confirmPassword: string }

export function RegisterForm() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const registerSchema = useMemo(
    () =>
      z
        .object({
          name: z.string().max(100).optional(),
          email: z
            .string()
            .min(1, t('registerForm.emailRequired'))
            .email(t('registerForm.emailInvalid')),
          password: z
            .string()
            .min(8, t('registerForm.passwordMin'))
            .max(128, t('registerForm.passwordMax')),
          confirmPassword: z.string().min(1, t('registerForm.confirmRequired')),
        })
        .refine((v) => v.password === v.confirmPassword, {
          message: t('registerForm.mismatch'),
          path: ['confirmPassword'],
        }),
    [t],
  )

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  const passwordValue = watch('password', '')

  const onSubmit = async (values: RegisterValues) => {
    setError(null)
    try {
      await registerWithEmail(values.email, values.password, values.name || undefined)
      navigate('/dashboard', { replace: true, state: { justRegistered: true } })
    } catch (err: unknown) {
      setError(getTranslatedApiError(err, t('registerForm.registerFailed')))
    }
  }

  return (
    <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
      <div className="space-y-2">
        <Label htmlFor="name">
          {t('name')}{' '}
          <span className="text-muted-foreground">({t('registerForm.nameOptional')})</span>
        </Label>
        <Input
          id="name"
          autoComplete="name"
          enterKeyHint="next"
          {...register('name')}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email">{t('email')}</Label>
        <Input
          id="email"
          inputMode="email"
          autoComplete="email"
          enterKeyHint="next"
          placeholder="name@example.com"
          {...register('email')}
        />
        {errors.email ? (
          <p className="text-sm text-destructive">{errors.email.message}</p>
        ) : null}
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">{t('password')}</Label>
        <PasswordInput
          id="password"
          autoComplete="new-password"
          enterKeyHint="next"
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
          enterKeyHint="go"
          {...register('confirmPassword')}
        />
        {errors.confirmPassword ? (
          <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('registerForm.registering') : t('register')}
      </Button>
    </form>
  )
}
