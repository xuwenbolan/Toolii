import { Download } from 'lucide-react'
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
  const resolvedLabel = label ?? t('actions.downloadResult')

  return (
    <Button
      type="button"
      className={cn('group w-full', className)}
      variant={variant}
      size={size}
      onClick={() => {
        download(url)
      }}
    >
      <Download className="mr-1.5 h-4 w-4 transition-transform duration-[var(--duration-fast)] group-hover:translate-y-0.5" />
      {resolvedLabel}
    </Button>
  )
}
