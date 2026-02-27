import type { CreditTransactionItem } from '@/services/creditsApi'

type Props = {
  items: CreditTransactionItem[]
  pending?: boolean
  error?: string | null
  emptyText?: string
}

function formatTxLabel(txType: string) {
  switch (txType) {
    case 'redeem':
      return '卡密兑换'
    case 'photo_export':
      return '证件照导出'
    case 'photo_layout':
      return '6x4 排版导出'
    case 'share_create':
      return '创建分享（冻结）'
    case 'share_claim':
      return '领取分享'
    case 'share_cancel_refund':
      return '取消分享退回'
    case 'share_expire_refund':
      return '过期分享退回'
    default:
      return txType
  }
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

export function TransactionList({
  items,
  pending,
  error,
  emptyText = '暂无交易流水',
}: Props) {
  if (pending) {
    return <p className="text-sm text-muted-foreground">正在加载交易流水…</p>
  }
  if (error) {
    return <p className="text-sm text-destructive">交易流水加载失败：{error}</p>
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText}</p>
  }

  return (
    <div className="space-y-2">
      {items.map((item) => (
        <div
          key={item.id}
          className="flex flex-col gap-2 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{formatTxLabel(item.tx_type)}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.description || '—'} · {formatTime(item.created_at)}
            </p>
            <p className="truncate text-[11px] text-muted-foreground">
              {item.reference_id ? `Ref: ${item.reference_id}` : `Tx #${item.id}`}
            </p>
          </div>
          <div className="text-left sm:text-right">
            <p
              className={
                item.amount >= 0
                  ? 'text-sm font-semibold text-emerald-700 dark:text-emerald-300'
                  : 'text-sm font-semibold text-amber-700 dark:text-amber-300'
              }
            >
              {item.amount > 0 ? `+${item.amount}` : item.amount}
            </p>
            <p className="text-xs text-muted-foreground">余额 {item.balance_after}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
