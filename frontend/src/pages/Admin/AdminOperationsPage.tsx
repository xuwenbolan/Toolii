import { useState, useEffect, useMemo } from 'react'
import { useTranslation } from 'react-i18next'
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

import {
  fetchToolUsage,
  fetchGlobalTransactions,
  fetchAdminShareLinks,
  fetchRevenue,
} from '@/services/adminApi'
import type {
  ToolUsageItem,
  GlobalTransactionListResponse,
  GlobalTransactionItem,
  AdminShareLinkListResponse,
  AdminShareLinkItem,
  RevenueResponse,
  RevenueItem,
} from '@/services/adminApi'

type Tab = 'toolUsage' | 'transactions' | 'shareLinks' | 'revenue'

const PAGE_SIZE = 20

// ── Tab 1: Tool Usage ──────────────────────────────────────

function ToolUsageTab() {
  const { t } = useTranslation('admin')
  const [days, setDays] = useState(30)
  const [toolName, setToolName] = useState('')
  const [data, setData] = useState<ToolUsageItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const params: { days?: number; tool_name?: string } = { days }
    if (toolName) params.tool_name = toolName
    fetchToolUsage(params)
      .then((res) => {
        if (active) setData(res.items)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [days, toolName])

  // Extract unique tool names for the dropdown
  const toolNames = useMemo(() => {
    const names = new Set(data.map((d) => d.tool_name))
    return Array.from(names).sort()
  }, [data])

  // Aggregate by date for the stacked bar chart
  const chartData = useMemo(() => {
    const map = new Map<string, { date: string; success: number; fail: number }>()
    for (const item of data) {
      const existing = map.get(item.date)
      if (existing) {
        existing.success += item.success_count
        existing.fail += item.fail_count
      } else {
        map.set(item.date, {
          date: item.date,
          success: item.success_count,
          fail: item.fail_count,
        })
      }
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date))
  }, [data])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          {t('operations.toolUsage.days')}
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => {
              setLoading(true)
              setDays(Number(e.target.value) || 30)
            }}
            className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
          />
        </label>
        <select
          value={toolName}
          onChange={(e) => {
            setLoading(true)
            setToolName(e.target.value)
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="">{t('operations.toolUsage.allTools')}</option>
          {toolNames.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : data.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.noData')}
        </div>
      ) : (
        <>
          {/* Bar chart */}
          <div className="rounded-xl border bg-card p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Bar
                  dataKey="success"
                  stackId="a"
                  fill="#22c55e"
                  name={t('operations.toolUsage.success')}
                />
                <Bar
                  dataKey="fail"
                  stackId="a"
                  fill="#ef4444"
                  name={t('operations.toolUsage.fail')}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Data table */}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.toolUsage.tool')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.toolUsage.date')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('operations.toolUsage.total')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('operations.toolUsage.success')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('operations.toolUsage.fail')}</th>
                </tr>
              </thead>
              <tbody>
                {data.map((item, i) => (
                  <tr key={`${item.tool_name}-${item.date}`} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                    <td className="px-3 py-2">{item.tool_name}</td>
                    <td className="px-3 py-2">{item.date}</td>
                    <td className="px-3 py-2 text-right">{item.count}</td>
                    <td className="px-3 py-2 text-right text-green-600">{item.success_count}</td>
                    <td className="px-3 py-2 text-right text-red-500">{item.fail_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab 2: Transactions ────────────────────────────────────

const TX_TYPES = ['redeem', 'consume', 'admin_adjust', 'share_send', 'share_receive']

function TransactionsTab() {
  const { t } = useTranslation('admin')
  const [txType, setTxType] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<GlobalTransactionListResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const params: { limit: number; offset: number; tx_type?: string } = {
      limit: PAGE_SIZE,
      offset,
    }
    if (txType) params.tx_type = txType
    fetchGlobalTransactions(params)
      .then((res) => {
        if (active) setData(res)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [txType, offset])

  const items: GlobalTransactionItem[] = data?.items ?? []
  const total = data?.total ?? 0

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={txType}
          onChange={(e) => {
            setLoading(true)
            setOffset(0)
            setTxType(e.target.value)
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="">{t('operations.transactions.allTypes')}</option>
          {TX_TYPES.map((tp) => (
            <option key={tp} value={tp}>
              {tp}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.noData')}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.transactions.user')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.transactions.type')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('operations.transactions.amount')}</th>
                  <th className="px-3 py-2 text-right font-medium">Balance Before</th>
                  <th className="px-3 py-2 text-right font-medium">Balance After</th>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.transactions.description')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.transactions.time')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                    <td className="px-3 py-2">{item.id}</td>
                    <td className="px-3 py-2">{item.user_email ?? '-'}</td>
                    <td className="px-3 py-2">
                      <span className="rounded bg-muted px-1.5 py-0.5 text-xs">{item.tx_type}</span>
                    </td>
                    <td className={`px-3 py-2 text-right ${item.amount >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {item.amount >= 0 ? '+' : ''}{item.amount}
                    </td>
                    <td className="px-3 py-2 text-right">{item.balance_before}</td>
                    <td className="px-3 py-2 text-right">{item.balance_after}</td>
                    <td className="max-w-[200px] truncate px-3 py-2">{item.description ?? '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => {
                  setLoading(true)
                  setOffset((prev) => Math.max(0, prev - PAGE_SIZE))
                }}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => {
                  setLoading(true)
                  setOffset((prev) => prev + PAGE_SIZE)
                }}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab 3: Share Links ─────────────────────────────────────

const SHARE_STATUSES = ['pending', 'claimed', 'canceled']

function ShareLinksTab() {
  const { t } = useTranslation('admin')
  const [status, setStatus] = useState('')
  const [offset, setOffset] = useState(0)
  const [data, setData] = useState<AdminShareLinkListResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    const params: { limit: number; offset: number; status?: string } = {
      limit: PAGE_SIZE,
      offset,
    }
    if (status) params.status = status
    fetchAdminShareLinks(params)
      .then((res) => {
        if (active) setData(res)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [status, offset])

  const items: AdminShareLinkItem[] = data?.items ?? []
  const total = data?.total ?? 0

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800',
      claimed: 'bg-green-100 text-green-800',
      canceled: 'bg-gray-100 text-gray-600',
    }
    return (
      <span className={`inline-block rounded px-1.5 py-0.5 text-xs ${colors[s] ?? 'bg-muted'}`}>
        {s}
      </span>
    )
  }

  return (
    <div className="space-y-4">
      {/* Filter */}
      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setLoading(true)
            setOffset(0)
            setStatus(e.target.value)
          }}
          className="rounded-md border bg-background px-2 py-1 text-sm"
        >
          <option value="">{t('operations.shareLinks.allStatus')}</option>
          {SHARE_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.noData')}
        </div>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">ID</th>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.shareLinks.from')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.shareLinks.to')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('operations.shareLinks.amount')}</th>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.shareLinks.status')}</th>
                  <th className="px-3 py-2 text-left font-medium">Expires At</th>
                  <th className="px-3 py-2 text-left font-medium">Claimed At</th>
                  <th className="px-3 py-2 text-left font-medium">Created At</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.id} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                    <td className="px-3 py-2">{item.id}</td>
                    <td className="px-3 py-2">{item.from_user_email ?? '-'}</td>
                    <td className="px-3 py-2">{item.to_user_email ?? '-'}</td>
                    <td className="px-3 py-2 text-right">{item.amount}</td>
                    <td className="px-3 py-2">{statusBadge(item.status)}</td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {item.expires_at ? new Date(item.expires_at).toLocaleString() : '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {item.claimed_at ? new Date(item.claimed_at).toLocaleString() : '-'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      {new Date(item.created_at).toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">
              {offset + 1}-{Math.min(offset + PAGE_SIZE, total)} / {total}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={offset === 0}
                onClick={() => {
                  setLoading(true)
                  setOffset((prev) => Math.max(0, prev - PAGE_SIZE))
                }}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
              >
                {t('common.previous')}
              </button>
              <button
                type="button"
                disabled={offset + PAGE_SIZE >= total}
                onClick={() => {
                  setLoading(true)
                  setOffset((prev) => prev + PAGE_SIZE)
                }}
                className="rounded-md border px-3 py-1 text-sm disabled:opacity-40"
              >
                {t('common.next')}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ── Tab 4: Revenue ─────────────────────────────────────────

function RevenueTab() {
  const { t } = useTranslation('admin')
  const [granularity, setGranularity] = useState('day')
  const [days, setDays] = useState(30)
  const [data, setData] = useState<RevenueResponse | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    fetchRevenue({ granularity, days })
      .then((res) => {
        if (active) setData(res)
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [granularity, days])

  const items: RevenueItem[] = data?.items ?? []

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm">
          {t('operations.revenue.granularity')}
          <select
            value={granularity}
            onChange={(e) => {
              setLoading(true)
              setGranularity(e.target.value)
            }}
            className="rounded-md border bg-background px-2 py-1 text-sm"
          >
            <option value="day">{t('operations.revenue.day')}</option>
            <option value="week">{t('operations.revenue.week')}</option>
            <option value="month">{t('operations.revenue.month')}</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm">
          {t('operations.toolUsage.days')}
          <input
            type="number"
            min={1}
            max={365}
            value={days}
            onChange={(e) => {
              setLoading(true)
              setDays(Number(e.target.value) || 30)
            }}
            className="w-20 rounded-md border bg-background px-2 py-1 text-sm"
          />
        </label>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.loading')}
        </div>
      ) : !data || items.length === 0 ? (
        <div className="py-10 text-center text-sm text-muted-foreground">
          {t('common.noData')}
        </div>
      ) : (
        <>
          {/* Line chart */}
          <div className="rounded-xl border bg-card p-4">
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={items}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="period" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend />
                <Line
                  type="monotone"
                  dataKey="total_credits"
                  stroke="#22c55e"
                  strokeWidth={2}
                  dot={false}
                  name={t('operations.revenue.credits')}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4">
            <div className="rounded-xl border bg-card p-4">
              <div className="text-2xl font-bold">{data.total_credits.toLocaleString()}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t('operations.revenue.totalCredits')}
              </div>
            </div>
            <div className="rounded-xl border bg-card p-4">
              <div className="text-2xl font-bold">{data.total_transactions.toLocaleString()}</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {t('operations.revenue.totalTransactions')}
              </div>
            </div>
          </div>

          {/* Data table */}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-sm">
              <thead className="border-b bg-muted/50">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">{t('operations.revenue.period')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('operations.revenue.credits')}</th>
                  <th className="px-3 py-2 text-right font-medium">{t('operations.revenue.transactions')}</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item, i) => (
                  <tr key={item.period} className={i % 2 === 0 ? '' : 'bg-muted/30'}>
                    <td className="px-3 py-2">{item.period}</td>
                    <td className="px-3 py-2 text-right">{item.total_credits}</td>
                    <td className="px-3 py-2 text-right">{item.transaction_count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}

// ── Main Page Component ────────────────────────────────────

export function AdminOperationsPage() {
  const { t } = useTranslation('admin')
  const [activeTab, setActiveTab] = useState<Tab>('toolUsage')

  const tabs: { key: Tab; label: string }[] = [
    { key: 'toolUsage', label: t('operations.tabs.toolUsage') },
    { key: 'transactions', label: t('operations.tabs.transactions') },
    { key: 'shareLinks', label: t('operations.tabs.shareLinks') },
    { key: 'revenue', label: t('operations.tabs.revenue') },
  ]

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-bold">{t('operations.title')}</h2>

      {/* Tab buttons */}
      <div className="flex gap-1 rounded-lg border bg-muted/30 p-1">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key)}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'bg-accent text-accent-foreground'
                : 'text-muted-foreground hover:bg-muted'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'toolUsage' && <ToolUsageTab />}
      {activeTab === 'transactions' && <TransactionsTab />}
      {activeTab === 'shareLinks' && <ShareLinksTab />}
      {activeTab === 'revenue' && <RevenueTab />}
    </div>
  )
}
