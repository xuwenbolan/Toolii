import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { ConfirmDialog } from '@/components/admin'
import { Button } from '@/components/ui/button'
import {
  fetchStorageOverview,
  triggerStorageCleanup,
} from '@/services/adminApi'
import { getTranslatedApiError } from '@/lib/apiErrors'

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
  const { t, i18n } = useTranslation('console')
  const queryClient = useQueryClient()
  const isZh = i18n.language.startsWith('zh')

  const [confirmCleanup, setConfirmCleanup] = useState(false)

  // Overview
  const { data: overview } = useQuery({
    queryKey: ['admin', 'storage-overview'],
    queryFn: fetchStorageOverview,
  })

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
    </div>
  )
}
