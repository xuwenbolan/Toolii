import { useTranslation } from 'react-i18next'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { formatBytes } from '@/lib/fileValidation'
import type { FileResult } from '@/services/imageApi'

type BatchResponseItem = {
  input_filename: string
  output: FileResult
}

type BatchResponse = {
  archive: FileResult
  items: BatchResponseItem[]
}

type Props = {
  batch: BatchResponse
}

export function BatchDownloadButton({ batch }: Props) {
  const { t } = useTranslation('common')

  return (
    <div className="space-y-3">
      <DownloadButton url={batch.archive.download_url} label={t('actions.downloadZip')} />

      <details className="rounded-md border p-3">
        <summary className="cursor-pointer text-sm font-medium">
          {t('actions.viewResults', { count: batch.items.length })}
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
              <DownloadButton
                url={item.output.download_url}
                label={t('actions.download')}
                size="sm"
                variant="outline"
                className="mt-2 w-full sm:mt-3 sm:w-auto"
              />
            </div>
          ))}
        </div>
      </details>
    </div>
  )
}
