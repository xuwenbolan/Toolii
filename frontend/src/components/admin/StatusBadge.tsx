import { Badge } from '@/components/ui/badge'

const DEFAULT_COLORS: Record<string, string> = {
  // card statuses
  unused: 'bg-info-light text-info border-info/20',
  redeemed: 'bg-success-light text-success border-success/20',
  expired: 'bg-warning-light text-warning border-warning/20',
  disabled: 'bg-destructive-light text-destructive border-destructive/20',
  // user statuses
  active: 'bg-success-light text-success border-success/20',
  inactive: 'bg-destructive-light text-destructive border-destructive/20',
  // share link statuses
  pending: 'bg-warning-light text-warning border-warning/20',
  claimed: 'bg-success-light text-success border-success/20',
  canceled: 'bg-muted text-muted-foreground border-border',
  // processing statuses
  done: 'bg-success-light text-success border-success/20',
  failed: 'bg-destructive-light text-destructive border-destructive/20',
  // feedback statuses
  reviewed: 'bg-info-light text-info border-info/20',
  resolved: 'bg-success-light text-success border-success/20',
}

type Props = {
  status: string
  colorMap?: Record<string, string>
  label?: string
}

export function StatusBadge({ status, colorMap, label }: Props) {
  const colors = colorMap ? { ...DEFAULT_COLORS, ...colorMap } : DEFAULT_COLORS
  const colorClass = colors[status] ?? 'bg-muted text-muted-foreground'

  return (
    <Badge variant="outline" className={colorClass}>
      {label ?? status}
    </Badge>
  )
}
