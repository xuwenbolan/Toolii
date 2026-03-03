import { api } from '@/services/api'

// ── Types ─────────────────────────────────────────────────

export type DailyTrend = {
  date: string
  value: number
}

export type ToolRanking = {
  tool_name: string
  count: number
}

export type DashboardStats = {
  total_users: number
  new_users_today: number
  active_users_7d: number
  total_revenue: number
  revenue_today: number
  total_tool_uses: number
  tool_uses_today: number
  tool_ranking: ToolRanking[]
  user_trend: DailyTrend[]
  tool_trend: DailyTrend[]
  revenue_trend: DailyTrend[]
}

export type AdminUserItem = {
  id: number
  email: string
  name: string | null
  balance: number
  is_active: boolean
  email_verified: boolean
  is_admin: boolean
  created_at: string
}

export type AdminUserListResponse = {
  items: AdminUserItem[]
  total: number
  limit: number
  offset: number
}

export type AdminLoginHistoryItem = {
  id: number
  ip: string | null
  user_agent: string | null
  created_at: string
}

export type AdminProcessingHistoryItem = {
  id: number
  tool_name: string
  status: string
  created_at: string
}

export type AdminTransactionItem = {
  id: number
  tx_type: string
  amount: number
  balance_before: number
  balance_after: number
  description: string | null
  created_at: string
}

export type AdminUserDetail = {
  id: number
  email: string
  name: string | null
  balance: number
  is_active: boolean
  email_verified: boolean
  is_admin: boolean
  created_at: string
  recent_logins: AdminLoginHistoryItem[]
  recent_transactions: AdminTransactionItem[]
  recent_processing: AdminProcessingHistoryItem[]
}

export type AdminCardItem = {
  id: number
  credits: number
  card_type: string
  status: string
  redeemed_by_user_id: number | null
  redeemed_by_email: string | null
  expires_at: string | null
  redeemed_at: string | null
  created_at: string
}

export type AdminCardListResponse = {
  items: AdminCardItem[]
  total: number
  limit: number
  offset: number
}

export type CardStatusCount = {
  status: string
  count: number
}

export type CardSummaryResponse = {
  status_counts: CardStatusCount[]
  total_credits_issued: number
  total_credits_redeemed: number
}

export type ToolUsageItem = {
  tool_name: string
  date: string
  count: number
  success_count: number
  fail_count: number
}

export type GlobalTransactionItem = {
  id: number
  user_id: number
  user_email: string | null
  tx_type: string
  amount: number
  balance_before: number
  balance_after: number
  description: string | null
  reference_id: string | null
  created_at: string
}

export type GlobalTransactionListResponse = {
  items: GlobalTransactionItem[]
  total: number
  limit: number
  offset: number
}

export type AdminShareLinkItem = {
  id: number
  token: string
  from_user_id: number
  from_user_email: string | null
  to_user_id: number | null
  to_user_email: string | null
  amount: number
  status: string
  expires_at: string | null
  claimed_at: string | null
  created_at: string
}

export type AdminShareLinkListResponse = {
  items: AdminShareLinkItem[]
  total: number
  limit: number
  offset: number
}

export type RevenueItem = {
  period: string
  total_credits: number
  transaction_count: number
}

export type RevenueResponse = {
  items: RevenueItem[]
  total_credits: number
  total_transactions: number
}

// ── Cortex / System types ─────────────────────────────────

export type CortexGpuInfo = {
  name: string
  vram_total_mb: number
  vram_used_mb: number
  vram_free_mb: number
}

export type CortexModelItem = {
  name: string
  status: 'loaded' | 'available' | 'missing'
  required: boolean
  vram_mb: number
  file_size_mb: number | null
  path: string
  last_used?: number
  idle_seconds?: number
}

export type CortexModelsSummary = {
  registered: number
  loaded: number
  vram_used_mb: number
  vram_budget_mb: number
  vram_utilization: number
}

export type CortexModelsResponse = {
  summary: CortexModelsSummary
  models: CortexModelItem[]
  gpu: CortexGpuInfo
  uptime_seconds: number
}

export type CortexHealthResponse = {
  status: string
  gpu: CortexGpuInfo
  models: {
    loaded: string[]
    available: string[]
    vram_estimated_mb: number
  }
  uptime_seconds: number
}

export type CortexStatusResponse = {
  online: boolean
  health: CortexHealthResponse | null
  models: CortexModelsResponse | null
}

export type CortexModelCheckResult = {
  name: string
  healthy: boolean
  required?: boolean
  vram_mb?: number
  path?: string
  file_size_mb?: number
  status?: string
  error?: string
  detail?: string
  idle_seconds?: number
  inputs?: Array<{ name: string; shape: (number | string)[]; dtype: string }>
  outputs?: Array<{ name: string; shape: (number | string)[]; dtype: string }>
  providers?: string[]
}

export type CortexModelsCheckResponse = {
  healthy: boolean
  healthy_count?: number
  total?: number
  models?: CortexModelCheckResult[]
  error?: string
}

// ── API calls ─────────────────────────────────────────────

export async function fetchDashboardStats(days = 30) {
  const res = await api.get<DashboardStats>('/api/admin/dashboard/stats', { params: { days } })
  return res.data
}

export async function fetchAdminUsers(params?: {
  limit?: number
  offset?: number
  search?: string
  is_active?: boolean
}) {
  const res = await api.get<AdminUserListResponse>('/api/admin/users', { params })
  return res.data
}

export async function fetchAdminUserDetail(userId: number) {
  const res = await api.get<AdminUserDetail>(`/api/admin/users/${userId}`)
  return res.data
}

export async function updateUserStatus(userId: number, isActive: boolean) {
  const res = await api.put(`/api/admin/users/${userId}/status`, { is_active: isActive })
  return res.data
}

export async function adjustUserCredits(userId: number, amount: number, description: string) {
  const res = await api.post(`/api/admin/users/${userId}/credits`, { amount, description })
  return res.data
}

export async function fetchAdminCards(params?: {
  limit?: number
  offset?: number
  status?: string
  card_type?: string
}) {
  const res = await api.get<AdminCardListResponse>('/api/admin/cards', { params })
  return res.data
}

export async function generateCards(data: {
  count: number
  credits: number
  card_type?: string
  prefix?: string
  expires_days?: number
}) {
  const res = await api.post<{ codes: string[]; count: number }>('/api/admin/cards/generate', data)
  return res.data
}

export async function disableCard(cardId: number) {
  const res = await api.put(`/api/admin/cards/${cardId}/disable`)
  return res.data
}

export async function fetchCardSummary() {
  const res = await api.get<CardSummaryResponse>('/api/admin/cards/summary')
  return res.data
}

export async function fetchToolUsage(params?: { days?: number; tool_name?: string }) {
  const res = await api.get<{ items: ToolUsageItem[] }>('/api/admin/operations/tool-usage', {
    params,
  })
  return res.data
}

export async function fetchGlobalTransactions(params?: {
  limit?: number
  offset?: number
  tx_type?: string
}) {
  const res = await api.get<GlobalTransactionListResponse>('/api/admin/operations/transactions', {
    params,
  })
  return res.data
}

export async function fetchAdminShareLinks(params?: {
  limit?: number
  offset?: number
  status?: string
}) {
  const res = await api.get<AdminShareLinkListResponse>('/api/admin/operations/share-links', {
    params,
  })
  return res.data
}

export async function fetchRevenue(params?: { granularity?: string; days?: number }) {
  const res = await api.get<RevenueResponse>('/api/admin/operations/revenue', { params })
  return res.data
}

// ── System / Cortex ───────────────────────────────────────

export async function fetchCortexStatus() {
  const res = await api.get<CortexStatusResponse>('/api/admin/system/cortex/status')
  return res.data
}

export async function checkCortexModels() {
  const res = await api.get<CortexModelsCheckResponse>('/api/admin/system/cortex/models/check')
  return res.data
}

export async function checkCortexModel(modelName: string) {
  const res = await api.get<CortexModelCheckResult>(
    `/api/admin/system/cortex/models/${modelName}/check`,
  )
  return res.data
}
