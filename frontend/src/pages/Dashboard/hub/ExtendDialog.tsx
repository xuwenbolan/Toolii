import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { extendFile, type UserFileItem } from '@/services/hubApi'

export function ExtendDialog({
  item,
  onClose,
  onDone,
}: {
  item: UserFileItem | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation('hub')
  const [days, setDays] = useState(3)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (item) {
      setDays(3)
      setError(null)
    }
  }, [item])

  const handleExtend = async () => {
    if (!item || pending) return
    setPending(true)
    setError(null)
    try {
      await extendFile(item.id, days)
      onDone()
      onClose()
    } catch {
      setError(t('extendFailed'))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('extendTitle')}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-2">
          {([1, 3, 5] as const).map((d) => (
            <Button
              key={d}
              size="sm"
              variant={days === d ? 'default' : 'outline'}
              onClick={() => setDays(d)}
            >
              {t('retentionDays', { days: d })}
            </Button>
          ))}
        </div>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            disabled={pending}
            onClick={() => { void handleExtend() }}
          >
            {t('extendConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
