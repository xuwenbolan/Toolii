import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, ImageIcon, Sparkles } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { ResultShareData } from '@/services/resultShareApi'

type ToolMeta = {
  original_filename?: string
  original_size?: number
  result_filename?: string
  result_size?: number
}

const TOOL_PATHS: Record<string, string> = {
  compress: '/image-tools/compress',
  remove_bg: '/image-tools/remove-bg',
  upscale: '/image-tools/upscale',
  restore_face: '/image-tools/restore-face',
  denoise: '/image-tools/denoise',
  colorize: '/image-tools/colorize',
  inpaint: '/image-tools/inpaint',
  scan_enhance: '/image-tools/scan-enhance',
  mosaic: '/image-tools/mosaic',
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatExpiry(dateStr: string, locale: string): string {
  const date = new Date(dateStr)
  if (Number.isNaN(date.getTime())) return dateStr
  return date.toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
}

type Props = {
  data: ResultShareData
  meta: ToolMeta
}

export function ImageToolShareView({ data, meta }: Props) {
  const { t, i18n } = useTranslation('resultShare')
  const shareType = data.share_type
  const hasOriginal = Boolean(data.original_image_url)
  const toolPath = TOOL_PATHS[shareType] ?? '/image-tools'

  const title = t(`toolTitle.${shareType}`, { defaultValue: t('toolTitle.compress') })
  const ctaText = t(`cta.${shareType}`, { defaultValue: t('cta.default') })
  const ctaDesc = t('ctaDescription.default')

  return (
    <article className="mx-auto w-full max-w-2xl px-4 pb-16 pt-6">
      {/* Header badge */}
      <div className="mb-5 flex items-center justify-center gap-2">
        <Badge variant="secondary" className="gap-1.5 px-3 py-1 text-xs font-medium">
          <Sparkles className="h-3 w-3" />
          {t(`badge.default`)}
        </Badge>
      </div>

      {/* Title */}
      <h1 className="mb-6 text-center text-xl font-bold sm:text-2xl">{title}</h1>

      <div className="space-y-5">
        {/* Before / After or single image */}
        {hasOriginal ? (
          <div
            className={cn(
              'rounded-2xl p-4 shadow-sm ring-1 ring-border/40',
              'bg-gradient-to-b from-stone-50/80 to-white dark:from-stone-900/30 dark:to-card',
            )}
          >
            <div className="grid gap-4 sm:grid-cols-2">
              {/* Before */}
              <figure className="space-y-2">
                <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('beforeAfter.before')}
                </figcaption>
                <div className="overflow-hidden rounded-xl border border-border/50 bg-muted/10">
                  <div className="flex min-h-[12rem] items-center justify-center p-2 sm:min-h-[16rem]">
                    <img
                      src={data.original_image_url!}
                      alt={meta.original_filename ?? 'Original'}
                      className="max-h-[50vh] w-full rounded-lg object-contain bg-[radial-gradient(circle,_rgba(120,120,120,0.12)_1px,_transparent_1px)] [background-size:12px_12px]"
                      loading="eager"
                    />
                  </div>
                </div>
                {meta.original_size != null && (
                  <p className="text-xs text-muted-foreground">{formatBytes(meta.original_size)}</p>
                )}
              </figure>

              {/* After */}
              <figure className="space-y-2">
                <figcaption className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t('beforeAfter.after')}
                </figcaption>
                <div className="overflow-hidden rounded-xl border border-border/50 bg-muted/10">
                  <div className="flex min-h-[12rem] items-center justify-center p-2 sm:min-h-[16rem]">
                    <img
                      src={data.image_url}
                      alt={meta.result_filename ?? 'Result'}
                      className="max-h-[50vh] w-full rounded-lg object-contain bg-[radial-gradient(circle,_rgba(120,120,120,0.12)_1px,_transparent_1px)] [background-size:12px_12px]"
                      loading="eager"
                    />
                  </div>
                </div>
                {meta.result_size != null && (
                  <p className="text-xs text-muted-foreground">{formatBytes(meta.result_size)}</p>
                )}
              </figure>
            </div>

            {/* Compression stats */}
            {meta.original_size != null && meta.result_size != null && meta.original_size > 0 && (
              <div className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
                <span>{t('meta.originalSize')}: {formatBytes(meta.original_size)}</span>
                <span>&rarr;</span>
                <span>{t('meta.resultSize')}: {formatBytes(meta.result_size)}</span>
                {meta.result_size < meta.original_size && (
                  <Badge variant="secondary" className="ml-1 text-[10px]">
                    {t('meta.savedPercent', { percent: Math.round((1 - meta.result_size / meta.original_size) * 100) })}
                  </Badge>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <div className="overflow-hidden rounded-2xl shadow-lg shadow-stone-900/10 dark:shadow-stone-950/30">
              {data.image_url ? (
                <img
                  src={data.image_url}
                  alt="Result"
                  className="block max-h-[60vh] w-auto rounded-2xl object-contain"
                  loading="eager"
                />
              ) : (
                <div className="flex h-64 w-64 items-center justify-center bg-muted/20">
                  <ImageIcon className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* CTA */}
      <section className="mt-8 mb-8">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-stone-100 via-sky-50/60 to-violet-50/40 dark:from-stone-900 dark:via-sky-950/30 dark:to-violet-950/20 p-6 text-center shadow-sm">
          <div className="relative space-y-3">
            <h3 className="text-base font-semibold">{ctaText}</h3>
            <p className="text-sm text-muted-foreground">{ctaDesc}</p>
            <Button asChild size="lg" className="mt-2">
              <Link to={toolPath}>
                {ctaText}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="text-center">
        {data.expires_at && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground/70">
            <Clock className="h-3 w-3" />
            {t('expiresAt', { date: formatExpiry(data.expires_at, i18n.language) })}
          </p>
        )}
      </footer>
    </article>
  )
}
