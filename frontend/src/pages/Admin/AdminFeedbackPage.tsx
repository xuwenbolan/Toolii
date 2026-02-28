import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { fetchAllFeedback, updateFeedback } from '@/services/feedbackApi'
import type { AdminFeedbackItem, FeedbackStatus } from '@/services/feedbackApi'

const STATUSES: FeedbackStatus[] = ['pending', 'reviewed', 'resolved']
const PAGE_SIZE = 20

export function AdminFeedbackPage() {
  const { t } = useTranslation('admin')

  const [statusFilter, setStatusFilter] = useState('')
  const [offset, setOffset] = useState(0)
  const [items, setItems] = useState<AdminFeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)

  // Expanded row state
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [editStatus, setEditStatus] = useState<FeedbackStatus>('pending')
  const [editNote, setEditNote] = useState('')
  const [saving, setSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params: { status?: string; offset: number; limit: number } = {
        offset,
        limit: PAGE_SIZE,
      }
      if (statusFilter) params.status = statusFilter
      const res = await fetchAllFeedback(params)
      setItems(res.items)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [statusFilter, offset])

  useEffect(() => {
    load()
  }, [load])

  const handleExpand = (fb: AdminFeedbackItem) => {
    if (expandedId === fb.id) {
      setExpandedId(null)
      return
    }
    setExpandedId(fb.id)
    setEditStatus(fb.status as FeedbackStatus)
    setEditNote(fb.admin_note ?? '')
  }

  const handleSave = async (feedbackId: number) => {
    setSaving(true)
    try {
      await updateFeedback(feedbackId, {
        status: editStatus,
        admin_note: editNote || undefined,
      })
      setExpandedId(null)
      await load()
    } finally {
      setSaving(false)
    }
  }

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      reviewed: 'bg-blue-100 text-blue-800',
      resolved: 'bg-green-100 text-green-800',
    }
    return (
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${colors[s] ?? 'bg-muted'}`}>
        {t(`feedback.status.${s}`)}
      </span>
    )
  }

  const categoryLabel = (c: string) => t(`feedback.categories.${c}`)

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{t('feedback.title')}</h2>

      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => {
            setOffset(0)
            setStatusFilter(e.target.value)
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="">{t('feedback.allStatus')}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`feedback.status.${s}`)}
            </option>
          ))}
        </select>
        <span className="text-sm text-muted-foreground">
          {t('feedback.totalCount', { count: total })}
        </span>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.noData')}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">{t('feedback.user')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('feedback.categoryLabel')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('feedback.contentLabel')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('feedback.statusLabel')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('feedback.time')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((fb, i) => (
                  <>
                    <tr
                      key={fb.id}
                      className={`cursor-pointer transition-colors hover:bg-muted/50 ${i % 2 === 0 ? '' : 'bg-muted/30'}`}
                      onClick={() => handleExpand(fb)}
                    >
                      <td className="px-3 py-2">{fb.id}</td>
                      <td className="px-3 py-2">
                        <div>{fb.user_name ?? '-'}</div>
                        <div className="text-xs text-muted-foreground">{fb.user_email}</div>
                      </td>
                      <td className="px-3 py-2">
                        <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                          {categoryLabel(fb.category)}
                        </span>
                      </td>
                      <td className="max-w-[300px] truncate px-3 py-2">{fb.content}</td>
                      <td className="px-3 py-2">{statusBadge(fb.status)}</td>
                      <td className="whitespace-nowrap px-3 py-2">
                        {new Date(fb.created_at).toLocaleString()}
                      </td>
                    </tr>
                    {expandedId === fb.id && (
                      <tr key={`${fb.id}-expand`}>
                        <td colSpan={6} className="border-t bg-muted/20 px-4 py-4">
                          <div className="space-y-4">
                            {/* Full content */}
                            <div>
                              <label className="text-xs font-medium text-muted-foreground">
                                {t('feedback.fullContent')}
                              </label>
                              <p className="mt-1 whitespace-pre-wrap text-sm">{fb.content}</p>
                            </div>

                            {/* Status + Note edit */}
                            <div className="flex flex-wrap items-start gap-4">
                              <div>
                                <label className="text-xs font-medium text-muted-foreground">
                                  {t('feedback.statusLabel')}
                                </label>
                                <select
                                  value={editStatus}
                                  onChange={(e) => setEditStatus(e.target.value as FeedbackStatus)}
                                  className="mt-1 block rounded-md border bg-background px-2 py-1.5 text-sm"
                                >
                                  {STATUSES.map((s) => (
                                    <option key={s} value={s}>
                                      {t(`feedback.status.${s}`)}
                                    </option>
                                  ))}
                                </select>
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
                                  className="mt-1 w-full resize-none rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setExpandedId(null)}
                                className="rounded-md border px-3 py-1.5 text-sm"
                              >
                                {t('common.close')}
                              </button>
                              <button
                                type="button"
                                disabled={saving}
                                onClick={() => handleSave(fb.id)}
                                className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
                              >
                                {saving ? t('common.loading') : t('feedback.save')}
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
