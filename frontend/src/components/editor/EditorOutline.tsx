import { useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { List, Search } from 'lucide-react'

type HeadingItem = {
  level: number
  text: string
  index: number
}

function parseHeadings(markdown: string): HeadingItem[] {
  // Use a line-by-line state machine to skip fenced code blocks.
  // This avoids the expensive backreference regex that caused
  // performance issues on large documents.
  const results: HeadingItem[] = []
  const lines = markdown.split('\n')
  let index = 0
  let fence: string | null = null
  const cleanInline = (s: string) => s.replace(/[*_`~[\]]/g, '').trim()

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Track fenced code block state
    if (fence !== null) {
      if (line.startsWith(fence) && line.trimEnd() === fence) fence = null
      continue
    }
    const fenceMatch = line.match(/^(`{3,}|~{3,})/)
    if (fenceMatch) {
      fence = fenceMatch[1]
      continue
    }

    // ATX headings: # ... ######
    const atxMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (atxMatch) {
      results.push({ level: atxMatch[1].length, text: cleanInline(atxMatch[2]), index: index++ })
      continue
    }

    // Setext headings: text followed by === (h1) or --- (h2)
    if (i + 1 < lines.length && line.trim()) {
      const next = lines[i + 1]
      if (/^={2,}\s*$/.test(next)) {
        results.push({ level: 1, text: cleanInline(line), index: index++ })
        i++
        continue
      }
      if (/^-{2,}\s*$/.test(next)) {
        results.push({ level: 2, text: cleanInline(line), index: index++ })
        i++
        continue
      }
    }
  }
  return results
}

function scrollToHeading(index: number) {
  const editor = document.querySelector('.typora-root .ProseMirror')
  if (!editor) return

  const headings = editor.querySelectorAll('h1, h2, h3, h4, h5, h6')
  const target = headings[index]
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
}

type Props = {
  content: string
  open: boolean
}

const SEARCH_THRESHOLD = 8

export function EditorOutline({ content, open }: Props) {
  const { t } = useTranslation('docs')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [filter, setFilter] = useState('')
  const observerRef = useRef<IntersectionObserver | null>(null)

  const headings = useMemo(() => parseHeadings(content), [content])

  // Only rebuild IntersectionObserver when heading count changes, not on
  // every text edit. Content edits within existing headings don't add/remove
  // DOM nodes, so the observer targets stay valid.
  const headingCount = headings.length

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
      const elToIndex = new Map<Element, number>()
      headingEls.forEach((el, i) => elToIndex.set(el, i))

      observerRef.current = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const idx = elToIndex.get(entry.target) ?? -1
            if (idx === -1) continue
            if (entry.isIntersecting) visibleSet.add(idx)
            else visibleSet.delete(idx)
          }
          // Pick the first visible heading
          const sorted = [...visibleSet].sort((a, b) => a - b)
          if (sorted.length > 0) setActiveIndex(sorted[0])
        },
        { rootMargin: '-5% 0px -50% 0px' },
      )

      headingEls.forEach((el) => observerRef.current!.observe(el))
    }, 300)

    return () => {
      window.clearTimeout(timer)
      if (observerRef.current) observerRef.current.disconnect()
    }
  }, [headingCount])

  const navRef = useRef<HTMLElement>(null)

  // Auto-scroll active heading button into the outline panel viewport
  useEffect(() => {
    if (activeIndex < 0 || !navRef.current) return
    const btn = navRef.current.querySelector(`[data-heading-index="${activeIndex}"]`) as HTMLElement | null
    btn?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeIndex])

  const showSearch = headings.length >= SEARCH_THRESHOLD
  const normalizedFilter = filter.toLowerCase()
  const filteredHeadings = normalizedFilter
    ? headings.filter((h) => h.text.toLowerCase().includes(normalizedFilter))
    : headings

  const minLevel = headings.length > 0 ? headings.reduce((m, h) => Math.min(m, h.level), 6) : 1

  return (
    <aside
      className={[
        'sticky top-[44px] hidden h-[calc(100svh-44px-28px)] self-start shrink-0 overflow-hidden border-border/40 bg-background transition-[width,border-width] duration-200 ease-in-out md:block print:hidden',
        open ? 'w-[220px] border-r' : 'w-0 border-r-0',
      ].join(' ')}
    >
      {/* Inner container keeps fixed width so content doesn't reflow during transition */}
      <div className="h-full w-[220px] overflow-y-auto">
        <div className="sticky top-0 bg-background px-3 pb-1 pt-3">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <List className="h-3.5 w-3.5" />
            {t('outline')}
          </h2>
          {showSearch && (
            <div className="relative mt-1.5">
              <Search className="pointer-events-none absolute left-1.5 top-1/2 h-3 w-3 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder={t('outlineFilter')}
                className="h-6 w-full rounded border border-border/60 bg-background pl-6 pr-1.5 text-[11px] text-foreground outline-none placeholder:text-muted-foreground/60 focus:border-primary/50"
              />
            </div>
          )}
        </div>

        {headings.length === 0 ? (
          <p className="px-3 py-4 text-xs leading-relaxed text-muted-foreground">{t('noHeadingsHint')}</p>
        ) : filteredHeadings.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">{t('noMatchingHeadings')}</p>
        ) : (
          <nav ref={navRef} className="space-y-0.5 px-1.5 pb-4 pt-1">
            {filteredHeadings.map((h) => {
              const indent = (h.level - minLevel) * 12
              const isActive = h.index === activeIndex

              return (
                <button
                  key={h.index}
                  data-heading-index={h.index}
                  type="button"
                  className={[
                    'relative block w-full truncate rounded-md py-1 pr-2 text-left transition-colors',
                    h.level <= minLevel + 1 ? 'text-[13px]' : 'text-xs',
                    isActive
                      ? 'bg-primary/8 font-medium text-foreground'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                  ].join(' ')}
                  style={{ paddingLeft: `${10 + indent}px` }}
                  onClick={() => scrollToHeading(h.index)}
                  title={h.text}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1 bottom-1 w-[2px] rounded-full bg-primary" />
                  )}
                  {h.text}
                </button>
              )
            })}
          </nav>
        )}
      </div>
    </aside>
  )
}
