import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link, useParams } from 'react-router-dom'

import {
  adjustUserCredits,
  fetchAdminUserDetail,
  updateUserStatus,
} from '@/services/adminApi'
import type { AdminUserDetail } from '@/services/adminApi'

export function AdminUserDetailPage() {
  const { t } = useTranslation('admin')
  const { id } = useParams<{ id: string }>()

  const [user, setUser] = useState<AdminUserDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [statusToggling, setStatusToggling] = useState(false)

  // Adjust credits form state
  const [creditAmount, setCreditAmount] = useState('')
  const [creditDesc, setCreditDesc] = useState('')
  const [adjusting, setAdjusting] = useState(false)
  const [adjustMsg, setAdjustMsg] = useState('')

  const loadUser = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await fetchAdminUserDetail(Number(id))
      setUser(res)
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    void loadUser()
  }, [loadUser])

  const handleToggleStatus = async () => {
    if (!user || statusToggling) return
    setStatusToggling(true)
    try {
      await updateUserStatus(user.id, !user.is_active)
      void loadUser()
    } finally {
      setStatusToggling(false)
    }
  }

  const handleAdjustCredits = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!user || adjusting) return
    const amount = Number(creditAmount)
    if (!amount || !creditDesc.trim()) return
    setAdjusting(true)
    setAdjustMsg('')
    try {
      await adjustUserCredits(user.id, amount, creditDesc.trim())
      setAdjustMsg(t('users.detail.adjustSuccess'))
      setCreditAmount('')
      setCreditDesc('')
      void loadUser()
    } finally {
      setAdjusting(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t('common.loading')}
      </div>
    )
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t('common.noData')}
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <Link to="/admin/users" className="text-sm text-primary hover:underline">
        &larr; {t('users.detail.back')}
      </Link>

      {/* Basic info card */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">{t('users.detail.basicInfo')}</h2>
        <div className="grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">{t('users.email')}: </span>
            <span className="font-medium">{user.email}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('users.name')}: </span>
            <span className="font-medium">{user.name ?? '-'}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('users.balance')}: </span>
            <span className="font-medium">{user.balance}</span>
          </div>
          <div>
            <span className="text-muted-foreground">{t('users.status')}: </span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                user.is_active
                  ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                  : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
              }`}
            >
              {user.is_active ? t('users.active') : t('users.disabled')}
            </span>
            {!user.is_admin && (
              <button
                type="button"
                disabled={statusToggling}
                onClick={() => void handleToggleStatus()}
                className={`ml-2 rounded-md px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  user.is_active
                    ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                    : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                }`}
              >
                {user.is_active ? t('users.disable') : t('users.enable')}
              </button>
            )}
          </div>
          <div>
            <span className="text-muted-foreground">{t('users.createdAt')}: </span>
            <span className="font-medium">{new Date(user.created_at).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-2">
            {user.is_admin && (
              <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                {t('users.detail.admin')}
              </span>
            )}
            {user.email_verified && (
              <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-900/30 dark:text-blue-400">
                {t('users.detail.emailVerified')}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Adjust credits */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">{t('users.detail.adjustCredits')}</h2>
        <form onSubmit={(e) => void handleAdjustCredits(e)} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">
              {t('users.detail.adjustAmount')}
            </label>
            <input
              type="number"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
              className="w-32 rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs text-muted-foreground">
              {t('users.detail.adjustDesc')}
            </label>
            <input
              type="text"
              value={creditDesc}
              onChange={(e) => setCreditDesc(e.target.value)}
              className="w-full min-w-[200px] rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary"
              required
            />
          </div>
          <button
            type="submit"
            disabled={adjusting}
            className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
          >
            {t('users.detail.adjustSubmit')}
          </button>
        </form>
        {adjustMsg && (
          <p className="mt-2 text-sm text-green-600 dark:text-green-400">{adjustMsg}</p>
        )}
      </div>

      {/* Recent Logins */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">{t('users.detail.recentLogins')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('users.detail.loginIp')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.loginUserAgent')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.loginTime')}</th>
              </tr>
            </thead>
            <tbody>
              {user.recent_logins.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                user.recent_logins.map((login) => (
                  <tr key={login.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="px-4 py-3">{login.ip ?? '-'}</td>
                    <td className="max-w-xs truncate px-4 py-3" title={login.user_agent ?? ''}>
                      {login.user_agent ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(login.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Transactions */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">{t('users.detail.recentTransactions')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('users.detail.txType')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.txAmount')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.txBalanceBefore')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.txBalanceAfter')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.txDescription')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.txTime')}</th>
              </tr>
            </thead>
            <tbody>
              {user.recent_transactions.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                user.recent_transactions.map((tx) => (
                  <tr key={tx.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="px-4 py-3">{tx.tx_type}</td>
                    <td className={`px-4 py-3 font-medium ${tx.amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {tx.amount >= 0 ? '+' : ''}{tx.amount}
                    </td>
                    <td className="px-4 py-3">{tx.balance_before}</td>
                    <td className="px-4 py-3">{tx.balance_after}</td>
                    <td className="max-w-xs truncate px-4 py-3" title={tx.description ?? ''}>
                      {tx.description ?? '-'}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(tx.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Recent Processing */}
      <div className="rounded-xl border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold">{t('users.detail.recentProcessing')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('users.detail.procTool')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.procStatus')}</th>
                <th className="px-4 py-3 font-medium">{t('users.detail.procTime')}</th>
              </tr>
            </thead>
            <tbody>
              {user.recent_processing.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-muted-foreground">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                user.recent_processing.map((proc) => (
                  <tr key={proc.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="px-4 py-3">{proc.tool_name}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          proc.status === 'done'
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : proc.status === 'failed'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                              : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-400'
                        }`}
                      >
                        {proc.status}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {new Date(proc.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
