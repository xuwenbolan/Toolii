import { useMemo, useState } from 'react'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { convertImage, type FileResult } from '@/services/imageApi'

type Format = 'jpeg' | 'png' | 'webp'

export function ConvertPage() {
  const [file, setFile] = useState<File | null>(null)
  const [format, setFormat] = useState<Format>('jpeg')
  const [quality, setQuality] = useState(92)
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <ToolPageShell title="格式转换" description="支持 JPG / PNG / WEBP。">
      <div className="space-y-5">
        <FileDropzone
          accept="image/*"
          onFiles={(files) => {
            reset()
            setResult(null)
            setFile(files[0])
          }}
        />

        {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="format">输出格式</Label>
            <select
              id="format"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={format}
              onChange={(e) => setFormat(e.target.value as Format)}
            >
              <option value="jpeg">JPG</option>
              <option value="png">PNG</option>
              <option value="webp">WEBP</option>
            </select>
          </div>

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
        </div>

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={!file || pending}
            onClick={async () => {
              if (!file) return
              setResult(null)
              try {
                const res = await run((onProgress) =>
                  convertImage(
                    file,
                    {
                      outputFormat: format,
                      quality: format === 'png' ? undefined : quality,
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
