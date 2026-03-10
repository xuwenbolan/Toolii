import { useCallback } from 'react'
import { useDropzone, type Accept } from 'react-dropzone'
import { FileUp } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  accept?: Accept
  multiple?: boolean
  maxFiles?: number
  title?: string
  hint?: string
  browseLabel?: string
  rejectHint?: string
  onFiles: (files: File[]) => void
  className?: string
}

export function ToolWorkspaceDropzone({
  accept,
  multiple = true,
  maxFiles,
  title,
  hint,
  browseLabel,
  rejectHint,
  onFiles,
  className,
}: Props) {
  const { t } = useTranslation('common')

  const handleDropAccepted = useCallback((accepted: File[]) => {
    if (accepted.length > 0) onFiles(accepted)
  }, [onFiles])

  const {
    getRootProps,
    getInputProps,
    isDragActive,
    isDragReject,
    open,
  } = useDropzone({
    onDropAccepted: handleDropAccepted,
    accept,
    multiple,
    maxFiles,
    noClick: true,
    noKeyboard: true,
  })

  const visualState = isDragReject ? 'reject' : isDragActive ? 'active' : 'idle'

  return (
    <div
      {...getRootProps()}
      className={cn(
        'flex min-h-[14rem] flex-col items-center justify-center rounded-2xl border-2 border-dashed px-4 py-8 text-center transition-[color,background-color,border-color,transform] duration-[var(--duration-fast)]',
        '[background-image:radial-gradient(circle,rgb(0_0_0/0.05)_1px,transparent_1px)] [background-size:24px_24px]',
        visualState === 'idle' && 'border-border/40 bg-muted/[0.02]',
        visualState === 'active' && 'border-primary/50 bg-primary/[0.04] motion-safe:scale-[1.01]',
        visualState === 'reject' && 'border-destructive/45 bg-destructive-light/55',
        className,
      )}
    >
      <input {...getInputProps()} />

      <div
        className={cn(
          'flex h-14 w-14 items-center justify-center rounded-xl text-muted-foreground/70',
          visualState === 'active' && 'bg-primary/10 text-primary motion-safe:animate-[icon-bounce_0.6s_var(--ease-out)_infinite]',
          visualState === 'reject' && 'bg-destructive/10 text-destructive motion-safe:animate-[shake_0.4s_var(--ease-out)]',
          visualState === 'idle' && 'bg-muted/45 motion-safe:animate-[breathe_3s_var(--ease-in-out)_infinite]',
        )}
      >
        <FileUp className="h-7 w-7" strokeWidth={1.75} aria-hidden />
      </div>

      <p className="mt-4 text-base font-semibold tracking-tight">
        {title ?? t('upload.dropHere')}
      </p>
      <p className="mt-1 max-w-xl text-sm text-muted-foreground">
        {visualState === 'reject'
          ? (rejectHint ?? t('upload.invalidFile'))
          : (hint ?? t('upload.orSelectBelow'))}
      </p>

      <Button type="button" size="lg" variant="outline" className="mt-4" onClick={open}>
        {browseLabel ?? t('actions.selectFile')}
      </Button>
    </div>
  )
}
