import { api } from '@/services/api'

export type HistoryItem = {
  id: number
  tool_name: string
  status: string
  created_at: string
}

export type HistoryListResponse = {
  items: HistoryItem[]
  total: number
  limit: number
  offset: number
}

export async function fetchHistory(opts: { limit?: number; offset?: number } = {}) {
  const params = new URLSearchParams()
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))

  const res = await api.get<HistoryListResponse>(`/api/history?${params.toString()}`)
  return res.data
}
