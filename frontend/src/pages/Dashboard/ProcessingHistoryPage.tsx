import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { SEOHead } from '@/components/common/SEOHead'
import { fetchHistory, type HistoryItem } from '@/services/historyApi'

const PAGE_SIZE = 20

// Map backend tool_name to i18n key
const TOOL_I18N: Record<string, string> = {
  compress: 'tools:compress.title',
  convert: 'tools:convert.title',
  mosaic: 'tools:mosaic.title',
  'scan-enhance': 'tools:scanEnhance.title',
  'heic-to-jpg': 'tools:heicToJpg.title',
  'remove-bg': 'tools:removeBg.title',
  'id-photo': 'idPhoto:title',
  'pdf-compress': 'tools:pdf.compress.title',
  'pdf-merge': 'tools:pdf.merge.title',
  'pdf-pages': 'tools:pdf.pages.title',
  'pdf-from-images': 'tools:pdf.imagesToPdf.title',
  'pdf-split': 'tools:pdf.split.title',
}

export function ProcessingHistoryPage() {
  const { t } = useTranslation(['credits', 'tools', 'idPhoto'])
  const [items, setItems] = useState<HistoryItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (pageOffset: number) => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetchHistory({ limit: PAGE_SIZE, offset: pageOffset })
      setItems(res.items)
      setTotal(res.total)
      setOffset(pageOffset)
    } catch {
      setError(t('credits:processingHistory.loadError'))
    } finally {
      setLoading(false)
    }
  }, [t])

  useEffect(() => {
    load(0)
  }, [load])

  const toolLabel = (toolName: string) => {
    const key = TOOL_I18N[toolName]
    return key ? t(key) : toolName
  }

  const hasNext = offset + PAGE_SIZE < total
  const hasPrev = offset > 0

  return (
    <>
      <SEOHead title={t('credits:processingHistory.seoTitle')} noindex />
      <Card>
        <CardHeader>
          <CardTitle>{t('credits:processingHistory.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-sm text-muted-foreground">{t('credits:processingHistory.loading')}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          {!loading && items.length === 0 && !error && (
            <p className="text-sm text-muted-foreground">{t('credits:processingHistory.empty')}</p>
          )}

          {items.length > 0 && (
            <div className="space-y-2">
              {items.map((item) => (
                <div key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{toolLabel(item.tool_name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(item.created_at).toLocaleString()}
                    </p>
                  </div>
                  <span className="shrink-0 rounded bg-muted px-2 py-0.5 text-xs">
                    {item.status}
                  </span>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {total > PAGE_SIZE && (
            <div className="flex items-center justify-between pt-2">
              <Button
                variant="outline"
                size="sm"
                disabled={!hasPrev || loading}
                onClick={() => load(Math.max(0, offset - PAGE_SIZE))}
              >
                {t('credits:processingHistory.prev')}
              </Button>
              <span className="text-xs text-muted-foreground">
                {t('credits:processingHistory.pageInfo', {
                  current: Math.floor(offset / PAGE_SIZE) + 1,
                  total: Math.ceil(total / PAGE_SIZE),
                })}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={!hasNext || loading}
                onClick={() => load(offset + PAGE_SIZE)}
              >
                {t('credits:processingHistory.next')}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </>
  )
}
