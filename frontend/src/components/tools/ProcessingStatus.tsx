import { cn } from '@/lib/utils'

type Props = {
  pending?: boolean
  error?: string | null
  className?: string
}

export function ProcessingStatus({ pending, error, className }: Props) {
  if (!pending && !error) return null

  if (error) {
    return <p className={cn('text-sm text-destructive', className)}>{error}</p>
  }

  return <p className={cn('text-sm text-muted-foreground', className)}>处理中，请稍候…</p>
}

