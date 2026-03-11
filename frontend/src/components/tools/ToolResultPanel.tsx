import { useEffect, useState, type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

type Props = {
  open: boolean
  title: string
  onClose: () => void
  className?: string
  children: ReactNode
}

export function ToolResultPanel({ open, title, onClose, className, children }: Props) {
  const { t } = useTranslation('common')
  const [mounted, setMounted] = useState(false)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (open) {
      setMounted(true)
      requestAnimationFrame(() => {
        requestAnimationFrame(() => setVisible(true))
      })
    } else {
      setVisible(false)
    }
  }, [open])

  const handleTransitionEnd = () => {
    if (!visible && !open) setMounted(false)
  }

  if (!mounted) return null

  return (
    <div
      className={cn(
        'fixed inset-0 z-50 flex items-end justify-center p-3 backdrop-blur-[1px] sm:p-4',
        'transition-[background-color] duration-[var(--duration-normal)] ease-[var(--ease-out)]',
        visible ? 'bg-black/30' : 'bg-black/0',
      )}
      style={{ paddingBottom: 'calc(0.75rem + var(--sai-bottom))' }}
      onClick={onClose}
      onTransitionEnd={handleTransitionEnd}
    >
      <section
        className={cn(
          'w-full max-w-3xl rounded-2xl border border-border/70 bg-background shadow-2xl',
          visible
            ? 'translate-y-0 opacity-100 transition-[opacity,transform] duration-[var(--duration-normal)] ease-[var(--ease-out)]'
            : 'translate-y-full opacity-0 transition-[opacity,transform] duration-200 ease-in',
          className,
        )}
        onClick={(event) => event.stopPropagation()}
        aria-modal="true"
        role="dialog"
        aria-label={title}
      >
        <header className="flex items-center justify-between border-b border-border/70 px-4 py-3 sm:px-5">
          <h2 className="text-sm font-semibold tracking-tight sm:text-base">{title}</h2>
          <Button type="button" size="icon" variant="ghost" className="h-9 w-9" onClick={onClose} aria-label={t('actions.close')}>
            <X className="h-4 w-4" />
          </Button>
        </header>
        <div className="max-h-[70vh] overflow-y-auto px-4 py-4 sm:px-5">{children}</div>
      </section>
    </div>
  )
}
