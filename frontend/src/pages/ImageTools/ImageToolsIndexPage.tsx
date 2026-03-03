import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd } from '@/lib/jsonLd'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { FORMAT_PAIRS } from '@/config/formatPairs'
import { useToolStore } from '@/stores/toolStore'

const TOOLS = [
  { key: 'compress', to: '/image-tools/compress', toolName: 'image/compress' },
  { key: 'heicToJpg', to: '/image-tools/heic-to-jpg', toolName: 'image/heic-to-jpg' },
  { key: 'convert', to: '/image-tools/convert', toolName: 'image/convert' },
  { key: 'removeBg', to: '/image-tools/remove-bg', toolName: 'image/remove-bg' },
  { key: 'upscale', to: '/image-tools/upscale', toolName: 'image/upscale' },
  { key: 'restoreFace', to: '/image-tools/restore-face', toolName: 'image/restore-face' },
  { key: 'denoise', to: '/image-tools/denoise', toolName: 'image/denoise' },
  { key: 'colorize', to: '/image-tools/colorize', toolName: 'image/colorize' },
  { key: 'inpaint', to: '/image-tools/inpaint', toolName: 'image/inpaint' },
  { key: 'ocr', to: '/image-tools/ocr', toolName: 'image/ocr' },
  { key: 'segment', to: '/image-tools/segment', toolName: 'image/segment' },
  { key: 'mosaic', to: '/image-tools/mosaic', toolName: 'image/mosaic' },
  { key: 'scanEnhance', to: '/image-tools/scan-enhance', toolName: 'image/scan-enhance' },
] as const

export function ImageToolsIndexPage() {
  const { t } = useTranslation(['tools', 'common'])
  const { isToolEnabled, getToolCost } = useToolStore()

  const visibleTools = TOOLS.filter((item) => isToolEnabled(item.toolName))

  return (
    <>
      <SEOHead title={t('seoTitle')} description={t('seoDescription')} keywords={t('seoKeywords')} canonicalPath="/image-tools" jsonLd={buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }])} />
      <div className="space-y-5">
        <div className="animate-rise-in flex items-center gap-3">
          <Button asChild variant="ghost" size="sm" className="h-8 w-fit px-2.5">
            <Link to="/" className="inline-flex items-center gap-1.5">
              <ArrowLeft className="h-4 w-4" />
              <span>{t('common:actions.back')}</span>
            </Link>
          </Button>
          <h1 className="text-lg font-semibold tracking-tight sm:text-xl">{t('title')}</h1>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {visibleTools.map((item, index) => {
            const cost = getToolCost(item.toolName)
            return (
              <Link
                key={item.key}
                to={item.to}
                className="block animate-rise-in"
                style={{ animationDelay: `${90 + index * 45}ms` }}
              >
                <Card className="h-full transition hover:bg-accent/40">
                  <CardHeader className="pb-2">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">{t(`${item.key}.title`)}</CardTitle>
                      {cost > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {cost} credit{cost > 1 ? 's' : ''}
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="text-sm text-muted-foreground">
                    {t(`${item.key}.indexDescription`)}
                  </CardContent>
                </Card>
              </Link>
            )
          })}
        </div>

        <div className="animate-rise-in space-y-1" style={{ animationDelay: '220ms' }}>
          <h2 className="text-lg font-semibold tracking-tight">{t('convert.title')}</h2>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {FORMAT_PAIRS.map((pair, index) => (
            <Link
              key={pair.slug}
              to={`/image-tools/${pair.slug}`}
              className="block animate-rise-in"
              style={{ animationDelay: `${280 + index * 35}ms` }}
            >
              <Card className="h-full transition hover:bg-accent/40">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">{t(`${pair.i18nKey}.title`)}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground">
                  {t(`${pair.i18nKey}.indexDescription`)}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      </div>
    </>
  )
}
