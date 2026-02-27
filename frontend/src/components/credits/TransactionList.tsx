import { useTranslation } from 'react-i18next'

import type { CreditTransactionItem } from '@/services/creditsApi'

type Props = {
  items: CreditTransactionItem[]
  pending?: boolean
  error?: string | null
  emptyText?: string
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

export function TransactionList({
  items,
  pending,
  error,
  emptyText,
}: Props) {
  const { t, i18n } = useTranslation('credits')

  const txLabelMap: Record<string, string> = {
    redeem: t('transaction.redeem'),
    photo_export: t('transaction.photoExport'),
    photo_layout: t('transaction.photoLayout'),
    share_create: t('transaction.shareCreate'),
    share_claim: t('transaction.shareClaim'),
    share_cancel_refund: t('transaction.shareCancelRefund'),
    share_expire_refund: t('transaction.shareExpireRefund'),
  }

  function formatTxLabel(txType: string) {
    return txLabelMap[txType] ?? txType
  }

  if (pending) {
    return <p className="text-sm text-muted-foreground">{t('transaction.loading')}</p>
  }
  if (error) {
    return <p className="text-sm text-destructive">{t('transaction.loadFailed', { error })}</p>
  }
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyText ?? t('transaction.empty')}</p>
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
              {item.description || '--'} · {formatTime(item.created_at, i18n.language)}
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
            <p className="text-xs text-muted-foreground">{t('transaction.balance', { balance: item.balance_after })}</p>
          </div>
        </div>
      ))}
    </div>
  )
}
