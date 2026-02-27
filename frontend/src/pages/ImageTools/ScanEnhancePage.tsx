import { useMemo, useState } from 'react'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { enhanceScan, type FileResult } from '@/services/imageApi'

type Mode = 'bw' | 'color'

export function ScanEnhancePage() {
  const [file, setFile] = useState<File | null>(null)
  const [mode, setMode] = useState<Mode>('bw')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <ToolPageShell title="扫描件增强" description="自动增强、黑白化（适合材料提交）。">
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

        <div className="space-y-2">
          <label className="text-sm font-medium">输出模式</label>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === 'bw' ? 'secondary' : 'outline'}
              onClick={() => setMode('bw')}
            >
              黑白
            </Button>
            <Button
              type="button"
              variant={mode === 'color' ? 'secondary' : 'outline'}
              onClick={() => setMode('color')}
            >
              彩色
            </Button>
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
                const res = await run((onProgress) => enhanceScan(file, { mode }, onProgress))
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
