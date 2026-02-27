import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { RedeemCreditsDialog } from '@/components/credits/RedeemCreditsDialog'
import { TransactionList } from '@/components/credits/TransactionList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCredits } from '@/hooks/useCredits'

export function TransactionHistoryPage() {
  const { t } = useTranslation('credits')
  const credits = useCredits({ enabled: true, includeTransactions: true, transactionsLimit: 50 })
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)

  return (
    <>
      <SEOHead title={t('transactionHistory.seoTitle')} noindex />
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle>{t('transactionHistory.title')}</CardTitle>
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="w-full sm:w-auto"
                onClick={() => void credits.refreshAll()}
              >
                {t('transactionHistory.refresh')}
              </Button>
              <Button type="button" size="sm" className="w-full sm:w-auto" onClick={() => setRedeemDialogOpen(true)}>
                {t('transactionHistory.quickRedeem')}
              </Button>
              <Button asChild type="button" size="sm" variant="outline" className="w-full sm:w-auto">
                <Link to="/dashboard/redeem">{t('transactionHistory.redeemPage')}</Link>
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {t('transactionHistory.summary', { count: credits.transactions.length, total: credits.transactionsTotal })}
          </p>
        </CardHeader>
        <CardContent>
          <TransactionList
            items={credits.transactions}
            pending={credits.transactionsPending}
            error={credits.transactionsError}
          />
        </CardContent>
      </Card>

      <RedeemCreditsDialog
        open={redeemDialogOpen}
        onOpenChange={setRedeemDialogOpen}
        closeOnRedeemed
        onChanged={() => {
          void credits.refreshAll()
        }}
      />
    </>
  )
}
