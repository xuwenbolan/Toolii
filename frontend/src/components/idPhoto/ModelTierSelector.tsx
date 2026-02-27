import { Label } from '@/components/ui/label'

type Tier = 'fast' | 'balanced' | 'hq'

type Props = {
  value: Tier
  onChange: (value: Tier) => void
}

const TIERS: Array<{ value: Tier; label: string; desc: string }> = [
  { value: 'fast', label: '快速', desc: '速度优先，适合大多数情况' },
  { value: 'balanced', label: '平衡', desc: '效果与速度平衡' },
  { value: 'hq', label: '高质量', desc: '更慢，适合复杂背景' },
]

export function ModelTierSelector({ value, onChange }: Props) {
  return (
    <div className="space-y-2">
      <Label>抠图模型档位</Label>
      <div className="grid gap-2">
        {TIERS.map((tier) => (
          <button
            key={tier.value}
            type="button"
            className={[
              'rounded-md border px-3 py-2 text-left',
              value === tier.value ? 'border-primary bg-accent/40' : '',
            ].join(' ')}
            onClick={() => onChange(tier.value)}
          >
            <p className="text-sm font-medium">{tier.label}</p>
            <p className="text-xs text-muted-foreground">{tier.desc}</p>
          </button>
        ))}
      </div>
    </div>
  )
}

