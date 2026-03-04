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

import { AdminErrorState } from '@/components/admin'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useIsMobile } from '@/hooks/useIsMobile'
import { fetchDashboardStats } from '@/services/adminApi'
import type { DashboardStats } from '@/services/adminApi'

// Format date label: show only MM-DD on mobile, full date on desktop
function formatDateTick(value: string, isMobile: boolean) {
  if (!isMobile) return value
  // "2026-03-04" -> "03-04"
  const parts = value.split('-')
  return parts.length === 3 ? `${parts[1]}-${parts[2]}` : value
}

export function AdminDashboardPage() {
  const { t } = useTranslation('admin')
  const isMobile = useIsMobile()

  const { data, isLoading, isError, refetch } = useQuery<DashboardStats>({
    queryKey: ['admin', 'dashboard-stats'],
    queryFn: () => fetchDashboardStats(),
  })

  if (isError) return <AdminErrorState onRetry={() => refetch()} />

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
                <ResponsiveContainer width="100%" height={isMobile ? 200 : 300}>
                  <LineChart data={tab.data}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="date"
                      tick={{ fontSize: isMobile ? 10 : 12 }}
                      tickFormatter={(v) => formatDateTick(v, isMobile)}
                      interval={isMobile ? 'preserveStartEnd' : undefined}
                      angle={isMobile ? -45 : 0}
                      textAnchor={isMobile ? 'end' : 'middle'}
                      height={isMobile ? 50 : 30}
                    />
                    <YAxis tick={{ fontSize: isMobile ? 10 : 12 }} width={isMobile ? 35 : 60} />
                    <Tooltip />
                    <Line
                      type="monotone"
                      dataKey="value"
                      stroke="var(--foreground)"
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
            <ResponsiveContainer
              width="100%"
              height={data.tool_ranking.length * (isMobile ? 36 : 40) + 20}
            >
              <BarChart data={data.tool_ranking} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" tick={{ fontSize: isMobile ? 10 : 12 }} />
                <YAxis
                  type="category"
                  dataKey="tool_name"
                  tick={{ fontSize: isMobile ? 10 : 12 }}
                  width={isMobile ? 80 : 120}
                />
                <Tooltip />
                <Bar dataKey="count" fill="var(--muted-foreground)" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
