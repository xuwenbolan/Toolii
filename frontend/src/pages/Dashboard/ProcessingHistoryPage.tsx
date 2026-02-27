import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

export function ProcessingHistoryPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>处理历史</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm text-muted-foreground">
        <p>Phase 6 已预留页面入口。</p>
        <p>处理历史数据模型已存在，后续将接入 API 查询与分页展示。</p>
      </CardContent>
    </Card>
  )
}
