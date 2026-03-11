import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { useAuth } from '@/hooks/useAuth'
import { cn } from '@/lib/utils'
import { api } from '@/services/api'

type ShareFileResponse = {
  token: string
  share_url: string
}

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
      const res = await api.post<ShareFileResponse>(`/api/hub/share-file/${fileId}`)
      const url = `${window.location.origin}${res.data.share_url}`
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
            <Check className="mr-1.5 h-4 w-4 motion-safe:animate-[fade-in_0.2s_ease-out]" aria-hidden="true" />
            {t('share.copied')}
          </>
        ) : (
          <>
            <Copy className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:scale-110" aria-hidden="true" />
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
          <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
          {t('share.creating')}
        </>
      ) : (
        <>
          <Link2 className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:rotate-12" aria-hidden="true" />
          {error ? t('share.retryError') : t('share.button')}
        </>
      )}
    </Button>
  )
}
