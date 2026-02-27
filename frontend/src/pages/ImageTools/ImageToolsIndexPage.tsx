import { Link } from 'react-router-dom'

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TOOLS = [
  {
    title: '图片压缩',
    description: '自定义质量或压到指定大小。',
    to: '/image-tools/compress',
  },
  {
    title: 'HEIC 转 JPG',
    description: '苹果用户常见格式，一键转换。',
    to: '/image-tools/heic-to-jpg',
  },
  {
    title: '格式转换',
    description: 'JPG/PNG/WEBP 互转。',
    to: '/image-tools/convert',
  },
  {
    title: '图片马赛克',
    description: '打码保护隐私（先支持整图马赛克）。',
    to: '/image-tools/mosaic',
  },
  {
    title: '扫描件增强',
    description: '自动增强对比度与黑白化。',
    to: '/image-tools/scan-enhance',
  },
  {
    title: '批量处理',
    description: '多图压缩/转换，打包 ZIP 下载。',
    to: '/image-tools/batch',
  },
]

export function ImageToolsIndexPage() {
  return (
    <div className="space-y-5">
      <div className="space-y-1">
        <h1 className="text-xl font-semibold tracking-tight">图片工具</h1>
        <p className="text-sm text-muted-foreground">匿名可用，受限流保护。</p>
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

