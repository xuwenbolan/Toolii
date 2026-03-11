import { useTranslation } from 'react-i18next'

import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { GatedDownloadButton } from '@/components/tools/GatedDownloadButton'
import { ShareResultButton } from '@/components/tools/ShareResultButton'
import { Button } from '@/components/ui/button'
import { formatBytes } from '@/lib/fileValidation'
import { getResultDisplayUrl, type FileResult } from '@/services/imageApi'

type Props = {
  file: File
  result: FileResult
  inputPreviewUrl: string | undefined
  shareType: string
  onClose: () => void
  /** Override the preview section with a custom element (e.g. ImageCompareSlider) */
  preview?: React.ReactNode
}

/**
 * Standard result-panel content for single-file image tools:
 * before/after preview + back · share · download buttons.
 */
export function ImageResultContent({
  file,
  result,
  inputPreviewUrl,
  shareType,
  onClose,
  preview,
}: Props) {
  const { t } = useTranslation('common')

  return (
    <div className="space-y-4">
      {preview ?? (
        <BeforeAfterPreview
          beforeFilename={file.name}
          beforeSizeText={formatBytes(file.size)}
          beforeUrl={inputPreviewUrl}
          afterFilename={result.filename}
          afterSizeText={formatBytes(result.size)}
          afterUrl={getResultDisplayUrl(result)}
          protectedPreview={result.requires_credit}
        />
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" variant="outline" onClick={onClose}>
          {t('actions.back')}
        </Button>
        <ShareResultButton
          originalFile={file}
          resultFileId={result.file_id}
          resultSize={result.size}
          shareType={shareType}
          className="w-auto"
        />
        <GatedDownloadButton result={result} className="w-auto" />
      </div>
    </div>
  )
}
