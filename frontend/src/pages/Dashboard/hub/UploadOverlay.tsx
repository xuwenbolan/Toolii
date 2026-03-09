import { UploadCloud } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function UploadOverlay() {
  const { t } = useTranslation('hub')

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="flex flex-col items-center gap-3 rounded-xl border-2 border-dashed border-foreground/20 px-12 py-10">
        <UploadCloud className="h-10 w-10 text-muted-foreground" />
        <p className="text-sm font-medium">{t('dropToUpload')}</p>
        <p className="text-xs text-muted-foreground">{t('uploadHint')}</p>
      </div>
    </div>
  )
}
