import { useState, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts'

import { AdminFilter, DataTable, Pagination, StatusBadge } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  fetchToolUsage,
  fetchGlobalTransactions,
  fetchAdminShareLinks,
  fetchRevenue,
} from '@/services/adminApi'
import type {
  ToolUsageItem,
  GlobalTransactionItem,
  AdminShareLinkItem,
  RevenueItem,
} from '@/services/adminApi'

const PAGE_SIZE = 20

// -- Tab 1: Tool Usage -------------------------------------------------------

function ToolUsageTab() {
  const { t } = useTranslation('admin')
  const isMobile = useIsMobile()
  const [days, setDays] = useState(30)
  const [toolName, setToolName] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'tool-usage', { days, toolName }],
    queryFn: () => {
      const params: { days?: number; tool_name?: string } = { days }
      if (toolName) params.tool_name = toolName
      return fetchToolUsage(params)
    },
  })

  const items = data?.items ?? []

  const toolNames = useMemo(() => {
    const names = new Set(items.map((d) => d.tool_name))
    return Array.from(names).sort()
  }, [items])

  const chartData = useMemo(() => {
    const map = new Map<string, { date: string; success: number; fail: number }>()
    for (const item of items) {
      const existing = map.get(item.date)
      if (existing) {
        existing.success += item.success_count
        existing.fail += item.fail_count
      } else {
        map.set(item.date, { date: item.date, success: item.success_count, fail: item.fail_count })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [items])

  const toolFilterOptions = useMemo(
    () => [
      { value: 'all', label: t('operations.toolUsage.allTools') },
      ...toolNames.map((n) => ({ value: n, label: n })),
    ],
    [t, toolNames],
  )

  const columns: Column<ToolUsageItem>[] = useMemo(
    () => [
      { key: 'tool', header: t('operations.toolUsage.tool'), render: (i) => i.tool_name },
      { key: 'date', header: t('operations.toolUsage.date'), render: (i) => i.date },
      { key: 'total', header: t('operations.toolUsage.total'), align: 'right', render: (i) => i.count },
      {
        key: 'success',
        header: t('operations.toolUsage.success'),
        align: 'right',
        render: (i) => <span className="text-success">{i.success_count}</span>,
      },
      {
        key: 'fail',
        header: t('operations.toolUsage.fail'),
        align: 'right',
        render: (i) => <span className="text-destructive">{i.fail_count}</span>,
      },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          {t('operations.toolUsage.days')}
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 30)}
            className="w-20"
          />
        </label>
        <AdminFilter
          value={toolName || 'all'}
          options={toolFilterOptions}
          onChange={(v) => setToolName(v === 'all' ? '' : v)}
        />
      </div>

      {!isLoading && items.length > 0 && (
        <div className="rounded-xl border bg-card p-4">
          <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="date"
                tick={{ fontSize: isMobile ? 10 : 12 }}
                interval={isMobile ? 'preserveStartEnd' : undefined}
                angle={isMobile ? -45 : 0}
                textAnchor={isMobile ? 'end' : 'middle'}
                height={isMobile ? 50 : 30}
              />
              <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 30 : 60} />
              <Tooltip />
              <Legend />
              <Bar dataKey="success" stackId="a" fill="var(--success)" name={t('operations.toolUsage.success')} />
              <Bar dataKey="fail" stackId="a" fill="var(--destructive)" name={t('operations.toolUsage.fail')} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <DataTable
        columns={columns}
        data={items}
        rowKey={(i) => `${i.tool_name}-${i.date}`}
        loading={isLoading}
      />
    </div>
  )
}

// -- Tab 2: Transactions -----------------------------------------------------

const TX_TYPES = ['redeem', 'consume', 'admin_adjust', 'share_send', 'share_receive']

function TransactionsTab() {
  const { t } = useTranslation('admin')
  const [txType, setTxType] = useState('all')
  const [offset, setOffset] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'transactions', { txType, offset }],
    queryFn: () => {
      const params: { limit: number; offset: number; tx_type?: string } = { limit: PAGE_SIZE, offset }
      if (txType !== 'all') params.tx_type = txType
      return fetchGlobalTransactions(params)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: t('operations.transactions.allTypes') },
      ...TX_TYPES.map((tp) => ({ value: tp, label: t(`operations.transactions.types.${tp}`) })),
    ],
    [t],
  )

  const columns: Column<GlobalTransactionItem>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', hiddenOnMobile: true, render: (i) => i.id },
      { key: 'user', header: t('operations.transactions.user'), render: (i) => i.user_email ?? '-' },
      {
        key: 'type',
        header: t('operations.transactions.type'),
        render: (i) => <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{t(`operations.transactions.types.${i.tx_type}`)}</span>,
      },
      {
        key: 'amount',
        header: t('operations.transactions.amount'),
        align: 'right',
        render: (i) => (
          <span className={i.amount >= 0 ? 'text-success' : 'text-destructive'}>
            {i.amount >= 0 ? '+' : ''}{i.amount}
          </span>
        ),
      },
      {
        key: 'before',
        header: t('operations.transactions.balanceBefore'),
        align: 'right',
        hiddenOnMobile: true,
        render: (i) => i.balance_before,
      },
      {
        key: 'after',
        header: t('operations.transactions.balanceAfter'),
        align: 'right',
        hiddenOnMobile: true,
        render: (i) => i.balance_after,
      },
      {
        key: 'desc',
        header: t('operations.transactions.description'),
        className: 'max-w-[200px] truncate',
        hiddenOnMobile: true,
        render: (i) => i.description ?? '-',
      },
      {
        key: 'time',
        header: t('operations.transactions.time'),
        className: 'whitespace-nowrap',
        render: (i) => new Date(i.created_at).toLocaleString(),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <AdminFilter
        value={txType}
        options={filterOptions}
        onChange={(v) => { setTxType(v); setOffset(0) }}
      />

      <DataTable columns={columns} data={items} rowKey={(i) => i.id} loading={isLoading} />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  )
}

// -- Tab 3: Share Links ------------------------------------------------------

const SHARE_STATUSES = ['pending', 'claimed', 'canceled']

function ShareLinksTab() {
  const { t } = useTranslation('admin')
  const [status, setStatus] = useState('all')
  const [offset, setOffset] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'share-links', { status, offset }],
    queryFn: () => {
      const params: { limit: number; offset: number; status?: string } = { limit: PAGE_SIZE, offset }
      if (status !== 'all') params.status = status
      return fetchAdminShareLinks(params)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: t('operations.shareLinks.allStatus') },
      ...SHARE_STATUSES.map((s) => ({ value: s, label: s })),
    ],
    [t],
  )

  const columns: Column<AdminShareLinkItem>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', hiddenOnMobile: true, render: (i) => i.id },
      { key: 'from', header: t('operations.shareLinks.from'), render: (i) => i.from_user_email ?? '-' },
      { key: 'to', header: t('operations.shareLinks.to'), hiddenOnMobile: true, render: (i) => i.to_user_email ?? '-' },
      { key: 'amount', header: t('operations.shareLinks.amount'), align: 'right', render: (i) => i.amount },
      {
        key: 'status',
        header: t('operations.shareLinks.status'),
        render: (i) => <StatusBadge status={i.status} />,
      },
      {
        key: 'expiresAt',
        header: t('operations.shareLinks.expiresAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (i) => i.expires_at ? new Date(i.expires_at).toLocaleString() : '-',
      },
      {
        key: 'claimedAt',
        header: t('operations.shareLinks.claimedAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (i) => i.claimed_at ? new Date(i.claimed_at).toLocaleString() : '-',
      },
      {
        key: 'createdAt',
        header: t('operations.shareLinks.createdAt'),
        className: 'whitespace-nowrap',
        hiddenOnMobile: true,
        render: (i) => new Date(i.created_at).toLocaleString(),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <AdminFilter
        value={status}
        options={filterOptions}
        onChange={(v) => { setStatus(v); setOffset(0) }}
      />

      <DataTable columns={columns} data={items} rowKey={(i) => i.id} loading={isLoading} />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  )
}

// -- Tab 4: Revenue ----------------------------------------------------------

function RevenueTab() {
  const { t } = useTranslation('admin')
  const isMobile = useIsMobile()
  const [granularity, setGranularity] = useState('day')
  const [days, setDays] = useState(30)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'revenue', { granularity, days }],
    queryFn: () => fetchRevenue({ granularity, days }),
  })

  const items = data?.items ?? []

  const granularityOptions = useMemo(
    () => [
      { value: 'day', label: t('operations.revenue.day') },
      { value: 'week', label: t('operations.revenue.week') },
      { value: 'month', label: t('operations.revenue.month') },
    ],
    [t],
  )

  const columns: Column<RevenueItem>[] = useMemo(
    () => [
      { key: 'period', header: t('operations.revenue.period'), render: (i) => i.period },
      { key: 'credits', header: t('operations.revenue.credits'), align: 'right', render: (i) => i.total_credits },
      { key: 'transactions', header: t('operations.revenue.transactions'), align: 'right', render: (i) => i.transaction_count },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          {t('operations.revenue.granularity')}
          <AdminFilter value={granularity} options={granularityOptions} onChange={setGranularity} className="w-[100px]" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          {t('operations.toolUsage.days')}
          <Input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => setDays(Number(e.target.value) || 30)}
            className="w-20"
          />
        </label>
      </div>

      {!isLoading && data && items.length > 0 && (
        <>
          <div className="rounded-xl border bg-card p-4">
            <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
              <LineChart data={items}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  interval={isMobile ? 'preserveStartEnd' : undefined}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? 'end' : 'middle'}
                  height={isMobile ? 50 : 30}
                />
                <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 35 : 60} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total_credits"
                  stroke="var(--foreground)"
                  strokeWidth={2}
                  dot={false}
                  name={t('operations.revenue.credits')}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-2xl font-bold">{data.total_credits.toLocaleString()}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t('operations.revenue.totalCredits')}</div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-2xl font-bold">{data.total_transactions.toLocaleString()}</div>
              <div className="mt-1 text-sm text-muted-foreground">{t('operations.revenue.totalTransactions')}</div>
            </div>
          </div>
        </>
      )}

      <DataTable columns={columns} data={items} rowKey={(i) => i.period} loading={isLoading} />
    </div>
  )
}

// -- Main Page Component -----------------------------------------------------

export function AdminOperationsPage() {
  const { t } = useTranslation('admin')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('operations.title')}</h1>

      <Tabs defaultValue="toolUsage">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList>
            <TabsTrigger value="toolUsage">{t('operations.tabs.toolUsage')}</TabsTrigger>
            <TabsTrigger value="transactions">{t('operations.tabs.transactions')}</TabsTrigger>
            <TabsTrigger value="shareLinks">{t('operations.tabs.shareLinks')}</TabsTrigger>
            <TabsTrigger value="revenue">{t('operations.tabs.revenue')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="toolUsage"><ToolUsageTab /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
        <TabsContent value="shareLinks"><ShareLinksTab /></TabsContent>
        <TabsContent value="revenue"><RevenueTab /></TabsContent>
      </Tabs>
    </div>
  )
}
