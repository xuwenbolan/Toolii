import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/fileValidation'

type Props = {
  files: File[]
  onMove: (index: number, direction: -1 | 1) => void
  onRemove: (index: number) => void
}

export function PdfMergeList({ files, onMove, onRemove }: Props) {
  if (files.length === 0) return null

  return (
    <div className="space-y-2">
      {files.map((file, index) => (
        <div
          key={`${file.name}-${index}-${file.size}`}
          className="flex items-center gap-2 rounded-md border p-2"
        >
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{file.name}</p>
            <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={index === 0}
            onClick={() => onMove(index, -1)}
          >
            上移
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={index === files.length - 1}
            onClick={() => onMove(index, 1)}
          >
            下移
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => onRemove(index)}>
            移除
          </Button>
        </div>
      ))}
    </div>
  )
}
