import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, Copy, Link2, Loader2 } from 'lucide-react'

import { Button, type ButtonProps } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { createResultShare } from '@/services/resultShareApi'

type Props = {
  originalFile: File
  resultFileId: string
  shareType: string
  resultJson?: string
  /** Result file size in bytes — used to build metadata for the share page */
  resultSize?: number
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
}

export function ShareResultButton({
  originalFile,
  resultFileId,
  shareType,
  resultJson,
  resultSize,
  variant = 'outline',
  size,
  className,
}: Props) {
  const { t, i18n } = useTranslation('resultShare')
  const [pending, setPending] = useState(false)
  const [shareUrl, setShareUrl] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(false)

  const handleCreate = useCallback(async () => {
    if (pending) return
    setPending(true)
    setError(false)
    try {
      const locale = i18n.language.startsWith('zh') ? 'zh-CN' : 'en'
      const meta = resultJson ?? JSON.stringify({
        original_filename: originalFile.name,
        original_size: originalFile.size,
        ...(resultSize != null ? { result_size: resultSize } : {}),
      })
      const result = await createResultShare(
        originalFile,
        meta,
        shareType,
        locale,
        resultFileId,
      )
      const url = result.share_url
      setShareUrl(url)
      await navigator.clipboard.writeText(url)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError(true)
    } finally {
      setPending(false)
    }
  }, [pending, originalFile, resultJson, resultSize, shareType, resultFileId, i18n.language])

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
            {t('shareButton.copied')}
          </>
        ) : (
          <>
            <Copy className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:scale-110" aria-hidden="true" />
            {t('shareButton.copyLink')}
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
          {t('shareButton.creating')}
        </>
      ) : (
        <>
          <Link2 className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:rotate-12" aria-hidden="true" />
          {error ? t('shareButton.retryError') : t('shareButton.share')}
        </>
      )}
    </Button>
  )
}
