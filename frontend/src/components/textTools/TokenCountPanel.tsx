import { useTranslation } from 'react-i18next'
import { Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { MODELS } from '@/lib/tokenCounter'
import type { TokenResult } from '@/hooks/useTextStats'
import { AnimatedCounter } from './AnimatedCounter'

type Props = {
  modelId: string
  onModelChange: (id: string) => void
  tokens: TokenResult
}

// Group models by their group field
const MODEL_GROUPS = MODELS.reduce<Record<string, typeof MODELS>>((acc, m) => {
  ;(acc[m.group] ??= []).push(m)
  return acc
}, {})

export function TokenCountPanel({ modelId, onModelChange, tokens }: Props) {
  const { t } = useTranslation('textTools')

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label>{t('token.model')}</Label>
        <Select value={modelId} onValueChange={onModelChange}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(MODEL_GROUPS).map(([group, models]) => (
              <SelectGroup key={group}>
                <SelectLabel>{group}</SelectLabel>
                {models.map((m) => (
                  <SelectItem key={m.id} value={m.id}>
                    {m.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center gap-3 rounded-lg border p-4">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-2xl font-bold tabular-nums">
              {tokens.loading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : (
                <AnimatedCounter value={tokens.count} />
              )}
            </span>
          </div>
          <div className="text-sm text-muted-foreground">{t('token.tokens')}</div>
        </div>
        <Badge variant={tokens.model.accuracy === 'exact' ? 'default' : 'secondary'}>
          {tokens.model.accuracy === 'exact'
            ? t('token.exact', { pct: tokens.model.accuracyPct })
            : t('token.estimate', { pct: tokens.model.accuracyPct })}
        </Badge>
      </div>
    </div>
  )
}
