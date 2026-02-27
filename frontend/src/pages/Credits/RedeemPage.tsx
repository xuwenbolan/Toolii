import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { BalanceDisplay } from '@/components/credits/BalanceDisplay'
import { RedeemForm } from '@/components/credits/RedeemForm'
import { ShareCreditsDialog } from '@/components/credits/ShareCreditsDialog'
import { TransactionList } from '@/components/credits/TransactionList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCredits } from '@/hooks/useCredits'

export function RedeemPage() {
  const { t } = useTranslation('credits')
  const credits = useCredits({ enabled: true, includeTransactions: true, transactionsLimit: 20 })
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  return (
    <>
      <SEOHead title={t('redeemPage.seoTitle')} noindex />
      <div className="space-y-4">
        <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('redeemPage.title')}</CardTitle>
          <p className="text-sm text-muted-foreground">
            {t('redeemPage.description')}
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <BalanceDisplay
            balance={credits.balance}
            pending={credits.balancePending}
            error={credits.balanceError}
            onRefresh={() => {
              void credits.refreshAll()
            }}
          />
          <RedeemForm
            onRedeemed={() => {
              void credits.refreshAll()
            }}
          />
          <div className="flex justify-end">
            <Button type="button" variant="outline" className="w-full sm:w-auto" onClick={() => setShareDialogOpen(true)}>
              {t('redeemPage.shareButton')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{t('redeemPage.recentTransactions')}</CardTitle>
        </CardHeader>
        <CardContent>
          <TransactionList
            items={credits.transactions}
            pending={credits.transactionsPending}
            error={credits.transactionsError}
          />
        </CardContent>
      </Card>

      <ShareCreditsDialog
        open={shareDialogOpen}
        onOpenChange={setShareDialogOpen}
        onChanged={() => {
          void credits.refreshAll()
        }}
      />
    </div>
    </>
  )
}
