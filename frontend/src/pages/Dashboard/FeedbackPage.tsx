import { useState, useEffect, useCallback } from 'react'
import { useTranslation } from 'react-i18next'

import { submitFeedback, fetchMyFeedback } from '@/services/feedbackApi'
import type { FeedbackItem, FeedbackCategory } from '@/services/feedbackApi'

const CATEGORIES: FeedbackCategory[] = ['feature_request', 'bug_report', 'suggestion', 'other']

const PAGE_SIZE = 10

export function FeedbackPage() {
  const { t } = useTranslation('common')

  const [category, setCategory] = useState<FeedbackCategory>('suggestion')
  const [content, setContent] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [submitMsg, setSubmitMsg] = useState('')

  const [items, setItems] = useState<FeedbackItem[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetchMyFeedback({ offset, limit: PAGE_SIZE })
      setItems(res.items)
      setTotal(res.total)
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => {
    load()
  }, [load])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!content.trim()) return
    setSubmitting(true)
    setSubmitMsg('')
    try {
      await submitFeedback(category, content.trim())
      setContent('')
      setSubmitMsg(t('feedback.submitSuccess'))
      setOffset(0)
      await load()
    } catch {
      setSubmitMsg(t('feedback.submitFailed'))
    } finally {
      setSubmitting(false)
    }
  }

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
      reviewed: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
      resolved: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    }
    return (
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${colors[s] ?? 'bg-muted'}`}>
        {t(`feedback.status.${s}`)}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{t('feedback.title')}</h2>

      {/* Submit form */}
      <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="text-sm font-medium">{t('feedback.category')}</label>
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value as FeedbackCategory)}
            className="rounded-md border bg-background px-2 py-1.5 text-sm"
          >
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {t(`feedback.categories.${c}`)}
              </option>
            ))}
          </select>
        </div>
        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          maxLength={1000}
          rows={4}
          placeholder={t('feedback.placeholder')}
          className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{content.length}/1000</span>
          <div className="flex items-center gap-3">
            {submitMsg && (
              <span className={`text-sm ${submitMsg.includes(t('feedback.submitSuccess')) ? 'text-green-600' : 'text-red-500'}`}>
                {submitMsg}
              </span>
            )}
            <button
              type="submit"
              disabled={submitting || !content.trim()}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {submitting ? t('feedback.submitting') : t('feedback.submit')}
            </button>
          </div>
        </div>
      </form>

      {/* My feedback list */}
      <div className="space-y-3">
        <h3 className="text-base font-medium">{t('feedback.myFeedback')}</h3>

        {loading ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('feedback.loading')}
          </div>
        ) : items.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {t('feedback.noFeedback')}
          </div>
        ) : (
          <>
            <div className="space-y-3">
              {items.map((fb) => (
                <div key={fb.id} className="rounded-xl border bg-card p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">
                        {t(`feedback.categories.${fb.category}`)}
                      </span>
                      {statusBadge(fb.status)}
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {new Date(fb.created_at).toLocaleString()}
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm">{fb.content}</p>
                  {fb.admin_note && (
                    <div className="mt-3 rounded-md border-l-2 border-primary/50 bg-muted/50 px-3 py-2">
                      <span className="text-xs font-medium text-muted-foreground">
                        {t('feedback.adminReply')}
                      </span>
                      <p className="mt-1 whitespace-pre-wrap text-sm">{fb.admin_note}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {total > PAGE_SIZE && (
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
                    {t('feedback.previous')}
                  </button>
                  <button
                    type="button"
                    disabled={offset + PAGE_SIZE >= total}
                    onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
                    className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
                  >
                    {t('feedback.next')}
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
