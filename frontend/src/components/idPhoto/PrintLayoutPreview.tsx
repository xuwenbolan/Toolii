import type { FileResult } from '@/services/imageApi'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { formatBytes } from '@/lib/fileValidation'

type Props = {
  result: FileResult | null
}

export function PrintLayoutPreview({ result }: Props) {
  if (!result) return null

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <h3 className="text-sm font-semibold">6x4 排版已生成</h3>
      <p className="text-xs text-muted-foreground">
        {result.filename} · {formatBytes(result.size)}
      </p>
      <DownloadButton url={result.download_url} label="下载排版图" />
    </div>
  )
}

