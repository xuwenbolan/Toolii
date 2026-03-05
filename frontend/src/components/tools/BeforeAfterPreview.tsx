import { useState } from 'react'
import { ImageIcon, Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { cn } from '@/lib/utils'

type Props = {
  beforeFilename: string
  beforeSizeText?: string
  beforeUrl?: string | null
  afterFilename: string
  afterSizeText?: string
  afterUrl?: string | null
  className?: string
  /** Prevent easy right-click save / drag on the "after" preview image. */
  protectedPreview?: boolean
}

function PreviewImage({ src, alt, protect }: { src: string; alt: string; protect?: boolean }) {
  const [loaded, setLoaded] = useState(false)

  return (
    <>
      {!loaded ? <Loader2 className="absolute h-6 w-6 animate-spin text-muted-foreground" /> : null}
      <img
        src={src}
        alt={alt}
        draggable={protect ? false : undefined}
        onContextMenu={protect ? (e) => e.preventDefault() : undefined}
        className={cn(
          'max-h-[58vh] w-full rounded-md object-contain bg-[radial-gradient(circle,_rgba(120,120,120,0.18)_1px,_transparent_1px)] [background-size:12px_12px]',
          loaded ? 'motion-safe:animate-fade-in' : 'invisible',
          protect && 'pointer-events-none select-none',
        )}
        onLoad={() => setLoaded(true)}
      />
    </>
  )
}

export function BeforeAfterPreview({
  beforeFilename,
  beforeSizeText,
  beforeUrl,
  afterFilename,
  afterSizeText,
  afterUrl,
  className,
  protectedPreview = false,
}: Props) {
  const { t } = useTranslation('common')

  return (
    <div className={cn('rounded-xl border border-border/70 bg-card p-3 shadow-sm sm:p-4', className)}>
      <div className="grid gap-3 lg:grid-cols-2">
        <figure className="space-y-2">
          <figcaption className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('preview.before')}</p>
            <p className="truncate text-sm font-medium">{beforeFilename}</p>
            {beforeSizeText ? <p className="text-xs text-muted-foreground">{beforeSizeText}</p> : null}
          </figcaption>
          <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
            <div className="relative flex min-h-[14rem] items-center justify-center p-3 sm:min-h-[18rem]">
              {beforeUrl ? (
                <PreviewImage src={beforeUrl} alt={beforeFilename} />
              ) : (
                <ImageIcon className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
          </div>
        </figure>
        <figure className="space-y-2">
          <figcaption className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('preview.after')}</p>
            <p className="truncate text-sm font-medium">{afterFilename}</p>
            {afterSizeText ? <p className="text-xs text-muted-foreground">{afterSizeText}</p> : null}
          </figcaption>
          <div className="overflow-hidden rounded-lg border border-border/70 bg-muted/20">
            <div className="relative flex min-h-[14rem] items-center justify-center p-3 sm:min-h-[18rem]">
              {afterUrl ? (
                <PreviewImage src={afterUrl} alt={afterFilename} protect={protectedPreview} />
              ) : (
                <ImageIcon className="h-9 w-9 text-muted-foreground" aria-hidden="true" />
              )}
            </div>
          </div>
        </figure>
      </div>
    </div>
  )
}
