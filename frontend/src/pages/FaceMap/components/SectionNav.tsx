import { useEffect, useRef, useState } from 'react'

import { cn } from '@/lib/utils'

type SectionItem = {
  id: string
  label: string
}

type Props = {
  sections: SectionItem[]
}

// Offset for sticky header (56px) + nav bar (~36px) + gap
const SCROLL_OFFSET = 100

export function SectionNav({ sections }: Props) {
  const [activeId, setActiveId] = useState<string | null>(null)
  const observerRef = useRef<IntersectionObserver | null>(null)

  // Track visible sections via IntersectionObserver
  useEffect(() => {
    observerRef.current?.disconnect()

    const entries = new Map<string, boolean>()

    observerRef.current = new IntersectionObserver(
      (observed) => {
        for (const entry of observed) {
          const id = (entry.target as HTMLElement).dataset.sectionId
          if (id) entries.set(id, entry.isIntersecting)
        }
        // Pick the first visible section in DOM order
        for (const s of sections) {
          if (entries.get(s.id)) {
            setActiveId(s.id)
            return
          }
        }
      },
      { rootMargin: `-${SCROLL_OFFSET}px 0px -40% 0px`, threshold: 0 },
    )

    for (const s of sections) {
      const el = document.querySelector(`[data-section-id="${s.id}"]`)
      if (el) observerRef.current.observe(el)
    }

    return () => observerRef.current?.disconnect()
  }, [sections])

  const handleSelect = (id: string) => {
    const el = document.querySelector(`[data-section-id="${id}"]`)
    if (!el) return
    const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET
    window.scrollTo({ top, behavior: 'smooth' })
  }

  return (
    <div className={cn(
      'sticky top-14 z-10 -mx-1 py-1.5 px-1',
      'bg-background/80 backdrop-blur-sm',
    )}>
      <div className="relative">
        <div className="overflow-x-auto no-scrollbar">
          <div className="flex gap-1.5 min-w-max pr-6">
            {sections.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleSelect(s.id)}
                className={cn(
                  'shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors',
                  activeId === s.id
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted/50 text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>
        {/* Fade hint for horizontal scroll */}
        <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background/80 to-transparent" />
      </div>
    </div>
  )
}
