import { useTranslation } from 'react-i18next'

import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'

type Props = {
  onFiles: (files: File[]) => void
}

export function PdfWorkspaceEmpty({ onFiles }: Props) {
  const { t } = useTranslation('tools')

  return (
    <ToolWorkspaceDropzone
      accept={{ 'application/pdf': [], 'image/*': [] }}
      multiple
      title={t('pdf.workspace.emptyTitle')}
      hint={t('pdf.workspace.emptyHint')}
      browseLabel={t('pdf.workspace.browseFiles')}
      onFiles={onFiles}
      className="min-h-[60vh]"
    />
  )
}
