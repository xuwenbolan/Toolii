import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type Props = {
  value: number
  duration?: number
  className?: string
  formatter?: (value: number) => string
}

export function AnimatedCounter({
  value,
  duration = 220,
  className,
  formatter = (next) => next.toLocaleString(),
}: Props) {
  const [displayValue, setDisplayValue] = useState(value)
  const previousValueRef = useRef(value)

  useEffect(() => {
    const from = previousValueRef.current
    const to = value
    previousValueRef.current = value

    if (from === to) {
      setDisplayValue(to)
      return
    }

    if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setDisplayValue(to)
      return
    }

    let frameId = 0
    const startedAt = performance.now()

    const tick = (now: number) => {
      const progress = Math.min(1, (now - startedAt) / Math.max(duration, 16))
      const eased = 1 - (1 - progress) ** 3
      const next = from + (to - from) * eased
      setDisplayValue(Math.round(next))

      if (progress < 1) {
        frameId = window.requestAnimationFrame(tick)
      }
    }

    frameId = window.requestAnimationFrame(tick)

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId)
    }
  }, [duration, value])

  return <span className={cn('tabular-nums', className)}>{formatter(displayValue)}</span>
}
