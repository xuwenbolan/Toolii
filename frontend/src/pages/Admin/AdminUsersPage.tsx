import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import {
  fetchAdminUsers,
  updateUserStatus,
} from '@/services/adminApi'
import type { AdminUserItem, AdminUserListResponse } from '@/services/adminApi'

const PAGE_SIZE = 20

type StatusFilter = 'all' | 'active' | 'disabled'

export function AdminUsersPage() {
  const { t } = useTranslation('admin')

  const [data, setData] = useState<AdminUserListResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [offset, setOffset] = useState(0)
  // Track which user IDs are currently being toggled to disable double-clicks
  const [toggling, setToggling] = useState<Set<number>>(new Set())

  const loadUsers = useCallback(async () => {
    setLoading(true)
    try {
      const params: Parameters<typeof fetchAdminUsers>[0] = {
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
      }
      if (statusFilter === 'active') params.is_active = true
      if (statusFilter === 'disabled') params.is_active = false
      const res = await fetchAdminUsers(params)
      setData(res)
    } finally {
      setLoading(false)
    }
  }, [offset, search, statusFilter])

  useEffect(() => {
    void loadUsers()
  }, [loadUsers])

  // Reset offset when filters change
  useEffect(() => {
    setOffset(0)
  }, [search, statusFilter])

  const handleToggleStatus = async (user: AdminUserItem) => {
    if (toggling.has(user.id)) return
    setToggling((prev) => new Set(prev).add(user.id))
    try {
      await updateUserStatus(user.id, !user.is_active)
      void loadUsers()
    } finally {
      setToggling((prev) => {
        const next = new Set(prev)
        next.delete(user.id)
        return next
      })
    }
  }

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('users.filterAll') },
    { key: 'active', label: t('users.filterActive') },
    { key: 'disabled', label: t('users.filterDisabled') },
  ]

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1

  return (
    <div className="space-y-6">
      {/* Header */}
      <h1 className="text-2xl font-bold">{t('users.title')}</h1>

      {/* Search and filter bar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="text"
          placeholder={t('users.searchPlaceholder')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="rounded-lg border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary sm:w-72"
        />
        <div className="flex gap-1">
          {filterButtons.map((btn) => (
            <button
              key={btn.key}
              type="button"
              onClick={() => setStatusFilter(btn.key)}
              className={`rounded-md px-3 py-1 text-sm transition-colors ${
                statusFilter === btn.key
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="px-4 py-3 font-medium">{t('users.id')}</th>
                <th className="px-4 py-3 font-medium">{t('users.email')}</th>
                <th className="px-4 py-3 font-medium">{t('users.name')}</th>
                <th className="px-4 py-3 font-medium">{t('users.balance')}</th>
                <th className="px-4 py-3 font-medium">{t('users.status')}</th>
                <th className="px-4 py-3 font-medium">{t('users.createdAt')}</th>
                <th className="px-4 py-3 font-medium">{t('users.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t('common.loading')}
                  </td>
                </tr>
              ) : !data || data.items.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                    {t('common.noData')}
                  </td>
                </tr>
              ) : (
                data.items.map((user) => (
                  <tr key={user.id} className="border-b last:border-b-0 hover:bg-muted/50">
                    <td className="px-4 py-3">{user.id}</td>
                    <td className="px-4 py-3">{user.email}</td>
                    <td className="px-4 py-3">{user.name ?? '-'}</td>
                    <td className="px-4 py-3">{user.balance}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                          user.is_active
                            ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                            : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                        }`}
                      >
                        {user.is_active ? t('users.active') : t('users.disabled')}
                      </span>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {new Date(user.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <Link
                          to={`/admin/users/${user.id}`}
                          className="text-primary hover:underline"
                        >
                          {t('users.viewDetail')}
                        </Link>
                        {user.is_admin ? (
                          <span className="rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-400">
                            {t('users.detail.admin')}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={toggling.has(user.id)}
                            onClick={() => void handleToggleStatus(user)}
                            className={`rounded-md px-2 py-0.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                              user.is_active
                                ? 'bg-red-100 text-red-700 hover:bg-red-200 dark:bg-red-900/30 dark:text-red-400 dark:hover:bg-red-900/50'
                                : 'bg-green-100 text-green-700 hover:bg-green-200 dark:bg-green-900/30 dark:text-green-400 dark:hover:bg-green-900/50'
                            }`}
                          >
                            {user.is_active ? t('users.disable') : t('users.enable')}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {data && data.total > PAGE_SIZE && (
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">
            {currentPage} / {totalPages}
          </span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0}
              onClick={() => setOffset((prev) => Math.max(0, prev - PAGE_SIZE))}
              className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t('common.previous')}
            </button>
            <button
              type="button"
              disabled={offset + PAGE_SIZE >= data.total}
              onClick={() => setOffset((prev) => prev + PAGE_SIZE)}
              className="rounded-md border px-3 py-1 text-sm transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t('common.next')}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
