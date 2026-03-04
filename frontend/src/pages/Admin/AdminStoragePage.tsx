import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { AdminFilter, ConfirmDialog, DataTable, Pagination, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import {
  fetchStorageOverview,
  fetchProcessingHistory,
  triggerStorageCleanup,
} from '@/services/adminApi'
import type { AdminProcessingHistoryListItem } from '@/services/adminApi'
import { getTranslatedApiError } from '@/lib/apiErrors'

const PAGE_SIZE = 20

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / 1024 ** i
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

const DIR_LABELS: Record<string, { zh: string; en: string }> = {
  files: { zh: '处理文件', en: 'Processed Files' },
  transfers: { zh: '文件传输', en: 'File Transfers' },
  result_shares: { zh: '结果分享', en: 'Result Shares' },
}

export function AdminStoragePage() {
  const { t, i18n } = useTranslation('admin')
  const queryClient = useQueryClient()
  const isZh = i18n.language.startsWith('zh')

  const [statusFilter, setStatusFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const [confirmCleanup, setConfirmCleanup] = useState(false)

  // Overview
  const { data: overview } = useQuery({
    queryKey: ['admin', 'storage-overview'],
    queryFn: fetchStorageOverview,
  })

  // Processing history
  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'processing-history', { statusFilter, offset }],
    queryFn: () => {
      const params: { limit: number; offset: number; status?: string } = {
        limit: PAGE_SIZE,
        offset,
      }
      if (statusFilter !== 'all') params.status = statusFilter
      return fetchProcessingHistory(params)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  // Cleanup mutation
  const cleanupMutation = useMutation({
    mutationFn: () => triggerStorageCleanup('all'),
    onSuccess: (result) => {
      const parts: string[] = []
      if (result.files_removed > 0) parts.push(`${result.files_removed} files`)
      if (result.transfers_expired > 0) parts.push(`${result.transfers_expired} transfers`)
      if (result.shares_expired > 0) parts.push(`${result.shares_expired} shares`)
      toast.success(parts.length > 0 ? `Cleaned: ${parts.join(', ')}` : t('storage.cleanupEmpty'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'storage-overview'] })
    },
    onError: (err) => {
      toast.error(getTranslatedApiError(err, t('common.error')))
    },
  })

  const statusOptions = useMemo(
    () => [
      { value: 'all', label: t('storage.allStatus') },
      { value: 'done', label: t('storage.statusDone') },
      { value: 'failed', label: t('storage.statusFailed') },
    ],
    [t],
  )

  const columns: Column<AdminProcessingHistoryListItem>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', hiddenOnMobile: true, render: (i) => i.id },
      { key: 'tool', header: t('storage.tool'), render: (i) => i.display_name },
      { key: 'user', header: t('storage.user'), hiddenOnMobile: true, render: (i) => i.user_email ?? '-' },
      {
        key: 'status',
        header: t('storage.status'),
        render: (i) => <StatusBadge status={i.status} />,
      },
      {
        key: 'time',
        header: t('storage.time'),
        className: 'whitespace-nowrap',
        render: (i) => new Date(i.created_at).toLocaleString(),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('storage.title')}</h1>

      {/* Overview cards */}
      {overview && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {overview.directories.map((dir) => {
            const label = DIR_LABELS[dir.name]
            return (
              <div key={dir.name} className="rounded-xl border bg-card p-4">
                <div className="text-2xl font-bold tabular-nums">{dir.file_count.toLocaleString()}</div>
                <div className="mt-1 text-sm text-muted-foreground">
                  {label ? (isZh ? label.zh : label.en) : dir.name}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">{formatBytes(dir.total_size_bytes)}</div>
              </div>
            )
          })}
          <div className="rounded-xl border bg-card p-4">
            <div className="text-2xl font-bold tabular-nums">{overview.processing.total.toLocaleString()}</div>
            <div className="mt-1 text-sm text-muted-foreground">{t('storage.totalProcessing')}</div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {t('storage.today')}: {overview.processing.today}
            </div>
          </div>
        </div>
      )}

      {/* Cleanup */}
      <div className="flex items-center gap-3">
        <Button
          variant="outline"
          size="sm"
          onClick={() => setConfirmCleanup(true)}
          disabled={cleanupMutation.isPending}
        >
          {cleanupMutation.isPending ? t('common.loading') : t('storage.cleanup')}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmCleanup}
        onOpenChange={setConfirmCleanup}
        title={t('storage.cleanupConfirmTitle')}
        description={t('storage.cleanupConfirmDesc')}
        loading={cleanupMutation.isPending}
        onConfirm={() => cleanupMutation.mutate()}
      />

      {/* Processing history */}
      <div className="space-y-4">
        <h2 className="text-base font-medium">{t('storage.processingHistory')}</h2>
        <AdminFilter
          value={statusFilter}
          options={statusOptions}
          onChange={(v) => { setStatusFilter(v); setOffset(0) }}
        />

        <DataTable
          columns={columns}
          data={items}
          rowKey={(i) => i.id}
          loading={isLoading}
          renderMobileCard={(i) => (
            <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">{i.display_name}</span>
                <StatusBadge status={i.status} />
              </div>
              {i.user_email && (
                <div className="text-xs text-muted-foreground">{i.user_email}</div>
              )}
              <div className="text-[11px] text-muted-foreground">{new Date(i.created_at).toLocaleString()}</div>
            </div>
          )}
        />
        <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
      </div>
    </div>
  )
}
