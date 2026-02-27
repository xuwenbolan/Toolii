import { useState } from 'react'
import { useTranslation } from 'react-i18next'

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
  const { t } = useTranslation('credits')
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
          setError(t('redeem.invalidFormat'))
          return
        }

        setPending(true)
        try {
          const result = await redeemCredits(normalized)
          setSuccess(t('redeem.success', { amount: result.added_credits, balance: result.balance }))
          setCode('')
          onRedeemed?.(result)
        } catch (err) {
          setError(getApiErrorMessage(err, t('redeem.failed')))
        } finally {
          setPending(false)
        }
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="redeemCode">{t('redeem.placeholder')}</Label>
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
        <p className="text-xs text-muted-foreground">{t('redeem.formatHint')}</p>
      </div>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-700 dark:text-emerald-300">{success}</p> : null}

      <Button className="w-full" type="submit" disabled={pending}>
        {pending ? t('redeem.redeeming') : t('redeem.button')}
      </Button>
    </form>
  )
}
