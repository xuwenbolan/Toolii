import { useTranslation } from 'react-i18next'
import { SortableFileList } from '@/components/tools/SortableFileList'

type Props = {
  files: File[]
  onReorder: (nextFiles: File[]) => void
  onRemove: (index: number) => void
}

export function PdfMergeList({ files, onReorder, onRemove }: Props) {
  const { t } = useTranslation('tools')

  return (
    <SortableFileList
      files={files}
      kind="pdf"
      hint={t('pdf.merge.orderHint')}
      onReorder={onReorder}
      onRemove={onRemove}
    />
  )
}
