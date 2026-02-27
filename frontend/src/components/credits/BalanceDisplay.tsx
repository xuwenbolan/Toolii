import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  balance: number | null
  pending?: boolean
  error?: string | null
  requiredCredits?: number
  onRefresh?: () => void
  className?: string
}

export function BalanceDisplay({
  balance,
  pending,
  error,
  requiredCredits = 1,
  onRefresh,
  className,
}: Props) {
  const hasBalance = typeof balance === 'number'
  const enough = hasBalance && balance >= requiredCredits

  return (
    <div className={cn('rounded-lg border bg-muted/30 p-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">当前 Credits</p>
          <div className="flex items-center gap-2">
            <p className="text-lg font-semibold tabular-nums">{hasBalance ? balance : '—'}</p>
            <span
              className={cn(
                'inline-flex rounded-full border px-2 py-0.5 text-[11px]',
                enough
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300',
              )}
            >
              {hasBalance ? (enough ? `可用（≥${requiredCredits}）` : `不足（需 ${requiredCredits}）`) : '未加载'}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            导出无水印与 6x4 排版各消耗 {requiredCredits} Credit。
          </p>
          {error ? <p className="text-xs text-destructive">余额获取失败：{error}</p> : null}
        </div>

        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => onRefresh?.()}
        >
          {pending ? '刷新中…' : '刷新'}
        </Button>
      </div>
    </div>
  )
}
