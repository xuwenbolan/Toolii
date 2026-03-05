import { useState } from 'react'
import { Coins, Download, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { CreditConfirmDialog } from '@/components/credits/CreditConfirmDialog'
import { Button, type ButtonProps } from '@/components/ui/button'
import { useFileDownload } from '@/hooks/useFileDownload'
import { cn } from '@/lib/utils'
import type { FileResult } from '@/services/imageApi'
import { unlockDownload } from '@/services/imageApi'

type Props = {
  result: FileResult
  label?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
}

/**
 * Download button that handles credit-gated files.
 *
 * - If `result.requires_credit` is false, behaves like a normal download.
 * - If `result.requires_credit` is true, shows a credit confirmation dialog
 *   before unlocking and downloading the clean file.
 */
export function GatedDownloadButton({ result, label, variant, size, className }: Props) {
  const download = useFileDownload()
  const { t } = useTranslation(['common', 'credits'])
  const [loading, setLoading] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const resolvedLabel = label ?? t('common:actions.downloadResult')

  const handleFreeDownload = async () => {
    setLoading(true)
    try {
      await download(result.download_url)
    } finally {
      setLoading(false)
    }
  }

  const handlePaidDownload = async () => {
    setLoading(true)
    setConfirmOpen(false)
    try {
      const { download_url } = await unlockDownload(result.file_id)
      await download(download_url)
    } catch {
      // Error is handled by axios interceptor (shows toast/banner)
    } finally {
      setLoading(false)
    }
  }

  if (result.requires_credit) {
    return (
      <>
        <Button
          type="button"
          className={cn('group w-full', className)}
          variant={variant}
          size={size}
          disabled={loading}
          onClick={() => setConfirmOpen(true)}
        >
          {loading ? (
            <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
          ) : (
            <Coins className="mr-1.5 h-4 w-4" />
          )}
          {resolvedLabel}
        </Button>
        <CreditConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          creditCost={result.credit_cost ?? 1}
          pending={loading}
          onConfirm={() => { void handlePaidDownload() }}
        />
      </>
    )
  }

  return (
    <Button
      type="button"
      className={cn('group w-full', className)}
      variant={variant}
      size={size}
      disabled={loading}
      onClick={() => { void handleFreeDownload() }}
    >
      {loading ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
      ) : (
        <Download className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:translate-y-0.5" />
      )}
      {resolvedLabel}
    </Button>
  )
}
