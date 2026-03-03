import { useTranslation } from 'react-i18next'

import { ShareLinkDialog } from '@/components/common/ShareLinkDialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  shareUrl: string
}

export function ShareDialog({ open, onOpenChange, shareUrl }: Props) {
  const { t } = useTranslation('faceMap')

  return (
    <ShareLinkDialog
      open={open}
      onOpenChange={onOpenChange}
      shareUrl={shareUrl}
      title={t('share.dialogTitle')}
      expiryNotice={t('share.expiryNotice')}
      copyLabel={t('share.copyLink')}
      copiedLabel={t('share.copied')}
    />
  )
}
