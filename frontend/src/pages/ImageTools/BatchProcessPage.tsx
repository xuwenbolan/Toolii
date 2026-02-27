import { useMemo, useState } from 'react'

import { BatchDownloadButton } from '@/components/tools/BatchDownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { batchProcess, type BatchResponse } from '@/services/imageApi'

type Action = 'compress' | 'convert'

export function BatchProcessPage() {
  const [files, setFiles] = useState<File[]>([])
  const [action, setAction] = useState<Action>('compress')
  const [format, setFormat] = useState<'jpeg' | 'png' | 'webp'>('jpeg')
  const [quality, setQuality] = useState(80)
  const [targetKb, setTargetKb] = useState<number | ''>('')
  const [result, setResult] = useState<BatchResponse | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (files.length === 0) return null
    const total = files.reduce((acc, f) => acc + f.size, 0)
    return `${files.length} 个文件 · ${formatBytes(total)}`
  }, [files])

  return (
    <ToolPageShell title="批量处理" description="多图处理后打包 ZIP 下载。">
      <div className="space-y-5">
        <FileDropzone
          accept="image/*"
          multiple
          maxFiles={20}
          onFiles={(picked) => {
            reset()
            setResult(null)
            setFiles(picked)
          }}
        />

        {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="action">操作</Label>
            <select
              id="action"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={action}
              onChange={(e) => setAction(e.target.value as Action)}
            >
              <option value="compress">压缩</option>
              <option value="convert">转换</option>
            </select>
          </div>

          {action === 'convert' ? (
            <div className="space-y-2">
              <Label htmlFor="format">输出格式</Label>
              <select
                id="format"
                className="h-9 w-full rounded-md border bg-background px-3 text-sm"
                value={format}
                onChange={(e) => setFormat(e.target.value as typeof format)}
              >
                <option value="jpeg">JPG</option>
                <option value="png">PNG</option>
                <option value="webp">WEBP</option>
              </select>
            </div>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="quality">质量（仅 JPG/WEBP）</Label>
            <Input
              id="quality"
              type="number"
              min={1}
              max={100}
              value={quality}
              onChange={(e) => setQuality(Number(e.target.value))}
            />
          </div>

          {action === 'compress' ? (
            <div className="space-y-2">
              <Label htmlFor="targetKb">目标大小（KB，可选）</Label>
              <Input
                id="targetKb"
                type="number"
                min={1}
                placeholder="例如 500"
                value={targetKb}
                onChange={(e) => setTargetKb(e.target.value === '' ? '' : Number(e.target.value))}
              />
            </div>
          ) : null}
        </div>

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={files.length === 0 || pending}
            onClick={async () => {
              if (files.length === 0) return
              setResult(null)
              try {
                const res = await run((onProgress) =>
                  batchProcess(
                    files,
                    {
                      action,
                      outputFormat: action === 'convert' ? format : undefined,
                      quality:
                        action === 'convert' ? (format === 'png' ? undefined : quality) : quality,
                      targetKb: targetKb === '' ? undefined : targetKb,
                    },
                    onProgress,
                  ),
                )
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? '处理中…' : '开始处理'}
          </Button>

          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                ZIP：{result.archive.filename} · {formatBytes(result.archive.size)}
              </p>
              <BatchDownloadButton batch={result} />
            </div>
          ) : null}
        </div>
      </div>
    </ToolPageShell>
  )
}
