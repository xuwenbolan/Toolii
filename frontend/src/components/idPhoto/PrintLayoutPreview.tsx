import { useTranslation } from 'react-i18next'

import type { FileResult } from '@/services/imageApi'

import { DownloadButton } from '@/components/tools/DownloadButton'
import { formatBytes } from '@/lib/fileValidation'

type Props = {
  result: FileResult | null
}

export function PrintLayoutPreview({ result }: Props) {
  const { t } = useTranslation('idPhoto')

  if (!result) return null

  return (
    <div className="space-y-2 rounded-xl border p-3">
      <h3 className="text-sm font-semibold">{t('printLayout.generated')}</h3>
      <p className="text-xs text-muted-foreground">
        {result.filename} · {formatBytes(result.size)}
      </p>
      <DownloadButton url={result.download_url} label={t('printLayout.download')} />
    </div>
  )
}
