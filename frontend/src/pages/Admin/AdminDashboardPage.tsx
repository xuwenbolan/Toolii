import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts'

import { fetchDashboardStats } from '@/services/adminApi'
import type { DashboardStats } from '@/services/adminApi'

type TrendTab = 'users' | 'toolUses' | 'revenue'

export function AdminDashboardPage() {
  const { t } = useTranslation('admin')
  const [trendTab, setTrendTab] = useState<TrendTab>('users')

  const { data, isLoading } = useQuery<DashboardStats>({
    queryKey: ['admin', 'dashboard-stats'],
    queryFn: () => fetchDashboardStats(),
  })

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        {t('common.loading')}
      </div>
    )
  }

  // Resolve the trend data based on selected tab
  const trendDataMap: Record<TrendTab, typeof data.user_trend> = {
    users: data.user_trend,
    toolUses: data.tool_trend,
    revenue: data.revenue_trend,
  }
  const trendData = trendDataMap[trendTab]

  const trendTabs: { key: TrendTab; label: string }[] = [
    { key: 'users', label: t('dashboard.trendUsers') },
    { key: 'toolUses', label: t('dashboard.trendToolUses') },
    { key: 'revenue', label: t('dashboard.trendRevenue') },
  ]

  // Stat cards configuration
  const statCards = [
    { label: t('dashboard.totalUsers'), value: data.total_users },
    { label: t('dashboard.revenueToday'), value: data.revenue_today },
    { label: t('dashboard.toolUsesToday'), value: data.tool_uses_today },
    { label: t('dashboard.activeUsers7d'), value: data.active_users_7d },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <div key={card.label} className="rounded-xl border bg-card p-4">
            <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
            <div className="mt-1 text-sm text-muted-foreground">{card.label}</div>
          </div>
        ))}
      </div>

      {/* 30-day trend line chart */}
      <div className="rounded-xl border bg-card p-4">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="font-semibold">{t('dashboard.trend30d')}</h3>
          <div className="flex gap-1">
            {trendTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setTrendTab(tab.key)}
                className={`rounded-md px-3 py-1 text-sm transition-colors ${
                  trendTab === tab.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={trendData}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--primary))"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Tool ranking bar chart */}
      <div className="rounded-xl border bg-card p-4">
        <h3 className="mb-4 font-semibold">{t('dashboard.toolRanking')}</h3>
        {data.tool_ranking.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            {t('common.noData')}
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={data.tool_ranking.length * 40 + 20}>
            <BarChart data={data.tool_ranking} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis
                type="category"
                dataKey="tool_name"
                tick={{ fontSize: 12 }}
                width={120}
              />
              <Tooltip />
              <Bar dataKey="count" fill="#94a3b8" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}
