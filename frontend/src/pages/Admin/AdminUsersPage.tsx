import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { ConfirmDialog, DataTable, Pagination, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getTranslatedApiError } from '@/lib/apiErrors'
import { fetchAdminUsers, updateUserStatus } from '@/services/adminApi'
import type { AdminUserItem } from '@/services/adminApi'

const PAGE_SIZE = 20

type StatusFilter = 'all' | 'active' | 'disabled'

export function AdminUsersPage() {
  const { t } = useTranslation('admin')
  const queryClient = useQueryClient()

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [offset, setOffset] = useState(0)

  // Confirm dialog state
  const [confirmUser, setConfirmUser] = useState<AdminUserItem | null>(null)

  const queryKey = ['admin', 'users', { search, status: statusFilter, offset }]
  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: () => {
      const params: Parameters<typeof fetchAdminUsers>[0] = {
        limit: PAGE_SIZE,
        offset,
        search: search || undefined,
      }
      if (statusFilter === 'active') params.is_active = true
      if (statusFilter === 'disabled') params.is_active = false
      return fetchAdminUsers(params)
    },
  })

  const toggleMutation = useMutation({
    mutationFn: (user: AdminUserItem) => updateUserStatus(user.id, !user.is_active),
    onSuccess: () => {
      toast.success(t('common.success'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setConfirmUser(null)
    },
    onError: (err) => {
      toast.error(getTranslatedApiError(err, t('common.error')))
      setConfirmUser(null)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const handleSearchChange = (value: string) => {
    setSearch(value)
    setOffset(0)
  }

  const handleStatusFilterChange = (filter: StatusFilter) => {
    setStatusFilter(filter)
    setOffset(0)
  }

  const filterButtons: { key: StatusFilter; label: string }[] = [
    { key: 'all', label: t('users.filterAll') },
    { key: 'active', label: t('users.filterActive') },
    { key: 'disabled', label: t('users.filterDisabled') },
  ]

  const columns: Column<AdminUserItem>[] = useMemo(
    () => [
      { key: 'id', header: t('users.id'), render: (u) => u.id },
      { key: 'email', header: t('users.email'), render: (u) => u.email },
      { key: 'name', header: t('users.name'), render: (u) => u.name ?? '-' },
      { key: 'balance', header: t('users.balance'), render: (u) => u.balance },
      {
        key: 'status',
        header: t('users.status'),
        render: (u) => (
          <StatusBadge
            status={u.is_active ? 'active' : 'disabled'}
            label={u.is_active ? t('users.active') : t('users.disabled')}
          />
        ),
      },
      {
        key: 'createdAt',
        header: t('users.createdAt'),
        className: 'whitespace-nowrap',
        render: (u) => new Date(u.created_at).toLocaleString(),
      },
      {
        key: 'actions',
        header: t('users.actions'),
        render: (u) => (
          <div className="flex items-center gap-2">
            <Link to={`/admin/users/${u.id}`} className="text-primary hover:underline text-sm">
              {t('users.viewDetail')}
            </Link>
            {u.is_admin ? (
              <StatusBadge status="reviewed" label={t('users.detail.admin')} />
            ) : (
              <Button
                variant={u.is_active ? 'destructive' : 'default'}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation()
                  setConfirmUser(u)
                }}
              >
                {u.is_active ? t('users.disable') : t('users.enable')}
              </Button>
            )}
          </div>
        ),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t('users.title')}</h1>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          placeholder={t('users.searchPlaceholder')}
          value={search}
          onChange={(e) => handleSearchChange(e.target.value)}
          className="sm:w-72"
        />
        <div className="flex gap-1">
          {filterButtons.map((btn) => (
            <Button
              key={btn.key}
              variant={statusFilter === btn.key ? 'default' : 'ghost'}
              size="sm"
              onClick={() => handleStatusFilterChange(btn.key)}
            >
              {btn.label}
            </Button>
          ))}
        </div>
      </div>

      <DataTable
        columns={columns}
        data={items}
        rowKey={(u) => u.id}
        loading={isLoading}
      />

      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />

      <ConfirmDialog
        open={confirmUser !== null}
        onOpenChange={(open) => { if (!open) setConfirmUser(null) }}
        title={t('common.confirmAction')}
        description={
          confirmUser
            ? confirmUser.is_active
              ? `${t('users.disable')} ${confirmUser.email}?`
              : `${t('users.enable')} ${confirmUser.email}?`
            : ''
        }
        variant={confirmUser?.is_active ? 'destructive' : 'default'}
        loading={toggleMutation.isPending}
        onConfirm={() => { if (confirmUser) toggleMutation.mutate(confirmUser) }}
      />
    </div>
  )
}
