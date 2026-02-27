import { cn } from '@/lib/utils'

type Props = {
  steps: string[]
  currentStep: number
}

export function StepIndicator({ steps, currentStep }: Props) {
  return (
    <div className="rounded-xl border border-border/70 bg-card/60 p-3">
      <ol className="grid grid-cols-5 gap-2">
        {steps.map((step, index) => {
          const active = index <= currentStep
          return (
            <li key={step} className="min-w-0">
              <div className="flex flex-col items-center gap-1 text-center">
                <div
                  className={cn(
                    'flex h-7 w-7 items-center justify-center rounded-full border text-xs font-semibold',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background text-muted-foreground',
                  )}
                >
                  {index + 1}
                </div>
                <span className={cn('line-clamp-2 text-[11px]', active ? 'text-foreground' : 'text-muted-foreground')}>
                  {step}
                </span>
              </div>
            </li>
          )
        })}
      </ol>
    </div>
  )
}

