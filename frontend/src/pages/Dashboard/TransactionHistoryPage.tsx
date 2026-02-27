import { useState } from 'react'
import { Link } from 'react-router-dom'

import { RedeemCreditsDialog } from '@/components/credits/RedeemCreditsDialog'
import { TransactionList } from '@/components/credits/TransactionList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCredits } from '@/hooks/useCredits'

export function TransactionHistoryPage() {
  const credits = useCredits({ enabled: true, includeTransactions: true, transactionsLimit: 50 })
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)

  return (
    <>
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3">
            <CardTitle>交易流水</CardTitle>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => void credits.refreshAll()}>
                刷新
              </Button>
              <Button type="button" size="sm" onClick={() => setRedeemDialogOpen(true)}>
                快速兑换
              </Button>
              <Button asChild type="button" size="sm" variant="outline">
                <Link to="/credits/redeem">兑换页</Link>
              </Button>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            最近 {credits.transactions.length} 条记录（共 {credits.transactionsTotal} 条）。
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
