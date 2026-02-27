import { useTranslation } from 'react-i18next'

import { RedeemForm } from '@/components/credits/RedeemForm'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged?: () => void
  closeOnRedeemed?: boolean
}

export function RedeemCreditsDialog({
  open,
  onOpenChange,
  onChanged,
  closeOnRedeemed = false,
}: Props) {
  const { t } = useTranslation('credits')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] p-0 sm:max-w-md">
        <DialogTitle className="sr-only">{t('redeem.title')}</DialogTitle>
        <DialogDescription className="sr-only">{t('redeem.dialogDescription')}</DialogDescription>
        <Card className="w-full border-0 shadow-none">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">{t('redeem.title')}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('redeem.dialogDescription')}
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <RedeemForm
              onRedeemed={() => {
                onChanged?.()
                if (closeOnRedeemed) onOpenChange(false)
              }}
            />

            <div className="flex justify-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                {t('redeem.close')}
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  )
}
