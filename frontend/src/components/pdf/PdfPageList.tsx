import { PdfPagePreview } from '@/components/pdf/PdfPagePreview'

type Props = {
  pages: number[]
}

export function PdfPageList({ pages }: Props) {
  if (pages.length === 0) return null

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground">解析到页面序号（预览）</p>
      <div className="flex flex-wrap gap-2">
        {pages.map((page, idx) => (
          <PdfPagePreview key={`${page}-${idx}`} page={page} />
        ))}
      </div>
    </div>
  )
}

