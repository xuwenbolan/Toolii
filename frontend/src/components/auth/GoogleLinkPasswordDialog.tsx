import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { getTranslatedApiError } from '@/lib/apiErrors'

type Props = {
  open: boolean
  onConfirm: (password: string) => Promise<void>
  onCancel: () => void
}

export function GoogleLinkPasswordDialog({ open, onConfirm, onCancel }: Props) {
  const { t } = useTranslation('auth')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!password) return
    setLoading(true)
    setError(null)
    try {
      await onConfirm(password)
    } catch (err: unknown) {
      setError(getTranslatedApiError(err, t('googleLink.wrongPassword')))
    } finally {
      setLoading(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('googleLink.title')}</DialogTitle>
          <DialogDescription>
            {t('googleLink.description')}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="link-password">{t('password')}</Label>
            <Input
              id="link-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onCancel}>
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={loading || !password}>
              {loading ? t('googleLink.verifying') : t('googleLink.confirm')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
