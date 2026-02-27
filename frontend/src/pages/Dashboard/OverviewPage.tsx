import { useState } from 'react'
import { Link } from 'react-router-dom'

import { BalanceDisplay } from '@/components/credits/BalanceDisplay'
import { RedeemCreditsDialog } from '@/components/credits/RedeemCreditsDialog'
import { ShareCreditsDialog } from '@/components/credits/ShareCreditsDialog'
import { TransactionList } from '@/components/credits/TransactionList'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useCredits } from '@/hooks/useCredits'
import { useAuthStore } from '@/stores/authStore'

export function OverviewPage() {
  const user = useAuthStore((s) => s.user)
  const credits = useCredits({ enabled: true, includeTransactions: true, transactionsLimit: 5 })
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)
  const [shareDialogOpen, setShareDialogOpen] = useState(false)

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>控制台</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>你好，{user?.name ?? user?.email}</p>
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
              快速兑换
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link to="/dashboard/redeem">兑换页</Link>
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setShareDialogOpen(true)}>
              分享 Credits
            </Button>
            <Button asChild size="sm" variant="ghost">
              <Link to="/dashboard/transactions">查看流水</Link>
            </Button>
          </div>
          <p>Phase 6 已接入证件照导出扣费、卡密兑换基础能力与分享领取流程。</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <CardTitle className="text-base">最近交易</CardTitle>
            <Button asChild size="sm" variant="outline" className="w-full sm:w-auto">
              <Link to="/dashboard/transactions">全部流水</Link>
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <TransactionList
            items={credits.transactions}
            pending={credits.transactionsPending}
            error={credits.transactionsError}
            emptyText="暂无交易流水"
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
  )
}
