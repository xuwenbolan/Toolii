import { api } from '@/services/api'

export type CreditBalanceResponse = {
  balance: number
}

export type CreditTransactionItem = {
  id: number
  tx_type: string
  amount: number
  balance_before: number
  balance_after: number
  description: string | null
  reference_id: string | null
  created_at: string
}

export type CreditTransactionsResponse = {
  items: CreditTransactionItem[]
  total: number
  limit: number
  offset: number
}

export type RedeemCreditsResponse = {
  added_credits: number
  balance: number
  card_type: string
}

export type ShareLinkItem = {
  id: number
  token: string
  amount: number
  status: string
  from_user_id: number
  to_user_id: number | null
  expires_at: string | null
  claimed_at: string | null
  canceled_at: string | null
  created_at: string
}

export type ShareCreateResponse = {
  link: ShareLinkItem
  share_path: string
  balance_after: number
}

export type ShareInfoResponse = {
  token: string
  amount: number
  status: string
  expires_at: string | null
  claimed_at: string | null
  canceled_at: string | null
  created_at: string
  can_claim: boolean
}

export type ShareClaimResponse = {
  message: string
  amount: number
  balance: number
}

export type ShareLinksResponse = {
  items: ShareLinkItem[]
  total: number
}

export type ShareCancelResponse = {
  message: string
  balance: number
}

export async function fetchCreditsBalance() {
  const res = await api.get<CreditBalanceResponse>('/api/credits/balance')
  return res.data
}

export async function fetchCreditTransactions(params?: { limit?: number; offset?: number }) {
  const res = await api.get<CreditTransactionsResponse>('/api/credits/transactions', {
    params,
  })
  return res.data
}

export async function redeemCredits(code: string) {
  const res = await api.post<RedeemCreditsResponse>('/api/credits/redeem', { code })
  return res.data
}

export async function createShareLink(amount: number) {
  const res = await api.post<ShareCreateResponse>('/api/share/create', { amount })
  return res.data
}

export async function getShareInfo(token: string) {
  const res = await api.get<ShareInfoResponse>(`/api/share/info/${token}`)
  return res.data
}

export async function claimShareLink(token: string) {
  const res = await api.post<ShareClaimResponse>(`/api/share/claim/${token}`)
  return res.data
}

export async function fetchShareLinks(params?: { limit?: number; offset?: number }) {
  const res = await api.get<ShareLinksResponse>('/api/share/links', { params })
  return res.data
}

export async function cancelShareLink(linkId: number) {
  const res = await api.delete<ShareCancelResponse>(`/api/share/${linkId}`)
  return res.data
}
