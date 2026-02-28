import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { createTransferFromResult } from '@/services/transferApi'

type Props = {
  fileId: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
}

export function ShareTransferButton({ fileId, variant = 'outline', size, className }: Props) {
  const { t } = useTranslation('transfer')
  const { user } = useAuth()
  const [pending, setPending] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)

  const handleCreate = useCallback(async () => {
    if (!fileId || pending) return
    setPending(true)
    setError(false)
    try {
      const result = await createTransferFromResult(fileId)
      const url = `${window.location.origin}${result.transfer_path}`
      setShareUrl(url)
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }, [fileId, pending])

  const handleCopy = useCallback(async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // ignore
    }
  }, [shareUrl])

  if (!user) {
    return null
  }

  // Already created - show copy button
  if (shareUrl) {
    return (
      <Button
        type="button"
        variant={variant}
        size={size}
        className={cn('group w-full', className)}
        onClick={() => { void handleCopy() }}
      >
        {copied ? (
          <>
            <Check className="mr-1.5 h-4 w-4 motion-safe:animate-[fade-in_0.2s_ease-out]" />
            {t('share.copied')}
          </>
        ) : (
          <>
            <Copy className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:scale-110" />
            {t('share.copyLink')}
          </>
        )}
      </Button>
    )
  }

  return (
    <Button
      type="button"
      variant={variant}
      size={size}
      className={cn('group w-full', className)}
      disabled={pending}
      onClick={() => { void handleCreate() }}
    >
      {pending ? (
        <>
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          {t('share.creating')}
        </>
      ) : (
        <>
          <Link2 className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:rotate-12" />
          {error ? t('share.retryError') : t('share.button')}
        </>
      )}
    </Button>
  )
}
