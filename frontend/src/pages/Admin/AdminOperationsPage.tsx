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

import { AdminFilter, DataTable, Pagination, StatusBadge, ChartTooltip, ChartLegend, CHART_COLORS, GRID_PROPS } from '@/components/admin'
import type { Column } from '@/components/admin'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/useIsMobile'
import {
  fetchToolUsage,
  fetchGlobalTransactions,
  fetchAdminShareLinks,
  fetchRevenue,
  fetchUsageLog,
} from '@/services/adminApi'
import type {
  ToolUsageItem,
  GlobalTransactionItem,
  AdminShareLinkItem,
  AdminProcessingHistoryListItem,
  RevenueItem,
} from '@/services/adminApi'

const PAGE_SIZE = 20

// -- Tab 1: Tool Usage -------------------------------------------------------

function ToolUsageTab() {
  const { t } = useTranslation('console')
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

  const toolEntries = useMemo(() => {
    const map = new Map<string, string>()
    for (const d of items) {
      if (!map.has(d.tool_name)) map.set(d.tool_name, d.display_name)
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]))
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
      ...toolEntries.map(([name, display]) => ({ value: name, label: display })),
    ],
    [t, toolEntries],
  )

  const columns: Column<ToolUsageItem>[] = useMemo(
    () => [
      { key: 'tool', header: t('operations.toolUsage.tool'), render: (i) => i.display_name },
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
              <CartesianGrid {...GRID_PROPS} />
              <XAxis
                dataKey="date"
                tick={{ fontSize: isMobile ? 10 : 12 }}
                interval={isMobile ? 'preserveStartEnd' : undefined}
                angle={isMobile ? -45 : 0}
                textAnchor={isMobile ? 'end' : 'middle'}
                height={isMobile ? 50 : 30}
                tickLine={false}
                axisLine={false}
              />
              <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 30 : 60} tickLine={false} axisLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--muted)', opacity: 0.4 }} />
              <Legend content={<ChartLegend />} />
              <Bar dataKey="success" stackId="a" fill={CHART_COLORS[1]} name={t('operations.toolUsage.success')} radius={[0, 0, 0, 0]} />
              <Bar dataKey="fail" stackId="a" fill={CHART_COLORS[4]} name={t('operations.toolUsage.fail')} radius={[4, 4, 0, 0]} />
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
  const { t } = useTranslation('console')
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

      <DataTable
        columns={columns}
        data={items}
        rowKey={(i) => i.id}
        loading={isLoading}
        renderMobileCard={(i) => (
          <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="truncate text-sm">{i.user_email ?? '-'}</span>
              <span className={`font-medium tabular-nums ${i.amount >= 0 ? 'text-success' : 'text-destructive'}`}>
                {i.amount >= 0 ? '+' : ''}{i.amount}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span className="rounded bg-muted px-1.5 py-0.5">{t(`operations.transactions.types.${i.tx_type}`)}</span>
              <span>{i.balance_before} &rarr; {i.balance_after}</span>
            </div>
            {i.description && (
              <div className="truncate text-xs text-muted-foreground">{i.description}</div>
            )}
            <div className="text-[11px] text-muted-foreground">{new Date(i.created_at).toLocaleString()}</div>
          </div>
        )}
      />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  )
}

// -- Tab 3: Share Links ------------------------------------------------------

const SHARE_STATUSES = ['pending', 'claimed', 'canceled']

function ShareLinksTab() {
  const { t } = useTranslation('console')
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

      <DataTable
        columns={columns}
        data={items}
        rowKey={(i) => i.id}
        loading={isLoading}
        renderMobileCard={(i) => (
          <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="truncate text-sm">{i.from_user_email ?? '-'}</span>
              <StatusBadge status={i.status} />
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">&rarr; {i.to_user_email ?? '-'}</span>
              <span className="font-medium">{i.amount}</span>
            </div>
            <div className="text-[11px] text-muted-foreground">{new Date(i.created_at).toLocaleString()}</div>
          </div>
        )}
      />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  )
}

// -- Tab 4: Revenue ----------------------------------------------------------

function RevenueTab() {
  const { t } = useTranslation('console')
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
                <CartesianGrid {...GRID_PROPS} />
                <XAxis
                  dataKey="period"
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  interval={isMobile ? 'preserveStartEnd' : undefined}
                  angle={isMobile ? -45 : 0}
                  textAnchor={isMobile ? 'end' : 'middle'}
                  height={isMobile ? 50 : 30}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 35 : 60} tickLine={false} axisLine={false} />
                <Tooltip content={<ChartTooltip />} />
                <Legend content={<ChartLegend />} />
                <Line
                  type="monotone"
                  dataKey="total_credits"
                  stroke={CHART_COLORS[0]}
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

// -- Tab 5: Usage Log --------------------------------------------------------

const USAGE_STATUSES = ['done', 'failed']

function UsageLogTab() {
  const { t } = useTranslation('console')
  const [statusFilter, setStatusFilter] = useState('all')
  const [offset, setOffset] = useState(0)

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'usage-log', { statusFilter, offset }],
    queryFn: () => {
      const params: { limit: number; offset: number; status?: string } = { limit: PAGE_SIZE, offset }
      if (statusFilter !== 'all') params.status = statusFilter
      return fetchUsageLog(params)
    },
  })

  const items = data?.items ?? []
  const total = data?.total ?? 0

  const filterOptions = useMemo(
    () => [
      { value: 'all', label: t('operations.usageLog.allStatus') },
      ...USAGE_STATUSES.map((s) => ({ value: s, label: t(`operations.usageLog.statuses.${s}`) })),
    ],
    [t],
  )

  const columns: Column<AdminProcessingHistoryListItem>[] = useMemo(
    () => [
      { key: 'id', header: 'ID', hiddenOnMobile: true, render: (i) => i.id },
      { key: 'tool', header: t('operations.usageLog.tool'), render: (i) => i.display_name },
      { key: 'user', header: t('operations.usageLog.user'), hiddenOnMobile: true, render: (i) => i.user_email ?? '-' },
      {
        key: 'status',
        header: t('operations.usageLog.status'),
        render: (i) => <StatusBadge status={i.status} />,
      },
      {
        key: 'ip',
        header: 'IP',
        hiddenOnMobile: true,
        render: (i) => i.ip ?? '-',
      },
      {
        key: 'ua',
        header: 'UA',
        className: 'max-w-[200px] truncate',
        hiddenOnMobile: true,
        render: (i) => i.user_agent ?? '-',
      },
      {
        key: 'time',
        header: t('operations.usageLog.time'),
        className: 'whitespace-nowrap',
        render: (i) => new Date(i.created_at).toLocaleString(),
      },
    ],
    [t],
  )

  return (
    <div className="space-y-4">
      <AdminFilter
        value={statusFilter}
        options={filterOptions}
        onChange={(v) => { setStatusFilter(v); setOffset(0) }}
      />

      <DataTable
        columns={columns}
        data={items}
        rowKey={(i) => i.id}
        loading={isLoading}
        renderMobileCard={(i) => (
          <div className="rounded-xl border bg-card px-3 py-2.5 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{i.display_name}</span>
              <StatusBadge status={i.status} />
            </div>
            {i.user_email && (
              <div className="text-xs text-muted-foreground">{i.user_email}</div>
            )}
            {i.ip && (
              <div className="text-xs text-muted-foreground">IP: {i.ip}</div>
            )}
            <div className="text-[11px] text-muted-foreground">{new Date(i.created_at).toLocaleString()}</div>
          </div>
        )}
      />
      <Pagination offset={offset} limit={PAGE_SIZE} total={total} onOffsetChange={setOffset} />
    </div>
  )
}

// -- Main Page Component -----------------------------------------------------

export function AdminOperationsPage() {
  const { t } = useTranslation('console')

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">{t('operations.title')}</h1>

      <Tabs defaultValue="toolUsage">
        <div className="overflow-x-auto no-scrollbar">
          <TabsList>
            <TabsTrigger value="toolUsage">{t('operations.tabs.toolUsage')}</TabsTrigger>
            <TabsTrigger value="usageLog">{t('operations.tabs.usageLog')}</TabsTrigger>
            <TabsTrigger value="transactions">{t('operations.tabs.transactions')}</TabsTrigger>
            <TabsTrigger value="shareLinks">{t('operations.tabs.shareLinks')}</TabsTrigger>
            <TabsTrigger value="revenue">{t('operations.tabs.revenue')}</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="toolUsage"><ToolUsageTab /></TabsContent>
        <TabsContent value="usageLog"><UsageLogTab /></TabsContent>
        <TabsContent value="transactions"><TransactionsTab /></TabsContent>
        <TabsContent value="shareLinks"><ShareLinksTab /></TabsContent>
        <TabsContent value="revenue"><RevenueTab /></TabsContent>
      </Tabs>
    </div>
  )
}
