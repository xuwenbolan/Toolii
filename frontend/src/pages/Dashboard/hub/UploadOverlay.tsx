import { UploadCloud } from 'lucide-react'
import { useTranslation } from 'react-i18next'

export function UploadOverlay() {
  const { t } = useTranslation('hub')

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-background/85 backdrop-blur-md">
      <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-foreground/30 bg-background/80 px-16 py-14 shadow-lg animate-in fade-in-0 slide-in-from-bottom-4 duration-[var(--duration-normal)]">
        <UploadCloud className="h-12 w-12 text-muted-foreground" />
        <p className="text-base font-semibold">{t('dropToUpload')}</p>
        <p className="text-sm text-muted-foreground">{t('uploadHint')}</p>
      </div>
    </div>
  )
}
