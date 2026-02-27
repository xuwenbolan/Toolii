import { Link } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

const TOOL_CATEGORIES = [
  {
    title: '证件照',
    description: '去背景、合规检测、打印排版（登录后导出无水印）。',
    to: '/id-photo',
  },
  {
    title: '图片工具',
    description: '压缩、HEIC 转换、格式转换、马赛克、扫描增强。',
    to: '/image-tools',
  },
  {
    title: 'PDF 工具',
    description: '压缩、合并、拆分/重排、图转 PDF。',
    to: '/pdf-tools',
  },
]

export function HomePage() {
  return (
    <div className="space-y-5">
      <SEOHead
        title="Toolii 在线工具平台"
        description="Toolii 提供证件照处理、图片压缩、格式转换、PDF 合并压缩等在线工具。"
        canonicalPath="/"
        keywords="在线工具,证件照,图片压缩,HEIC 转 JPG,PDF 合并"
      />
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Toolii 在线工具平台</h1>
        <p className="text-sm text-muted-foreground">
          证件照处理、图片处理、PDF 工具，一站式在线完成。
        </p>
      </div>

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {TOOL_CATEGORIES.map((item) => (
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
