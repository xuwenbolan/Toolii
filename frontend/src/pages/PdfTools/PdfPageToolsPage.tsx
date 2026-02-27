import { useMemo, useState } from 'react'

import { PdfPageList } from '@/components/pdf/PdfPageList'
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
import { editPdfPages, type FileResult } from '@/services/pdfApi'

type Operation = 'rotate' | 'delete' | 'extract' | 'reorder'

function parsePageSpec(input: string): number[] {
  const raw = input.trim()
  if (!raw) return []

  const values: number[] = []
  for (const part of raw.split(',')) {
    const token = part.trim()
    if (!token) continue

    if (token.includes('-')) {
      const [startRaw, endRaw] = token.split('-', 2).map((s) => s.trim())
      const start = Number(startRaw)
      const end = Number(endRaw)
      if (!Number.isInteger(start) || !Number.isInteger(end) || start <= 0 || end <= 0) {
        throw new Error('页码范围格式无效')
      }
      const step = start <= end ? 1 : -1
      for (let n = start; step > 0 ? n <= end : n >= end; n += step) {
        values.push(n)
      }
      continue
    }

    const page = Number(token)
    if (!Number.isInteger(page) || page <= 0) {
      throw new Error('页码格式无效')
    }
    values.push(page)
  }

  return values
}

export function PdfPageToolsPage() {
  const [file, setFile] = useState<File | null>(null)
  const [operation, setOperation] = useState<Operation>('extract')
  const [pagesInput, setPagesInput] = useState('')
  const [orderInput, setOrderInput] = useState('')
  const [rotation, setRotation] = useState(90)
  const [result, setResult] = useState<FileResult | null>(null)
  const { pending, progress, error, reset, run } = useFileUpload()

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  const parsedPagesPreview = useMemo(() => {
    try {
      return { pages: parsePageSpec(pagesInput), error: null as string | null }
    } catch (err) {
      return {
        pages: [] as number[],
        error: err instanceof Error ? err.message : '页码格式无效',
      }
    }
  }, [pagesInput])

  const parsedOrderPreview = useMemo(() => {
    try {
      if (!orderInput.trim()) return { pages: [] as number[], error: null as string | null }
      return { pages: parsePageSpec(orderInput), error: null as string | null }
    } catch (err) {
      return {
        pages: [] as number[],
        error: err instanceof Error ? err.message : '页码格式无效',
      }
    }
  }, [orderInput])

  const inputError =
    operation === 'reorder' ? parsedOrderPreview.error : parsedPagesPreview.error

  return (
    <ToolPageShell title="页面操作" description="抽取、删除、旋转、重排页面" backTo="/pdf-tools">
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

        <div className="grid gap-4">
          <div className="space-y-2">
            <Label htmlFor="operation">操作</Label>
            <select
              id="operation"
              className="h-9 w-full rounded-md border bg-background px-3 text-sm"
              value={operation}
              onChange={(e) => {
                setResult(null)
                setOperation(e.target.value as Operation)
              }}
            >
              <option value="extract">抽取</option>
              <option value="delete">删除</option>
              <option value="rotate">旋转</option>
              <option value="reorder">重排</option>
            </select>
          </div>

          {operation === 'reorder' ? (
            <div className="space-y-2">
              <Label htmlFor="orderInput">新顺序（如 3,1,2）</Label>
              <Input
                id="orderInput"
                placeholder="例如 3,1,2"
                value={orderInput}
                onChange={(e) => setOrderInput(e.target.value)}
              />
            </div>
          ) : null}

          {operation !== 'reorder' ? (
            <div className="space-y-2">
              <Label htmlFor="pagesInput">
                页码（如 1,3,5-8）
                {operation === 'rotate' ? '；留空=全部页面' : ''}
              </Label>
              <Input
                id="pagesInput"
                placeholder={operation === 'rotate' ? '留空表示全部页面' : '例如 1,3,5-8'}
                value={pagesInput}
                onChange={(e) => setPagesInput(e.target.value)}
              />
            </div>
          ) : null}

          {operation === 'rotate' ? (
            <div className="space-y-2">
              <Label htmlFor="rotation">旋转角度（90 的倍数）</Label>
              <Input
                id="rotation"
                type="number"
                step={90}
                value={rotation}
                onChange={(e) => setRotation(Number(e.target.value))}
              />
            </div>
          ) : null}
        </div>

        {operation !== 'reorder' ? (
          <PdfPageList pages={parsedPagesPreview.pages} />
        ) : (
          <PdfPageList pages={parsedOrderPreview.pages} />
        )}
        {inputError ? <p className="text-sm text-destructive">{inputError}</p> : null}

        <ProcessingStatus pending={pending} error={error} />
        <UploadProgress value={pending ? progress : null} />

        <div className="space-y-4">
          <Button
            type="button"
            className="w-full"
            disabled={!file || pending || !!inputError}
            onClick={async () => {
              if (!file) return
              setResult(null)
              try {
                const pagesList = operation === 'reorder' ? null : parsePageSpec(pagesInput)
                const orderList = operation === 'reorder' ? parsePageSpec(orderInput) : null
                const res = await run((onProgress) =>
                  editPdfPages(
                    file,
                    {
                      operation,
                      pages: pagesList && pagesList.length > 0 ? pagesList : undefined,
                      order: orderList && orderList.length > 0 ? orderList : undefined,
                      rotation,
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
