import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { AdminFilter, ConfirmDialog, DataTable, Pagination, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  fetchHubFiles,
  deleteHubFile,
  fetchShareGroups,
  deleteShareGroup,
  fetchResultShares,
  deleteResultShare,
} from '@/services/adminApi'
import type { AdminHubFileItem, AdminShareGroupItem, AdminResultShareItem } from '@/services/adminApi'
import { getTranslatedApiError } from '@/lib/apiErrors'

const PAGE_SIZE = 20

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(1024))
  const val = bytes / 1024 ** i
  return `${val < 10 ? val.toFixed(1) : Math.round(val)} ${units[i]}`
}

// -- Tab 1: Hub Files --------------------------------------------------------

const SOURCE_FILTERS = ['all', 'upload', 'tool_result']

function HubFilesTab() {
  const { t } = useTranslation('console')
  const queryClient = useQueryClient()
  const [source, setSource] = useState('all')
  const [offset, setOffset] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'hub-files', { source, offset }],
    queryFn: () => {
      const params: { limit: number; offset: number; source?: string } = { limit: PAGE_SIZE, offset }
      if (source !== 'all') params.source = source
      return fetchHubFiles(params)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const deleteMutation = useMutation({
    mutationFn: deleteHubFile,
    onSuccess: () => {
      toast.success(t('common.success'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'hub-files'] })
      setConfirmDelete(null)
    },
    onError: (err) => toast.error(getTranslatedApiError(err, t('common.error'))),
  })

  const filterOptions = useMemo(
    () => SOURCE_FILTERS.map((s) => ({
      value: s,
      label: s === 'all' ? t('transfers.allStatus') : s === 'upload' ? t('transfers.sourceUpload') : t('transfers.sourceTool'),
    })),
    [t],
  )

  const columns: Column<AdminHubFileItem>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', hiddenOnMobile: true, render: (i) => i.id },
      {
        key: 'filename',
        header: t('transfers.fileName'),
        render: (i) => <span className="max-w-[180px] truncate block" title={i.file_name}>{i.file_name}</span>,
      },
      { key: 'user', header: t('transfers.user'), hiddenOnMobile: true, render: (i) => i.user_email ?? '-' },
      {
        key: 'size',
        header: t('transfers.size'),
        align: 'right' as const,
        render: (i) => formatBytes(i.size),
      },
      {
        key: 'source',
        header: t('transfers.source'),
        hiddenOnMobile: true,
        render: (i) => <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{i.source}</span>,
      },
      {
        key: 'status',
        header: t('transfers.status'),
        render: (i) => <StatusBadge status={i.status} />,
      },
      {
        key: 'expires',
        header: t('transfers.expiresAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (i) => new Date(i.expires_at).toLocaleString(),
      },
      {
        key: 'actions',
        header: '',
        align: 'right' as const,
        render: (i) => (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setConfirmDelete(i.id)}>
            {t('transfers.delete')}
          </Button>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <AdminFilter
        value={source}
        options={filterOptions}
        onChange={(v) => { setSource(v); setOffset(0) }}
      />

      <DataTable
        columns={columns}
        data={items}
        rowKey={(i) => i.id}
        loading={isLoading}
        renderMobileCard={(i) => (
          <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium truncate max-w-[60%]">{i.file_name}</span>
              <StatusBadge status={i.status} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{i.user_email ?? '-'}</span>
              <span>{formatBytes(i.size)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{new Date(i.created_at).toLocaleString()}</span>
              <button className="text-destructive hover:underline text-xs" onClick={() => setConfirmDelete(i.id)}>
                {t('transfers.delete')}
              </button>
            </div>
          </div>
        )}
      />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={t('transfers.deleteConfirmTitle')}
        description={t('transfers.deleteConfirmDesc')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete !== null && deleteMutation.mutate(confirmDelete)}
      />
    </div>
  )
}

// -- Tab 2: Share Groups -----------------------------------------------------

const GROUP_STATUSES = ['all', 'active', 'expired', 'deleted']

function ShareGroupsTab() {
  const { t } = useTranslation('console')
  const queryClient = useQueryClient()
  const [status, setStatus] = useState('all')
  const [offset, setOffset] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'share-groups', { status, offset }],
    queryFn: () => {
      const params: { limit: number; offset: number; status?: string } = { limit: PAGE_SIZE, offset }
      if (status !== 'all') params.status = status
      return fetchShareGroups(params)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const deleteMutation = useMutation({
    mutationFn: deleteShareGroup,
    onSuccess: () => {
      toast.success(t('common.success'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'share-groups'] })
      setConfirmDelete(null)
    },
    onError: (err) => toast.error(getTranslatedApiError(err, t('common.error'))),
  })

  const filterOptions = useMemo(
    () => GROUP_STATUSES.map((s) => ({
      value: s,
      label: s === 'all' ? t('transfers.allStatus') : s,
    })),
    [t],
  )

  const columns: Column<AdminShareGroupItem>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', hiddenOnMobile: true, render: (i) => i.id },
      { key: 'token', header: t('transfers.token'), render: (i) => <code className="text-xs">{i.token}</code> },
      { key: 'user', header: t('transfers.user'), hiddenOnMobile: true, render: (i) => i.user_email ?? '-' },
      {
        key: 'files',
        header: t('transfers.files'),
        align: 'right' as const,
        render: (i) => `${i.file_count} / ${formatBytes(i.total_size)}`,
      },
      {
        key: 'downloads',
        header: t('transfers.downloads'),
        align: 'right' as const,
        hiddenOnMobile: true,
        render: (i) => i.download_count,
      },
      {
        key: 'status',
        header: t('transfers.status'),
        render: (i) => <StatusBadge status={i.status} />,
      },
      {
        key: 'expires',
        header: t('transfers.expiresAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (i) => i.expires_at ? new Date(i.expires_at).toLocaleString() : '-',
      },
      {
        key: 'actions',
        header: '',
        align: 'right' as const,
        render: (i) => (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setConfirmDelete(i.id)}>
            {t('transfers.delete')}
          </Button>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <AdminFilter
        value={status}
        options={filterOptions}
        onChange={(v) => { setStatus(v); setOffset(0) }}
      />

      <DataTable
        columns={columns}
        data={items}
        rowKey={(i) => i.id}
        loading={isLoading}
        renderMobileCard={(i) => (
          <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <code className="text-xs">{i.token}</code>
              <StatusBadge status={i.status} />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>{i.user_email ?? '-'}</span>
              <span>{i.file_count} files / {formatBytes(i.total_size)}</span>
            </div>
            <div className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>{new Date(i.created_at).toLocaleString()}</span>
              <button className="text-destructive hover:underline text-xs" onClick={() => setConfirmDelete(i.id)}>
                {t('transfers.delete')}
              </button>
            </div>
          </div>
        )}
      />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={t('transfers.deleteConfirmTitle')}
        description={t('transfers.deleteConfirmDesc')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete !== null && deleteMutation.mutate(confirmDelete)}
      />
    </div>
  )
}

// -- Tab 3: Result Shares ----------------------------------------------------

const SHARE_TYPES = [
  'profile', 'report', 'similarity',
  'compress', 'remove_bg', 'upscale', 'restore_face',
  'denoise', 'colorize', 'inpaint', 'scan_enhance', 'mosaic',
]

function ResultSharesTab() {
  const { t } = useTranslation('console')
  const queryClient = useQueryClient()
  const [shareType, setShareType] = useState('all')
  const [expiredFilter, setExpiredFilter] = useState('all')
  const [offset, setOffset] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState<number | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'result-shares', { shareType, expiredFilter, offset }],
    queryFn: () => {
      const params: { limit: number; offset: number; share_type?: string; expired?: boolean } = {
        limit: PAGE_SIZE,
        offset,
      }
      if (shareType !== 'all') params.share_type = shareType
      if (expiredFilter === 'expired') params.expired = true
      else if (expiredFilter === 'active') params.expired = false
      return fetchResultShares(params)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const deleteMutation = useMutation({
    mutationFn: deleteResultShare,
    onSuccess: () => {
      toast.success(t('common.success'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'result-shares'] })
      setConfirmDelete(null)
    },
    onError: (err) => toast.error(getTranslatedApiError(err, t('common.error'))),
  })

  const typeOptions = useMemo(
    () => [
      { value: 'all', label: t('transfers.allTypes') },
      ...SHARE_TYPES.map((s) => ({ value: s, label: s })),
    ],
    [t],
  )

  const expiredOptions = useMemo(
    () => [
      { value: 'all', label: t('transfers.allStatus') },
      { value: 'active', label: t('transfers.shareActive') },
      { value: 'expired', label: t('transfers.shareExpired') },
    ],
    [t],
  )

  const columns: Column<AdminResultShareItem>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', hiddenOnMobile: true, render: (i) => i.id },
      { key: 'token', header: t('transfers.token'), render: (i) => <code className="text-xs">{i.token.slice(0, 8)}...</code> },
      {
        key: 'type',
        header: t('transfers.shareType'),
        render: (i) => <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{i.share_type}</span>,
      },
      { key: 'user', header: t('transfers.user'), hiddenOnMobile: true, render: (i) => i.user_email ?? '-' },
      { key: 'locale', header: t('transfers.locale'), hiddenOnMobile: true, render: (i) => i.locale },
      {
        key: 'expires',
        header: t('transfers.expiresAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (i) => {
          const expired = new Date(i.expires_at) < new Date()
          return (
            <span className={expired ? 'text-muted-foreground' : ''}>
              {new Date(i.expires_at).toLocaleString()}
            </span>
          )
        },
      },
      {
        key: 'actions',
        header: '',
        align: 'right' as const,
        render: (i) => (
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive" onClick={() => setConfirmDelete(i.id)}>
            {t('transfers.delete')}
          </Button>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <AdminFilter
          value={shareType}
          options={typeOptions}
          onChange={(v) => { setShareType(v); setOffset(0) }}
        />
        <AdminFilter
          value={expiredFilter}
          options={expiredOptions}
          onChange={(v) => { setExpiredFilter(v); setOffset(0) }}
        />
      </div>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(i) => i.id}
        loading={isLoading}
        renderMobileCard={(i) => {
          const expired = new Date(i.expires_at) < new Date()
          return (
            <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
              <div className="flex items-center justify-between">
                <code className="text-xs">{i.token.slice(0, 8)}...</code>
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{i.share_type}</span>
              </div>
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{i.user_email ?? '-'}</span>
                <span className={expired ? 'text-destructive' : ''}>{expired ? 'expired' : 'active'}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{new Date(i.created_at).toLocaleString()}</span>
                <button className="text-destructive hover:underline text-xs" onClick={() => setConfirmDelete(i.id)}>
                  {t('transfers.delete')}
                </button>
              </div>
            </div>
          )
        }}
      />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(open) => !open && setConfirmDelete(null)}
        title={t('transfers.deleteShareConfirmTitle')}
        description={t('transfers.deleteShareConfirmDesc')}
        variant="destructive"
        loading={deleteMutation.isPending}
        onConfirm={() => confirmDelete !== null && deleteMutation.mutate(confirmDelete)}
      />
    </div>
  )
}

// -- Main Page ---------------------------------------------------------------

export function AdminTransfersPage() {
  const { t } = useTranslation('console')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('transfers.title')}</h1>

      <Tabs defaultValue="hubFiles">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList>
            <TabsTrigger value="hubFiles">{t('transfers.tabs.hubFiles')}</TabsTrigger>
            <TabsTrigger value="shareGroups">{t('transfers.tabs.shareGroups')}</TabsTrigger>
            <TabsTrigger value="resultShares">{t('transfers.tabs.resultShares')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="hubFiles"><HubFilesTab /></TabsContent>
        <TabsContent value="shareGroups"><ShareGroupsTab /></TabsContent>
        <TabsContent value="resultShares"><ResultSharesTab /></TabsContent>
      </Tabs>
    </div>
  )
}
