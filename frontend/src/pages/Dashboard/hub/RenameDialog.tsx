import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { renameFile, type UserFileItem } from '@/services/hubApi'

export function RenameDialog({
  item,
  onClose,
  onDone,
}: {
  item: UserFileItem | null
  onClose: () => void
  onDone: () => void
}) {
  const { t } = useTranslation('hub')
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (item) {
      setName(item.file_name)
      setTimeout(() => inputRef.current?.select(), 50)
    }
  }, [item])

  const handleSubmit = async () => {
    if (!item || !name.trim() || pending) return
    setPending(true)
    try {
      await renameFile(item.id, name.trim())
      onDone()
      onClose()
    } catch {
      // silent
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={!!item} onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('renameTitle')}</DialogTitle>
        </DialogHeader>
        <Input
          ref={inputRef}
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void handleSubmit() }}
          placeholder={t('renamePlaceholder')}
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button
            size="sm"
            disabled={!name.trim() || pending}
            onClick={() => { void handleSubmit() }}
          >
            {t('renameConfirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
