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
      className={cn('w-full', className)}
      variant={variant}
      size={size}
      onClick={() => {
        download(url)
      }}
    >
      {resolvedLabel}
    </Button>
  )
}
