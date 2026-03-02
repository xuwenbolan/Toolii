import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { RedeemCreditsDialog } from '@/components/credits/RedeemCreditsDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { CreditTransactionItem } from '@/services/creditsApi'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  requiredCredits?: number
  balance: number | null
  actionLabel?: string
  transactions?: CreditTransactionItem[]
  transactionsPending?: boolean
  transactionsError?: string | null
  onRefreshBalance?: () => void
  onRedeemed?: () => void
}

function formatTime(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function InsufficientCreditsDialog({
  open,
  onOpenChange,
  requiredCredits = 1,
  balance,
  actionLabel,
  transactions = [],
  transactionsPending,
  transactionsError,
  onRefreshBalance,
  onRedeemed,
}: Props) {
  const { t, i18n } = useTranslation('credits')
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)

  const resolvedActionLabel = actionLabel ?? t('insufficient.defaultAction')

  const txLabelMap: Record<string, string> = {
    photo_export: t('insufficient.photoExport'),
    photo_layout: t('insufficient.photoLayout'),
    redeem: t('insufficient.redeem'),
    share_claim: t('insufficient.shareClaim'),
    share_create: t('insufficient.shareCreate'),
  }

  function formatTxLabel(txType: string) {
    return txLabelMap[txType] ?? txType
  }

  const currentBalance = typeof balance === 'number' ? balance : 0
  const gap = Math.max(0, requiredCredits - currentBalance)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-[calc(100%-2rem)] p-0 sm:max-w-xl">
        <DialogTitle className="sr-only">{t('insufficient.needCredits', { actionLabel: resolvedActionLabel })}</DialogTitle>
        <DialogDescription className="sr-only">{t('insufficient.hint')}</DialogDescription>
        <Card className="w-full border-0 shadow-none">
          <CardHeader className="space-y-2 pb-3">
            <div className="inline-flex w-fit rounded-full border border-warning/30 bg-warning/10 px-2 py-1 text-xs text-warning">
              {t('insufficient.badge')}
            </div>
            <CardTitle className="text-base">{t('insufficient.needCredits', { actionLabel: resolvedActionLabel })}</CardTitle>
            <p className="text-sm text-muted-foreground">
              {t('insufficient.currentBalance')} <span className="font-medium text-foreground">{currentBalance}</span>
              {', '}{t('insufficient.thisTimeNeed')} <span className="font-medium text-foreground">{requiredCredits}</span>
              {', '}{t('insufficient.shortBy')} <span className="font-medium text-foreground">{gap}</span>{'.'}
            </p>
          </CardHeader>

          <CardContent className="max-h-[min(85dvh,44rem)] space-y-4 overflow-y-auto pr-1">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-xs font-medium">{t('insufficient.recentTransactions')}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="w-full sm:w-auto"
                  onClick={() => onRefreshBalance?.()}
                >
                  {t('insufficient.refreshBalance')}
                </Button>
              </div>

              {transactionsPending ? (
                <p className="text-xs text-muted-foreground">{t('insufficient.transactionsLoading')}</p>
              ) : transactionsError ? (
                <p className="text-xs text-destructive">{t('insufficient.transactionsLoadFailed', { error: transactionsError })}</p>
              ) : transactions.length === 0 ? (
                <p className="text-xs text-muted-foreground">{t('insufficient.noTransactions')}</p>
              ) : (
                <div className="space-y-2">
                  {transactions.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-1 text-xs sm:flex-row sm:items-center sm:justify-between sm:gap-2"
                    >
                      <div className="min-w-0">
                        <p className="truncate">{formatTxLabel(item.tx_type)}</p>
                        <p className="text-muted-foreground">{formatTime(item.created_at, i18n.language)}</p>
                      </div>
                      <div className="text-right">
                        <p className={item.amount < 0 ? 'text-warning' : 'text-success'}>
                          {item.amount > 0 ? `+${item.amount}` : item.amount}
                        </p>
                        <p className="text-muted-foreground">{t('insufficient.transactionBalance', { balance: item.balance_after })}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              {t('insufficient.hint')}
            </div>

            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                {t('insufficient.dismiss')}
              </Button>
              <Button type="button" className="w-full sm:w-auto" onClick={() => setRedeemDialogOpen(true)}>
                {t('insufficient.quickRedeem')}
              </Button>
              <Button asChild type="button" className="w-full sm:w-auto" onClick={() => onOpenChange(false)}>
                <Link to="/dashboard/redeem">{t('insufficient.goRedeem')}</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </DialogContent>
      <RedeemCreditsDialog
        open={redeemDialogOpen}
        onOpenChange={setRedeemDialogOpen}
        closeOnRedeemed
        onChanged={() => {
          onRefreshBalance?.()
          onRedeemed?.()
          onOpenChange(false)
        }}
      />
    </Dialog>
  )
}
