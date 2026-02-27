import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

import { RedeemCreditsDialog } from '@/components/credits/RedeemCreditsDialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
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

function formatTxLabel(txType: string) {
  if (txType === 'photo_export') return '证件照导出'
  if (txType === 'photo_layout') return '6x4 排版导出'
  if (txType === 'redeem') return '卡密兑换'
  if (txType === 'share_claim') return '领取分享'
  if (txType === 'share_create') return '创建分享'
  return txType
}

function formatTime(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('zh-CN', {
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
  actionLabel = '当前操作',
  transactions = [],
  transactionsPending,
  transactionsError,
  onRefreshBalance,
  onRedeemed,
}: Props) {
  const [redeemDialogOpen, setRedeemDialogOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onOpenChange(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, onOpenChange])

  if (!open) return null

  const currentBalance = typeof balance === 'number' ? balance : 0
  const gap = Math.max(0, requiredCredits - currentBalance)

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="关闭弹窗"
        className="absolute inset-0 bg-black/45"
        onClick={() => onOpenChange(false)}
      />
      <div className="absolute inset-x-4 top-1/2 mx-auto w-auto max-w-md -translate-y-1/2">
        <Card className="shadow-2xl">
          <CardHeader className="space-y-2 pb-3">
            <div className="inline-flex w-fit rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-xs text-amber-700 dark:text-amber-300">
              Credits 余额不足
            </div>
            <CardTitle className="text-base">{actionLabel}需要 Credits</CardTitle>
            <p className="text-sm text-muted-foreground">
              当前余额 <span className="font-medium text-foreground">{currentBalance}</span>，本次需要{' '}
              <span className="font-medium text-foreground">{requiredCredits}</span>，还差{' '}
              <span className="font-medium text-foreground">{gap}</span>。
            </p>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-medium">最近流水</p>
                <Button type="button" size="sm" variant="outline" onClick={() => onRefreshBalance?.()}>
                  刷新余额
                </Button>
              </div>

              {transactionsPending ? (
                <p className="text-xs text-muted-foreground">正在加载流水…</p>
              ) : transactionsError ? (
                <p className="text-xs text-destructive">流水加载失败：{transactionsError}</p>
              ) : transactions.length === 0 ? (
                <p className="text-xs text-muted-foreground">暂无流水记录</p>
              ) : (
                <div className="space-y-2">
                  {transactions.slice(0, 5).map((item) => (
                    <div key={item.id} className="flex items-center justify-between gap-2 text-xs">
                      <div className="min-w-0">
                        <p className="truncate">{formatTxLabel(item.tx_type)}</p>
                        <p className="text-muted-foreground">{formatTime(item.created_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className={item.amount < 0 ? 'text-amber-700 dark:text-amber-300' : 'text-emerald-700 dark:text-emerald-300'}>
                          {item.amount > 0 ? `+${item.amount}` : item.amount}
                        </p>
                        <p className="text-muted-foreground">余额 {item.balance_after}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
              你可以前往兑换页进行卡密兑换，或通过分享链接领取 Credits。
            </div>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                我知道了
              </Button>
              <Button type="button" onClick={() => setRedeemDialogOpen(true)}>
                快速兑换
              </Button>
              <Button asChild type="button" onClick={() => onOpenChange(false)}>
                <Link to="/credits/redeem">去兑换 / 分享</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

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
    </div>
  )
}
