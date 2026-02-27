import { useMemo, useState } from 'react'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { imagesToPdf, type FileResult } from '@/services/pdfApi'

export function ImagesToPdfPage() {
  const [files, setFiles] = useState<File[]>([])
  const [dpi, setDpi] = useState(150)
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (files.length === 0) return null
    const total = files.reduce((acc, file) => acc + file.size, 0)
    return `${files.length} 张图片 · ${formatBytes(total)}`
  }, [files])

  return (
    <ToolPageShell title="图转 PDF" description="多张图片生成一个 PDF" backTo="/pdf-tools">
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

        {files.length > 0 ? (
          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs text-muted-foreground">当前顺序将作为 PDF 页顺序</p>
            <div className="space-y-1">
              {files.map((file, index) => (
                <p key={`${file.name}-${index}`} className="truncate text-sm">
                  {index + 1}. {file.name}
                </p>
              ))}
            </div>
          </div>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="dpi">DPI（72-600）</Label>
          <Input
            id="dpi"
            type="number"
            min={72}
            max={600}
            value={dpi}
            onChange={(e) => setDpi(Number(e.target.value))}
          />
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
                const res = await run((onProgress) => imagesToPdf(files, { dpi }, onProgress))
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? '处理中…' : '开始转换'}
          </Button>

          {result ? (
            <div className="space-y-2 rounded-md border p-3">
              <p className="text-xs text-muted-foreground">
                输出：{result.filename} · {formatBytes(result.size)}
              </p>
              <DownloadButton url={result.download_url} />
            </div>
          ) : null}
        </div>
      </div>
    </ToolPageShell>
  )
}

