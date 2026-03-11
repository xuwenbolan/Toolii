import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button, type ButtonProps } from '@/components/ui/button'
import { useFileDownload } from '@/hooks/useFileDownload'
import { cn } from '@/lib/utils'

type Props = {
  url: string
  label?: string
  variant?: ButtonProps['variant']
  size?: ButtonProps['size']
  className?: string
}

export function DownloadButton({ url, label, variant, size, className }: Props) {
  const download = useFileDownload()
  const { t } = useTranslation('common')
  const [loading, setLoading] = useState(false)
  const resolvedLabel = label ?? t('actions.downloadResult')

  const handleClick = async () => {
    setLoading(true)
    try {
      await download(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      className={cn('group w-full', className)}
      variant={variant}
      size={size}
      disabled={loading}
      onClick={handleClick}
    >
      {loading ? (
        <Loader2 className="mr-1.5 h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        <Download className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:translate-y-0.5" aria-hidden="true" />
      )}
      {resolvedLabel}
    </Button>
  )
}
