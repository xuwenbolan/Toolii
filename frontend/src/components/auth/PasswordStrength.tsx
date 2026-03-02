import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type Level = 0 | 1 | 2 | 3

function getStrength(password: string): Level {
  if (!password) return 0
  let score = 0
  if (password.length >= 8) score++
  if (password.length >= 12) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/\d/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 1) return 1
  if (score <= 3) return 2
  return 3
}

const barColors: Record<Level, string> = {
  0: 'bg-muted',
  1: 'bg-destructive',
  2: 'bg-warning',
  3: 'bg-success',
}

const labelKeys: Record<Exclude<Level, 0>, string> = {
  1: 'registerForm.passwordStrengthWeak',
  2: 'registerForm.passwordStrengthMedium',
  3: 'registerForm.passwordStrengthStrong',
}

export function PasswordStrength({ password }: { password: string }) {
  const { t } = useTranslation('auth')
  const level = getStrength(password)

  if (!password) return null

  return (
    <div className="space-y-1">
      <div className="flex gap-1">
        {([1, 2, 3] as const).map((i) => (
          <div
            key={i}
            className={cn(
              'h-1 flex-1 rounded-full transition-colors',
              level >= i ? barColors[level] : 'bg-muted',
            )}
          />
        ))}
      </div>
      <p
        className={cn(
          'text-xs',
          level === 1 && 'text-destructive',
          level === 2 && 'text-warning',
          level === 3 && 'text-success',
        )}
      >
        {t(labelKeys[level as Exclude<Level, 0>])}
      </p>
    </div>
  )
}
