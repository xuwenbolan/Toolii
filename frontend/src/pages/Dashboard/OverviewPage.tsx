import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { BalanceDisplay } from '@/components/credits/BalanceDisplay'
import { RedeemCreditsDialog } from '@/components/credits/RedeemCreditsDialog'
import { ShareCreditsDialog } from '@/components/credits/ShareCreditsDialog'
import { TransactionList } from '@/components/credits/TransactionList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCredits } from '@/hooks/useCredits'
import { useAuthStore } from '@/stores/authStore'

export function OverviewPage() {
  const { t } = useTranslation('credits')
  const user = useAuthStore((s) => s.user)
  const credits = useCredits({ enabled: true, includeTransactions: true, transactionsLimit: 5 })
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  return (
    <>
      <SEOHead title={t('overview.seoTitle')} noindex />
      <div className="space-y-4">
        <Card>
        <CardHeader>
          <CardTitle>{t('overview.title')}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>{t('overview.greeting', { name: user?.name ?? user?.email })}</p>
          <BalanceDisplay
            balance={credits.balance}
            pending={credits.balancePending}
            error={credits.balanceError}
            onRefresh={() => {
              void credits.refreshAll()
            }}
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" onClick={() => setRedeemDialogOpen(true)}>
              {t('overview.quickRedeem')}
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/redeem">{t('overview.redeemPage')}</Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShareDialogOpen(true)}>
              {t('overview.shareCredits')}
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/dashboard/transactions">{t('overview.viewTransactions')}</Link>
            </Button>
          </div>
          <p>{t('overview.devNote')}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">{t('overview.recentTransactions')}</CardTitle>
            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
              <Link to="/dashboard/transactions">{t('overview.allTransactions')}</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <TransactionList
            items={credits.transactions}
            pending={credits.transactionsPending}
            error={credits.transactionsError}
            emptyText={t('overview.noTransactions')}
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
      <RedeemCreditsDialog
        open={redeemDialogOpen}
        onOpenChange={setRedeemDialogOpen}
        closeOnRedeemed
        onChanged={() => {
          void credits.refreshAll()
        }}
      />
    </div>
    </>
  )
}
