import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TOOLS = [
  {
    title: 'PDF 压缩',
    description: '压缩 PDF 大小（最佳努力）。',
    to: '/pdf-tools/compress',
  },
  {
    title: 'PDF 合并',
    description: '多个 PDF 合并为一个文件。',
    to: '/pdf-tools/merge',
  },
  {
    title: '页面操作',
    description: '旋转、删除、抽取、重排页面。',
    to: '/pdf-tools/pages',
  },
  {
    title: '图转 PDF',
    description: '多张图片合并为 PDF。',
    to: '/pdf-tools/from-images',
  },
]

export function PdfToolsPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">PDF 工具</h1>
        <p className="text-sm text-muted-foreground">匿名可用，适合材料整理与提交。</p>
      </div>

      <div className="grid gap-3">
        {TOOLS.map((item) => (
          <Link key={item.title} to={item.to} className="block">
            <Card className="transition hover:bg-accent/40">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">{item.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {item.description}
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  )
}

