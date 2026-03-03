import { useCallback, useState } from 'react'
import { Check, Copy, Link2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareUrl: string
  title?: string
  expiryNotice?: string
  copyLabel?: string
  copiedLabel?: string
}

export function ShareLinkDialog({
  open,
  onOpenChange,
  shareUrl,
  title = 'Share Link',
  expiryNotice = 'Link valid for 7 days',
  copyLabel = 'Copy Link',
  copiedLabel = 'Link copied!',
}: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Clipboard not available
    }
  }, [shareUrl])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-sm p-4 sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 shrink-0" />
            {title}
          </DialogTitle>
          <DialogDescription>{expiryNotice}</DialogDescription>
        </DialogHeader>

        <div className="space-y-3 overflow-hidden">
          <div className="flex items-center gap-2 min-w-0">
            <div className="min-w-0 flex-1 overflow-hidden rounded-md border bg-muted/50 px-3 py-2">
              <p className="truncate text-sm text-muted-foreground">{shareUrl}</p>
            </div>
            <Button
              type="button"
              size="icon"
              variant="outline"
              className="shrink-0"
              onClick={() => void handleCopy()}
            >
              {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>

          <Button
            type="button"
            className="w-full"
            onClick={() => void handleCopy()}
          >
            {copied ? (
              <>
                <Check className="mr-2 h-4 w-4" />
                {copiedLabel}
              </>
            ) : (
              <>
                <Copy className="mr-2 h-4 w-4" />
                {copyLabel}
              </>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
