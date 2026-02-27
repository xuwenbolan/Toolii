import { useCallback, useEffect, useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'

import { SEOHead } from '@/components/common/SEOHead'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { api } from '@/services/api'
import { useAuthStore, type AuthUser } from '@/stores/authStore'

// --- Profile form ---
type ProfileValues = { name?: string; email: string }

function ProfileSection() {
  const { t } = useTranslation('credits')
  const user = useAuthStore((s) => s.user)!
  const setUser = useAuthStore((s) => s.setUser)
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const profileSchema = useMemo(
    () =>
      z.object({
        name: z.string().max(100).optional(),
        email: z.string().email(t('settings.profile.emailInvalid')),
      }),
    [t],
  )

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user.name ?? '', email: user.email },
  })

  const onSubmit = async (values: ProfileValues) => {
    setMsg(null)
    setError(null)
    try {
      const res = await api.put<{ message: string; user: AuthUser }>(
        '/api/users/profile',
        { name: values.name || null, email: values.email },
      )
      setUser(res.data.user)
      setMsg(res.data.message)
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t('settings.profile.updateFailed')
      setError(detail)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.profile.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="name">{t('settings.profile.name')}</Label>
            <Input id="name" {...register('name')} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">{t('settings.profile.email')}</Label>
            <Input id="email" inputMode="email" {...register('email')} />
            {errors.email ? (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            ) : null}
            {!user.email_verified && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                {t('settings.profile.emailNotVerified')}
              </p>
            )}
          </div>
          {msg ? (
            <p className="text-sm text-green-700 dark:text-green-400">{msg}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('settings.profile.saving') : t('settings.profile.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// --- Password form ---
type PasswordValues = { currentPassword: string; newPassword: string; confirmPassword: string }

function PasswordSection() {
  const { t } = useTranslation('credits')
  const user = useAuthStore((s) => s.user)!
  const hasPassword = !!user.email
  const [msg, setMsg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const passwordSchema = useMemo(
    () =>
      z
        .object({
          currentPassword: z.string().min(1, t('settings.password.currentPasswordRequired')),
          newPassword: z.string().min(8, t('settings.password.newPasswordMin')).max(128),
          confirmPassword: z.string().min(1, t('settings.password.confirmPasswordRequired')),
        })
        .refine((v) => v.newPassword === v.confirmPassword, {
          message: t('settings.password.mismatch'),
          path: ['confirmPassword'],
        }),
    [t],
  )

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<PasswordValues>({ resolver: zodResolver(passwordSchema) })

  const onSubmit = async (values: PasswordValues) => {
    setMsg(null)
    setError(null)
    try {
      await api.put('/api/users/password', {
        current_password: values.currentPassword,
        new_password: values.newPassword,
      })
      setMsg(t('settings.password.success'))
      reset()
    } catch (err: unknown) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail ?? t('settings.password.failed')
      setError(detail)
    }
  }

  if (!hasPassword) return null

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.password.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={handleSubmit(onSubmit)}>
          <div className="space-y-2">
            <Label htmlFor="currentPassword">{t('settings.password.currentPassword')}</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              {...register('currentPassword')}
            />
            {errors.currentPassword ? (
              <p className="text-sm text-destructive">
                {errors.currentPassword.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="newPassword">{t('settings.password.newPassword')}</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              {...register('newPassword')}
            />
            {errors.newPassword ? (
              <p className="text-sm text-destructive">
                {errors.newPassword.message}
              </p>
            ) : null}
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">{t('settings.password.confirmPassword')}</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              {...register('confirmPassword')}
            />
            {errors.confirmPassword ? (
              <p className="text-sm text-destructive">
                {errors.confirmPassword.message}
              </p>
            ) : null}
          </div>
          {msg ? (
            <p className="text-sm text-green-700 dark:text-green-400">{msg}</p>
          ) : null}
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? t('settings.password.changing') : t('settings.password.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}

// --- Security section ---
function SecuritySection() {
  const { t } = useTranslation('credits')
  const [logoutAllMsg, setLogoutAllMsg] = useState<string | null>(null)
  const [logoutAllLoading, setLogoutAllLoading] = useState(false)

  const handleLogoutAll = async () => {
    setLogoutAllLoading(true)
    try {
      await api.post('/api/auth/logout-all')
      setLogoutAllMsg(t('settings.security.logoutAllSuccess'))
    } catch {
      setLogoutAllMsg(t('settings.security.logoutAllFailed'))
    } finally {
      setLogoutAllLoading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.security.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <p className="text-sm text-muted-foreground">
            {t('settings.security.logoutAllDescription')}
          </p>
          <Button
            variant="outline"
            className="mt-2"
            onClick={handleLogoutAll}
            disabled={logoutAllLoading}
          >
            {logoutAllLoading ? t('settings.security.processing') : t('settings.security.logoutAll')}
          </Button>
          {logoutAllMsg ? (
            <p className="mt-2 text-sm text-muted-foreground">{logoutAllMsg}</p>
          ) : null}
        </div>
      </CardContent>
    </Card>
  )
}

// --- Delete account section ---
function DeleteAccountSection() {
  const { t } = useTranslation('credits')
  const user = useAuthStore((s) => s.user)!
  const clear = useAuthStore((s) => s.clear)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)
  const hasPassword = !!user.email

  const handleDelete = async () => {
    setDeleting(true)
    setDeleteError(null)
    try {
      await api.delete('/api/users/me', {
        data: { password: deletePassword || null },
      })
      clear()
      window.location.href = '/'
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message ?? t('settings.deleteAccount.deleteFailed')
      setDeleteError(msg)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <Card className="border-destructive/50">
      <CardHeader>
        <CardTitle className="text-destructive">{t('settings.deleteAccount.title')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          {t('settings.deleteAccount.description')}
        </p>
        {!confirmOpen ? (
          <Button
            variant="destructive"
            onClick={() => setConfirmOpen(true)}
          >
            {t('settings.deleteAccount.button')}
          </Button>
        ) : (
          <div className="space-y-3 rounded-md border border-destructive/30 p-4">
            <p className="text-sm font-medium">{t('settings.deleteAccount.confirmTitle')}</p>
            {hasPassword && (
              <div className="space-y-1">
                <Label htmlFor="delete-password">{t('settings.deleteAccount.passwordLabel')}</Label>
                <Input
                  id="delete-password"
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                />
              </div>
            )}
            {deleteError ? (
              <p className="text-sm text-destructive">{deleteError}</p>
            ) : null}
            <div className="flex gap-2">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={deleting}
              >
                {deleting ? t('settings.deleteAccount.deleting') : t('settings.deleteAccount.confirm')}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setConfirmOpen(false)
                  setDeletePassword('')
                  setDeleteError(null)
                }}
              >
                {t('settings.deleteAccount.cancel')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Sessions section ---
type Session = {
  id: number
  ip: string | null
  user_agent: string | null
  refresh_jti: string | null
  created_at: string | null
}

function SessionsSection() {
  const { t } = useTranslation('credits')
  const [sessions, setSessions] = useState<Session[]>([])
  const [loading, setLoading] = useState(true)
  const [revoking, setRevoking] = useState<number | null>(null)

  const loadSessions = useCallback(async () => {
    try {
      const res = await api.get<{ sessions: Session[] }>('/api/users/sessions')
      setSessions(res.data.sessions)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadSessions()
  }, [loadSessions])

  const handleRevoke = async (sessionId: number) => {
    setRevoking(sessionId)
    try {
      await api.delete(`/api/users/sessions/${sessionId}`)
      setSessions((prev) => prev.filter((s) => s.id !== sessionId))
    } catch {
      // ignore
    } finally {
      setRevoking(null)
    }
  }

  const formatDate = (iso: string | null) => {
    if (!iso) return '-'
    return new Date(iso).toLocaleString('zh-CN')
  }

  const shortenUA = (ua: string | null) => {
    if (!ua) return '-'
    if (ua.length > 60) return ua.slice(0, 57) + '...'
    return ua
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('settings.sessions.title')}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">{t('settings.sessions.loading')}</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t('settings.sessions.empty')}</p>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => (
              <div
                key={s.id}
                className="flex items-start justify-between rounded-md border p-3 text-sm"
              >
                <div className="space-y-0.5">
                  <p className="font-medium">{s.ip ?? t('settings.sessions.unknownIP')}</p>
                  <p className="text-xs text-muted-foreground">
                    {shortenUA(s.user_agent)}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(s.created_at)}
                  </p>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRevoke(s.id)}
                  disabled={revoking === s.id}
                >
                  {revoking === s.id ? t('settings.sessions.revoking') : t('settings.sessions.revoke')}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- Main settings page ---
export function SettingsPage() {
  const { t } = useTranslation('credits')

  return (
    <>
      <SEOHead title={t('settings.seoTitle')} noindex />
      <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('settings.pageTitle')}</h1>
      <ProfileSection />
      <Separator />
      <PasswordSection />
      <Separator />
      <SessionsSection />
      <Separator />
      <SecuritySection />
      <Separator />
      <DeleteAccountSection />
    </div>
    </>
  )
}
