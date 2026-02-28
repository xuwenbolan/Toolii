import { api } from '@/services/api'

// ── Types ─────────────────────────────────────────────────

export type FeedbackCategory = 'feature_request' | 'bug_report' | 'suggestion' | 'other'
export type FeedbackStatus = 'pending' | 'reviewed' | 'resolved'

export type FeedbackItem = {
  id: number
  category: string
  content: string
  status: string
  admin_note: string | null
  created_at: string
}

export type FeedbackListResponse = {
  items: FeedbackItem[]
  total: number
}

export type AdminFeedbackItem = {
  id: number
  user_id: number
  user_email: string
  user_name: string | null
  category: string
  content: string
  status: string
  admin_note: string | null
  created_at: string
}

export type AdminFeedbackListResponse = {
  items: AdminFeedbackItem[]
  total: number
}

// ── User APIs ─────────────────────────────────────────────

export async function submitFeedback(category: FeedbackCategory, content: string) {
  const { data } = await api.post<FeedbackItem>('/api/v1/feedback/', { category, content })
  return data
}

export async function fetchMyFeedback(params: { offset?: number; limit?: number } = {}) {
  const { data } = await api.get<FeedbackListResponse>('/api/v1/feedback/', { params })
  return data
}

// ── Admin APIs ────────────────────────────────────────────

export async function fetchAllFeedback(
  params: { status?: string; offset?: number; limit?: number } = {},
) {
  const { data } = await api.get<AdminFeedbackListResponse>('/api/v1/admin/feedback/', { params })
  return data
}

export async function updateFeedback(
  feedbackId: number,
  body: { status?: FeedbackStatus; admin_note?: string },
) {
  const { data } = await api.put<FeedbackItem>(`/api/v1/admin/feedback/${feedbackId}`, body)
  return data
}
