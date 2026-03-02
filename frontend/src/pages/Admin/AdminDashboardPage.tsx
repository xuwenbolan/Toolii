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

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchDashboardStats } from '@/services/adminApi'
import type { DashboardStats } from '@/services/adminApi'

export function AdminDashboardPage() {
  const { t } = useTranslation('admin')

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

  const statCards = [
    { label: t('dashboard.totalUsers'), value: data.total_users },
    { label: t('dashboard.revenueToday'), value: data.revenue_today },
    { label: t('dashboard.toolUsesToday'), value: data.tool_uses_today },
    { label: t('dashboard.activeUsers7d'), value: data.active_users_7d },
  ]

  const trendTabs = [
    { key: 'users', label: t('dashboard.trendUsers'), data: data.user_trend },
    { key: 'toolUses', label: t('dashboard.trendToolUses'), data: data.tool_trend },
    { key: 'revenue', label: t('dashboard.trendRevenue'), data: data.revenue_trend },
  ]

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label}>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{card.value.toLocaleString()}</div>
              <div className="mt-1 text-sm text-muted-foreground">{card.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* 30-day trend line chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.trend30d')}</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="users">
            <TabsList>
              {trendTabs.map((tab) => (
                <TabsTrigger key={tab.key} value={tab.key}>
                  {tab.label}
                </TabsTrigger>
              ))}
            </TabsList>
            {trendTabs.map((tab) => (
              <TabsContent key={tab.key} value={tab.key}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={tab.data}>
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
              </TabsContent>
            ))}
          </Tabs>
        </CardContent>
      </Card>

      {/* Tool ranking bar chart */}
      <Card>
        <CardHeader>
          <CardTitle>{t('dashboard.toolRanking')}</CardTitle>
        </CardHeader>
        <CardContent>
          {data.tool_ranking.length === 0 ? (
            <div className="py-10 text-center text-sm text-muted-foreground">
              {t('common.noData')}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={data.tool_ranking.length * 40 + 20}>
              <BarChart data={data.tool_ranking} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: 12 }} />
                <YAxis type="category" dataKey="tool_name" tick={{ fontSize: 12 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill="#94a3b8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
