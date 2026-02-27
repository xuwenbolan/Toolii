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

export function DownloadButton({ url, label = '下载结果', variant, size, className }: Props) {
  const download = useFileDownload()
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
      {label}
    </Button>
  )
}
