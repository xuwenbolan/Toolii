import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { redeemCredits, type RedeemCreditsResponse } from '@/services/creditsApi'

type Props = {
  onRedeemed?: (result: RedeemCreditsResponse) => void
}

const CARD_CODE_RE = /^TOOL-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/

function getApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe?.response?.data?.message || fallback
}

export function RedeemForm({ onRedeemed }: Props) {
  const [code, setCode] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const normalized = code.trim().toUpperCase()

  return (
    <form
      className="space-y-3"
      onSubmit={async (event) => {
        event.preventDefault()
        setError(null)
        setSuccess(null)

        if (!CARD_CODE_RE.test(normalized)) {
          setError('卡密格式错误，应为 TOOL-XXXX-XXXX-XXXX')
          return
        }

        setPending(true)
        try {
          const result = await redeemCredits(normalized)
          setSuccess(`兑换成功，到账 ${result.added_credits} Credits（余额 ${result.balance}）`)
          setCode('')
          onRedeemed?.(result)
        } catch (err) {
          setError(getApiErrorMessage(err, '兑换失败，请检查卡密后重试。'))
        } finally {
          setPending(false)
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="redeemCode">输入卡密</Label>
        <Input
          id="redeemCode"
          value={code}
          placeholder="TOOL-ABCD-EFGH-JKLM"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase())
            setError(null)
            setSuccess(null)
          }}
        />
        <p className="text-xs text-muted-foreground">格式：TOOL-XXXX-XXXX-XXXX</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p> : null}

      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? '兑换中…' : '兑换 Credits'}
      </Button>
    </form>
  )
}
