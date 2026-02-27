import { useTranslation } from 'react-i18next'

import type { FileResult } from '@/services/imageApi'

import { ArtifactPreviewCard } from '@/components/tools/ArtifactPreviewCard'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { formatBytes } from '@/lib/fileValidation'

type Props = {
  result: FileResult | null
}

export function PrintLayoutPreview({ result }: Props) {
  const { t } = useTranslation('idPhoto')

  if (!result) return null

  return (
    <ArtifactPreviewCard
      label={t('printLayout.generated')}
      filename={result.filename}
      sizeText={formatBytes(result.size)}
      mediaKind="pdf"
      action={
        <DownloadButton
          url={result.download_url}
          label={t('printLayout.download')}
          className="w-auto"
        />
      }
      className="rounded-xl"
    />
  )
}
