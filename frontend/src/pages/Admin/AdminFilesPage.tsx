import { useState, useMemo, useCallback } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Download, Eye, Search } from 'lucide-react'

import { AdminFilter, DataTable, Pagination } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchAdminFiles, fetchAdminFileDownloadUrl } from '@/services/adminApi'
import type { AdminFileItem } from '@/services/adminApi'
import { getTranslatedApiError } from '@/lib/apiErrors'

const PAGE_SIZE = 50

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / 1024 ** i
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

function formatTimestamp(ts: number): string {
  return new Date(ts * 1000).toLocaleString()
}

const DIR_OPTIONS_ZH: Record<string, string> = {
  files: '处理文件',
  transfers: '文件传输',
  result_shares: '结果分享',
}

const DIR_OPTIONS_EN: Record<string, string> = {
  files: 'Processed Files',
  transfers: 'File Transfers',
  result_shares: 'Result Shares',
}

export function AdminFilesPage() {
  const { t, i18n } = useTranslation('console')
  const isZh = i18n.language.startsWith('zh')

  const [directory, setDirectory] = useState('files')
  const [offset, setOffset] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [previewItem, setPreviewItem] = useState<AdminFileItem | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [downloading, setDownloading] = useState<string | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'files', directory, offset, search],
    queryFn: () => fetchAdminFiles({
      directory,
      limit: PAGE_SIZE,
      offset,
      search: search || undefined,
    }),
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const dirOptions = useMemo(() => {
    const labels = isZh ? DIR_OPTIONS_ZH : DIR_OPTIONS_EN
    return Object.entries(labels).map(([value, label]) => ({ value, label }))
  }, [isZh])

  const handleSearch = useCallback(() => {
    setSearch(searchInput.trim())
    setOffset(0)
  }, [searchInput])

  const handleDownload = useCallback(async (item: AdminFileItem) => {
    setDownloading(item.file_id)
    try {
      const { download_url } = await fetchAdminFileDownloadUrl(item.file_id, directory)
      window.open(download_url, '_blank', 'noopener,noreferrer')
    } catch (err) {
      toast.error(getTranslatedApiError(err, t('common.error')))
    } finally {
      setDownloading(null)
    }
  }, [directory, t])

  const handlePreview = useCallback(async (item: AdminFileItem) => {
    try {
      const { download_url } = await fetchAdminFileDownloadUrl(item.file_id, directory)
      setPreviewUrl(download_url)
      setPreviewItem(item)
    } catch (err) {
      toast.error(getTranslatedApiError(err, t('common.error')))
    }
  }, [directory, t])

  const columns: Column<AdminFileItem>[] = useMemo(
    () => [
      {
        key: 'filename',
        header: t('files.filename'),
        render: (i) => (
          <span className="max-w-[200px] truncate block" title={i.original_filename}>
            {i.original_filename}
          </span>
        ),
      },
      {
        key: 'type',
        header: t('files.type'),
        hiddenOnMobile: true,
        render: (i) => (
          <span className="text-xs text-muted-foreground">{i.content_type}</span>
        ),
      },
      {
        key: 'size',
        header: t('files.size'),
        className: 'whitespace-nowrap',
        render: (i) => formatBytes(i.size),
      },
      {
        key: 'time',
        header: t('files.time'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (i) => formatTimestamp(i.created_at),
      },
      {
        key: 'actions',
        header: t('files.actions'),
        className: 'text-right',
        render: (i) => (
          <div className="flex items-center justify-end gap-1">
            {i.previewable && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => handlePreview(i)}
                title={t('files.preview')}
              >
                <Eye className="h-3.5 w-3.5" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              disabled={downloading === i.file_id}
              onClick={() => handleDownload(i)}
              title={t('files.download')}
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        ),
      },
    ],
    [t, handlePreview, handleDownload, downloading],
  )

  const isImage = previewItem?.content_type.startsWith('image/')
  const isPdf = previewItem?.content_type === 'application/pdf'

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('files.title')}</h1>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <AdminFilter
          value={directory}
          options={dirOptions}
          onChange={(v) => { setDirectory(v); setOffset(0); setSearch(''); setSearchInput('') }}
        />
        <div className="flex items-center gap-1.5">
          <Input
            className="h-8 w-48"
            placeholder={t('files.searchPlaceholder')}
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button variant="outline" size="icon" className="h-8 w-8" onClick={handleSearch}>
            <Search className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      {/* File count */}
      {!isLoading && (
        <div className="text-sm text-muted-foreground">
          {t('files.totalCount', { count: total })}
        </div>
      )}

      {/* File list */}
      <DataTable
        columns={columns}
        data={items}
        rowKey={(i) => i.file_id}
        loading={isLoading}
        renderMobileCard={(i) => (
          <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate max-w-[60%]">{i.original_filename}</span>
              <span className="text-xs text-muted-foreground">{formatBytes(i.size)}</span>
            </div>
            <div className="text-xs text-muted-foreground">{i.content_type}</div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">{formatTimestamp(i.created_at)}</span>
              <div className="flex gap-1">
                {i.previewable && (
                  <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handlePreview(i)}>
                    <Eye className="h-3 w-3" />
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleDownload(i)}>
                  <Download className="h-3 w-3" />
                </Button>
              </div>
            </div>
          </div>
        )}
      />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />

      {/* Preview dialog */}
      <Dialog open={!!previewItem} onOpenChange={(open) => { if (!open) { setPreviewItem(null); setPreviewUrl(null) } }}>
        <DialogContent className="max-w-3xl max-h-[85vh] overflow-auto">
          <DialogHeader>
            <DialogTitle className="truncate pr-8">{previewItem?.original_filename}</DialogTitle>
          </DialogHeader>
          {previewUrl && isImage && (
            <img
              src={previewUrl}
              alt={previewItem?.original_filename}
              className="w-full rounded-lg object-contain max-h-[70vh]"
            />
          )}
          {previewUrl && isPdf && (
            <iframe
              src={previewUrl}
              title={previewItem?.original_filename}
              className="w-full h-[70vh] rounded-lg border"
            />
          )}
          <div className="flex items-center justify-between text-sm text-muted-foreground mt-2">
            <span>{previewItem && formatBytes(previewItem.size)}</span>
            <span>{previewItem && formatTimestamp(previewItem.created_at)}</span>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
