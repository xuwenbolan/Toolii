import { Button } from '@/components/ui/button'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { useFileDownload } from '@/hooks/useFileDownload'
import { formatBytes } from '@/lib/fileValidation'
import type { BatchResponse } from '@/services/imageApi'

type Props = {
  batch: BatchResponse
}

export function BatchDownloadButton({ batch }: Props) {
  const download = useFileDownload()

  return (
    <div className="space-y-3">
      <DownloadButton url={batch.archive.download_url} label="下载 ZIP" />

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          查看单个结果（{batch.items.length}）
        </summary>
        <div className="mt-3 space-y-2">
          {batch.items.map((item, idx) => (
            <div
              key={`${item.output.file_id}-${idx}`}
              className="rounded-md border px-3 py-2"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{item.output.filename}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {item.input_filename} · {formatBytes(item.output.size)}
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="mt-2 w-full sm:mt-3 sm:w-auto"
                onClick={() => download(item.output.download_url)}
              >
                下载
              </Button>
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
