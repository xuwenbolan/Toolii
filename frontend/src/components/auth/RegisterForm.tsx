import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { registerWithEmail } from '@/services/authApi'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type RegisterValues = { email: string; password: string }

export function RegisterForm() {
  const { t } = useTranslation('auth')
  const navigate = useNavigate()
  const [error, setError] = useState<string | null>(null)

  const registerSchema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .min(1, t('registerForm.emailRequired'))
          .email(t('registerForm.emailInvalid')),
        password: z
          .string()
          .min(8, t('registerForm.passwordMin'))
          .max(128, t('registerForm.passwordMax')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterValues>({ resolver: zodResolver(registerSchema) })

  const onSubmit = async (values: RegisterValues) => {
    setError(null)
    try {
      await registerWithEmail(values.email, values.password)
      navigate('/dashboard', { replace: true })
    } catch {
      setError(t('registerForm.registerFailed'))
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
        <Label htmlFor="password">{t('password')}</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register('password')}
        />
        {errors.password ? (
          <p className="text-sm text-destructive">{errors.password.message}</p>
        ) : (
          <p className="text-xs text-muted-foreground">{t('registerForm.passwordHint')}</p>
        )}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <Button className="w-full" type="submit" disabled={isSubmitting}>
        {isSubmitting ? t('registerForm.registering') : t('register')}
      </Button>
    </form>
  )
}
