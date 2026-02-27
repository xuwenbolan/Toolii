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
import { compressPdf, type FileResult } from '@/services/pdfApi'

export function PdfCompressPage() {
  const [file, setFile] = useState<File | null>(null)
  const [targetKb, setTargetKb] = useState<number | ''>('')
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <ToolPageShell title="PDF 压缩" description="压缩 PDF 体积（最佳努力）" backTo="/pdf-tools">
      <div className="space-y-5">
        <FileDropzone
          accept="application/pdf"
          showCamera={false}
          onFiles={(files) => {
            reset()
            setResult(null)
            setFile(files[0])
          }}
        />

        {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}

        <div className="space-y-2">
          <Label htmlFor="targetKb">目标大小（KB，可选）</Label>
          <Input
            id="targetKb"
            type="number"
            min={1}
            placeholder="例如 1000"
            value={targetKb}
            onChange={(e) => setTargetKb(e.target.value === '' ? '' : Number(e.target.value))}
          />
          <p className="text-xs text-muted-foreground">不保证严格达到目标，采用最佳努力压缩。</p>
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
                  compressPdf(file, { targetKb: targetKb === '' ? undefined : targetKb }, onProgress),
                )
                setResult(res)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {pending ? '处理中…' : '开始压缩'}
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

