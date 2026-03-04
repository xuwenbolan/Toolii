import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { AdminErrorState, AdminFilter, DataTable, Pagination, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { fetchAllFeedback, updateFeedback } from '@/services/feedbackApi'
import type { AdminFeedbackItem, FeedbackStatus } from '@/services/feedbackApi'

const STATUSES: FeedbackStatus[] = ['pending', 'reviewed', 'resolved']
const PAGE_SIZE = 20

export function AdminFeedbackPage() {
  const { t } = useTranslation('admin')
  const queryClient = useQueryClient()

  const [statusFilter, setStatusFilter] = useState('all')
  const [offset, setOffset] = useState(0)

  // Expanded row state
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editStatus, setEditStatus] = useState<FeedbackStatus>('pending')
  const [editNote, setEditNote] = useState('')

  const queryKey = ['admin', 'feedback', { status: statusFilter, offset }]
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey,
    queryFn: () =>
      fetchAllFeedback({
        status: statusFilter === 'all' ? undefined : statusFilter,
        offset,
        limit: PAGE_SIZE,
      }),
  })

  if (isError) return <AdminErrorState onRetry={() => refetch()} />

  const updateMutation = useMutation({
    mutationFn: (args: { id: number; body: { status?: FeedbackStatus; admin_note?: string } }) =>
      updateFeedback(args.id, args.body),
    onSuccess: () => {
      toast.success(t('common.success'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'feedback'] })
      setExpandedId(null)
    },
    onError: (err) => {
      toast.error(getTranslatedApiError(err, t('common.error')))
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const handleExpand = (fb: AdminFeedbackItem) => {
    if (expandedId === fb.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(fb.id)
    setEditStatus(fb.status as FeedbackStatus)
    setEditNote(fb.admin_note ?? '')
  }

  const handleSave = (feedbackId: number) => {
    updateMutation.mutate({
      id: feedbackId,
      body: { status: editStatus, admin_note: editNote || undefined },
    })
  }

  const handleFilterChange = (value: string) => {
    setOffset(0)
    setStatusFilter(value)
  }

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: t('feedback.allStatus') },
      ...STATUSES.map((s) => ({ value: s, label: t(`feedback.status.${s}`) })),
    ],
    [t],
  )

  const columns: Column<AdminFeedbackItem>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', hiddenOnMobile: true, render: (fb) => fb.id },
      {
        key: 'user',
        header: t('feedback.user'),
        hiddenOnMobile: true,
        render: (fb) => (
          <div>
            <div>{fb.user_name ?? '-'}</div>
            <div className="text-xs text-muted-foreground">{fb.user_email}</div>
          </div>
        ),
      },
      {
        key: 'category',
        header: t('feedback.categoryLabel'),
        render: (fb) => (
          <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
            {t(`feedback.categories.${fb.category}`)}
          </span>
        ),
      },
      {
        key: 'content',
        header: t('feedback.contentLabel'),
        className: 'max-w-[300px] truncate',
        render: (fb) => fb.content,
      },
      {
        key: 'status',
        header: t('feedback.statusLabel'),
        render: (fb) => (
          <StatusBadge status={fb.status} label={t(`feedback.status.${fb.status}`)} />
        ),
      },
      {
        key: 'time',
        header: t('feedback.time'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (fb) => new Date(fb.created_at).toLocaleString(),
      },
    ],
    [t],
  )

  const renderExpanded = (fb: AdminFeedbackItem) => (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-medium text-muted-foreground">
          {t('feedback.fullContent')}
        </label>
        <p className="mt-1 whitespace-pre-wrap text-sm">{fb.content}</p>
      </div>

      <div className="flex flex-wrap items-start gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">
            {t('feedback.statusLabel')}
          </label>
          <Select
            value={editStatus}
            onValueChange={(v) => setEditStatus(v as FeedbackStatus)}
          >
            <SelectTrigger className="mt-1 w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {t(`feedback.status.${s}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1">
          <label className="text-xs font-medium text-muted-foreground">
            {t('feedback.adminNote')}
          </label>
          <textarea
            value={editNote}
            onChange={(e) => setEditNote(e.target.value)}
            maxLength={1000}
            rows={2}
            aria-label={t('feedback.adminNote')}
            className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => setExpandedId(null)}>
          {t('common.close')}
        </Button>
        <Button
          disabled={updateMutation.isPending}
          onClick={() => handleSave(fb.id)}
        >
          {updateMutation.isPending ? t('common.loading') : t('feedback.save')}
        </Button>
      </div>
    </div>
  )

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('feedback.title')}</h1>

      <div className="flex items-center gap-3">
        <AdminFilter
          value={statusFilter}
          options={filterOptions}
          onChange={handleFilterChange}
        />
        <span className="text-sm text-muted-foreground">
          {t('feedback.totalCount', { count: total })}
        </span>
      </div>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(fb) => fb.id}
        loading={isLoading}
        onRowClick={handleExpand}
        expandedRowKey={expandedId}
        renderExpanded={renderExpanded}
        renderMobileCard={(fb) => (
          <div className="rounded-xl border bg-card">
            <div
              className="cursor-pointer px-3 py-2.5 space-y-1.5"
              onClick={() => handleExpand(fb)}
            >
              <div className="flex items-center justify-between">
                <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                  {t(`feedback.categories.${fb.category}`)}
                </span>
                <StatusBadge status={fb.status} label={t(`feedback.status.${fb.status}`)} />
              </div>
              <div className="text-sm line-clamp-2">{fb.content}</div>
              <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                <span>{fb.user_email}</span>
                <span>{new Date(fb.created_at).toLocaleString()}</span>
              </div>
            </div>
            {expandedId === fb.id && (
              <div className="border-t bg-muted/20 px-3 py-3">
                {renderExpanded(fb)}
              </div>
            )}
          </div>
        )}
      />

      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  )
}
