import { type ReactNode, useState } from 'react'
import { FileIcon, FileText, ImageIcon, Loader2 } from 'lucide-react'

import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'

type MediaKind = 'image' | 'pdf' | 'file'

type Props = {
  label: string
  filename: string
  sizeText?: string
  mediaKind: MediaKind
  mediaUrl?: string | null
  action?: ReactNode
  className?: string
  previewClassName?: string
  imageFit?: 'contain' | 'cover'
  /** Prevent easy right-click save / drag on the preview image. */
  protectedPreview?: boolean
}

function EmptyState({ mediaKind }: { mediaKind: MediaKind }) {
  if (mediaKind === 'pdf') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <FileText className="h-9 w-9" aria-hidden="true" />
      </div>
    )
  }

  if (mediaKind === 'image') {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
        <ImageIcon className="h-9 w-9" aria-hidden="true" />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground">
      <FileIcon className="h-9 w-9" aria-hidden="true" />
    </div>
  )
}

function LoadableImage({ src, alt, fitClassName, protect }: { src: string; alt: string; fitClassName: string; protect?: boolean }) {
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
          'max-h-[70vh] w-full rounded-md bg-[radial-gradient(circle,_rgba(120,120,120,0.18)_1px,_transparent_1px)]',
          fitClassName,
          loaded ? 'motion-safe:animate-fade-in' : 'invisible',
          protect && 'pointer-events-none select-none',
        )}
        onLoad={() => setLoaded(true)}
      />
    </>
  )
}

export function ArtifactPreviewCard({
  label,
  filename,
  sizeText,
  mediaKind,
  mediaUrl,
  action,
  className,
  previewClassName,
  imageFit = 'contain',
  protectedPreview = false,
}: Props) {
  const hasPreviewMedia = Boolean(mediaUrl)
  const previewHeightClass = mediaKind === 'image' ? 'min-h-[18rem] sm:min-h-[22rem]' : 'min-h-[11rem]'
  const fitClassName = imageFit === 'cover' ? 'h-full object-cover' : 'h-auto object-contain'

  return (
    <Card className={cn('overflow-hidden border-border/70 shadow-sm', className)}>
      <div className="space-y-3 p-3 sm:p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="truncate text-sm font-medium">{filename}</p>
            {sizeText ? <p className="text-xs text-muted-foreground">{sizeText}</p> : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>

        <div className={cn('overflow-hidden rounded-lg border border-border/70 bg-muted/20', previewClassName)}>
          <div className={cn('relative flex items-center justify-center p-3', previewHeightClass)}>
            {hasPreviewMedia ? (
              <LoadableImage key={mediaUrl} src={mediaUrl!} alt={filename} fitClassName={fitClassName} protect={protectedPreview} />
            ) : (
              <EmptyState mediaKind={mediaKind} />
            )}
          </div>
        </div>
      </div>
    </Card>
  )
}
