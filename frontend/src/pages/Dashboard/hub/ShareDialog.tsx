import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Switch } from '@/components/ui/switch'
import { createShare, type ShareGroupResponse } from '@/services/hubApi'

export function ShareDialog({
  open,
  fileIds,
  onClose,
  onShared,
}: {
  open: boolean
  fileIds: number[]
  onClose: () => void
  onShared: () => void
}) {
  const { t } = useTranslation('hub')
  const [useCode, setUseCode] = useState(false)
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<ShareGroupResponse | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    if (pending || fileIds.length === 0) return
    setPending(true)
    try {
      const res = await createShare({ fileIds, useExtractCode: useCode })
      setResult(res)
      onShared()
    } catch {
      // silent
    } finally {
      setPending(false)
    }
  }

  const handleCopy = async () => {
    if (!result) return
    const url = `${window.location.origin}${result.share_url}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      onClose()
      // Reset state after close animation
      setTimeout(() => {
        setResult(null)
        setUseCode(false)
        setCopied(false)
      }, 150)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-sm">
        {result ? (
          <div className="space-y-3">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Link2 className="h-4 w-4" />
                {t('shareResult')}
              </DialogTitle>
            </DialogHeader>
            <div className="flex items-center gap-2 rounded-lg border bg-muted/30 px-3 py-2">
              <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
                {`${window.location.origin}${result.share_url}`}
              </span>
              <Button
                size="sm"
                variant="outline"
                className="h-7 shrink-0 px-2 text-xs"
                onClick={() => { void handleCopy() }}
              >
                {copied ? <Check className="mr-1 h-3 w-3" /> : <Copy className="mr-1 h-3 w-3" />}
                {copied ? t('copied') : t('copyLink')}
              </Button>
            </div>
            {result.extract_code && (
              <p className="text-xs text-muted-foreground">
                {t('extractCode', { code: result.extract_code })}
              </p>
            )}
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>{t('shareTitle')}</DialogTitle>
              <DialogDescription>{t('shareDesc')}</DialogDescription>
            </DialogHeader>
            <div className="flex items-center justify-between">
              <label className="text-sm" htmlFor="share-code-switch">
                {t('shareExtractCode')}
              </label>
              <Switch
                id="share-code-switch"
                checked={useCode}
                onCheckedChange={setUseCode}
              />
            </div>
            <DialogFooter>
              <Button
                className="w-full"
                disabled={pending}
                onClick={() => { void handleCreate() }}
              >
                {pending ? (
                  <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Link2 className="mr-1.5 h-3.5 w-3.5" />
                )}
                {t('shareCreate')}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}
