import { useMemo, useState } from 'react'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { Button } from '@/components/ui/button'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import { convertImage, type FileResult } from '@/services/imageApi'

export function HeicToJpgPage() {
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  return (
    <ToolPageShell title="HEIC 转 JPG" description="将 HEIC/HEIF 图片转换为 JPG。">
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
                  convertImage(file, { outputFormat: 'jpeg', quality: 92 }, onProgress),
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
