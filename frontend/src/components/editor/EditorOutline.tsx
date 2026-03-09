import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { List } from 'lucide-react'

type HeadingItem = {
  level: number
  text: string
  index: number
}

function parseHeadings(markdown: string): HeadingItem[] {
  const results: HeadingItem[] = []
  const regex = /^(#{1,6})\s+(.+)$/gm
  let match: RegExpExecArray | null
  let index = 0
  while ((match = regex.exec(markdown)) !== null) {
    results.push({
      level: match[1].length,
      text: match[2].replace(/[*_`~\[\]]/g, '').trim(),
      index: index++,
    })
  }
  return results
}

function scrollToHeading(index: number) {
  const editor = document.querySelector('.typora-root .ProseMirror')
  if (!editor) return

  const headings = editor.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const target = headings[index]
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }
}

type Props = {
  content: string
}

export function EditorOutline({ content }: Props) {
  const { t } = useTranslation('docs')
  const [activeIndex, setActiveIndex] = useState(-1)
  const observerRef = useRef<IntersectionObserver | null>(null)

  const headings = useMemo(() => parseHeadings(content), [content])

  // Track which heading is currently visible
  useEffect(() => {
    // Debounce to let the editor DOM settle
    const timer = window.setTimeout(() => {
      const editor = document.querySelector('.typora-root .ProseMirror')
      if (!editor) return

      const headingEls = editor.querySelectorAll('h1, h2, h3, h4, h5, h6')
      if (headingEls.length === 0) return

      // Clean up previous observer
      if (observerRef.current) observerRef.current.disconnect()

      const visibleSet = new Set<number>()

      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const idx = Array.from(headingEls).indexOf(entry.target as Element)
            if (idx === -1) continue
            if (entry.isIntersecting) visibleSet.add(idx)
            else visibleSet.delete(idx)
          }
          // Pick the first visible heading
          const sorted = [...visibleSet].sort((a, b) => a - b)
          if (sorted.length > 0) setActiveIndex(sorted[0])
        },
        { rootMargin: '-10% 0px -70% 0px' },
      )

      headingEls.forEach((el) => observerRef.current!.observe(el))
    }, 300)

    return () => {
      window.clearTimeout(timer)
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [headings])

  const minLevel = headings.length > 0 ? Math.min(...headings.map((h) => h.level)) : 1

  return (
    <aside className="hidden w-[220px] shrink-0 overflow-y-auto border-r border-border/40 bg-background lg:block print:hidden">
      <div className="sticky top-0 bg-background px-3 pb-1 pt-3">
        <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <List className="h-3.5 w-3.5" />
          {t('outline')}
        </h2>
      </div>

      {headings.length === 0 ? (
        <p className="px-3 py-4 text-xs text-muted-foreground">{t('noHeadings')}</p>
      ) : (
        <nav className="space-y-0.5 px-1.5 pb-4 pt-1">
          {headings.map((h) => {
            const indent = (h.level - minLevel) * 12
            const isActive = h.index === activeIndex

            return (
              <button
                key={h.index}
                type="button"
                className={[
                  'block w-full truncate rounded-md px-2 py-1 text-left text-[13px] transition-colors',
                  isActive
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                ].join(' ')}
                style={{ paddingLeft: `${8 + indent}px` }}
                onClick={() => scrollToHeading(h.index)}
                title={h.text}
              >
                {h.text}
              </button>
            )
          })}
        </nav>
      )}
    </aside>
  )
}
