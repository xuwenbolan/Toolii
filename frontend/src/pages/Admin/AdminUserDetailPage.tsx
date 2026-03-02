import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { toast } from 'sonner'

import { ConfirmDialog, DataTable, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { getTranslatedApiError } from '@/lib/apiErrors'
import {
  adjustUserCredits,
  fetchAdminUserDetail,
  updateUserStatus,
} from '@/services/adminApi'
import type {
  AdminLoginHistoryItem,
  AdminProcessingHistoryItem,
  AdminTransactionItem,
} from '@/services/adminApi'

export function AdminUserDetailPage() {
  const { t } = useTranslation('admin')
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()

  const [creditAmount, setCreditAmount] = useState('')
  const [creditDesc, setCreditDesc] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)

  const queryKey = ['admin', 'user-detail', id]
  const { data: user, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchAdminUserDetail(Number(id)),
    enabled: !!id,
  })

  const toggleMutation = useMutation({
    mutationFn: () => updateUserStatus(user!.id, !user!.is_active),
    onSuccess: () => {
      toast.success(t('common.success'))
      queryClient.invalidateQueries({ queryKey: ['admin', 'user-detail', id] })
      queryClient.invalidateQueries({ queryKey: ['admin', 'users'] })
      setShowConfirm(false)
    },
    onError: (err) => {
      toast.error(getTranslatedApiError(err, t('common.error')))
      setShowConfirm(false)
    },
  })

  const adjustMutation = useMutation({
    mutationFn: (args: { amount: number; description: string }) =>
      adjustUserCredits(user!.id, args.amount, args.description),
    onSuccess: () => {
      toast.success(t('users.detail.adjustSuccess'))
      setCreditAmount('')
      setCreditDesc('')
      queryClient.invalidateQueries({ queryKey: ['admin', 'user-detail', id] })
    },
    onError: (err) => {
      toast.error(getTranslatedApiError(err, t('common.error')))
    },
  })

  const handleAdjustCredits = (e: React.FormEvent) => {
    e.preventDefault()
    const amount = Number(creditAmount)
    if (!amount || !creditDesc.trim()) return
    adjustMutation.mutate({ amount, description: creditDesc.trim() })
  }

  const loginColumns: Column<AdminLoginHistoryItem>[] = useMemo(
    () => [
      { key: 'ip', header: t('users.detail.loginIp'), render: (l) => l.ip ?? '-' },
      {
        key: 'ua',
        header: t('users.detail.loginUserAgent'),
        className: 'max-w-xs truncate',
        render: (l) => (
          <span title={l.user_agent ?? ''}>{l.user_agent ?? '-'}</span>
        ),
      },
      {
        key: 'time',
        header: t('users.detail.loginTime'),
        className: 'whitespace-nowrap',
        render: (l) => new Date(l.created_at).toLocaleString(),
      },
    ],
    [t],
  )

  const txColumns: Column<AdminTransactionItem>[] = useMemo(
    () => [
      { key: 'type', header: t('users.detail.txType'), render: (tx) => tx.tx_type },
      {
        key: 'amount',
        header: t('users.detail.txAmount'),
        render: (tx) => (
          <span className={tx.amount >= 0 ? 'text-success' : 'text-destructive'}>
            {tx.amount >= 0 ? '+' : ''}{tx.amount}
          </span>
        ),
      },
      { key: 'before', header: t('users.detail.txBalanceBefore'), render: (tx) => tx.balance_before },
      { key: 'after', header: t('users.detail.txBalanceAfter'), render: (tx) => tx.balance_after },
      {
        key: 'desc',
        header: t('users.detail.txDescription'),
        className: 'max-w-xs truncate',
        render: (tx) => (
          <span title={tx.description ?? ''}>{tx.description ?? '-'}</span>
        ),
      },
      {
        key: 'time',
        header: t('users.detail.txTime'),
        className: 'whitespace-nowrap',
        render: (tx) => new Date(tx.created_at).toLocaleString(),
      },
    ],
    [t],
  )

  const procColumns: Column<AdminProcessingHistoryItem>[] = useMemo(
    () => [
      { key: 'tool', header: t('users.detail.procTool'), render: (p) => p.tool_name },
      {
        key: 'status',
        header: t('users.detail.procStatus'),
        render: (p) => <StatusBadge status={p.status} />,
      },
      {
        key: 'time',
        header: t('users.detail.procTime'),
        className: 'whitespace-nowrap',
        render: (p) => new Date(p.created_at).toLocaleString(),
      },
    ],
    [t],
  )

  if (isLoading) {
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
      <Link to="/admin/users" className="text-sm text-primary hover:underline">
        &larr; {t('users.detail.back')}
      </Link>

      {/* Basic info */}
      <Card>
        <CardHeader>
          <CardTitle>{t('users.detail.basicInfo')}</CardTitle>
        </CardHeader>
        <CardContent>
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
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{t('users.status')}: </span>
              <StatusBadge
                status={user.is_active ? 'active' : 'disabled'}
                label={user.is_active ? t('users.active') : t('users.disabled')}
              />
              {!user.is_admin && (
                <Button
                  variant={user.is_active ? 'destructive' : 'default'}
                  size="sm"
                  onClick={() => setShowConfirm(true)}
                >
                  {user.is_active ? t('users.disable') : t('users.enable')}
                </Button>
              )}
            </div>
            <div>
              <span className="text-muted-foreground">{t('users.createdAt')}: </span>
              <span className="font-medium">{new Date(user.created_at).toLocaleString()}</span>
            </div>
            <div className="flex items-center gap-2">
              {user.is_admin && (
                <StatusBadge status="reviewed" label={t('users.detail.admin')} />
              )}
              {user.email_verified && (
                <StatusBadge status="claimed" label={t('users.detail.emailVerified')} />
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Adjust credits */}
      <Card>
        <CardHeader>
          <CardTitle>{t('users.detail.adjustCredits')}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleAdjustCredits} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                {t('users.detail.adjustAmount')}
              </label>
              <Input
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                className="w-32"
                required
              />
            </div>
            <div className="flex-1">
              <label className="mb-1 block text-xs text-muted-foreground">
                {t('users.detail.adjustDesc')}
              </label>
              <Input
                type="text"
                value={creditDesc}
                onChange={(e) => setCreditDesc(e.target.value)}
                className="min-w-[200px]"
                required
              />
            </div>
            <Button type="submit" disabled={adjustMutation.isPending}>
              {t('users.detail.adjustSubmit')}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Recent Logins */}
      <Card>
        <CardHeader>
          <CardTitle>{t('users.detail.recentLogins')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={loginColumns}
            data={user.recent_logins}
            rowKey={(l) => l.id}
          />
        </CardContent>
      </Card>

      {/* Recent Transactions */}
      <Card>
        <CardHeader>
          <CardTitle>{t('users.detail.recentTransactions')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={txColumns}
            data={user.recent_transactions}
            rowKey={(tx) => tx.id}
          />
        </CardContent>
      </Card>

      {/* Recent Processing */}
      <Card>
        <CardHeader>
          <CardTitle>{t('users.detail.recentProcessing')}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <DataTable
            columns={procColumns}
            data={user.recent_processing}
            rowKey={(p) => p.id}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        title={t('common.confirmAction')}
        description={
          user.is_active
            ? `${t('users.disable')} ${user.email}?`
            : `${t('users.enable')} ${user.email}?`
        }
        variant={user.is_active ? 'destructive' : 'default'}
        loading={toggleMutation.isPending}
        onConfirm={() => toggleMutation.mutate()}
      />
    </div>
  )
}
