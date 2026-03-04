import { useRef, useState, useEffect } from 'react'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

import { useIsMobile } from '@/hooks/useIsMobile'
import { cn } from '@/lib/utils'

export type Column<T> = {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  className?: string
  // Hide this column on mobile (< sm breakpoint) to reduce horizontal overflow
  hiddenOnMobile?: boolean
  render: (row: T, index: number) => ReactNode
}

type Props<T> = {
  columns: Column<T>[]
  data: T[]
  rowKey: (row: T) => string | number
  loading?: boolean
  emptyText?: string
  onRowClick?: (row: T) => void
  expandedRowKey?: string | number | null
  renderExpanded?: (row: T) => ReactNode | null
  // Render a card for each row on mobile instead of the table
  renderMobileCard?: (row: T, index: number) => ReactNode
}

const ALIGN_CLASS = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
} as const

export function DataTable<T>({
  columns,
  data,
  rowKey,
  loading,
  emptyText,
  onRowClick,
  expandedRowKey,
  renderExpanded,
  renderMobileCard,
}: Props<T>) {
  const { t } = useTranslation('admin')
  const isMobile = useIsMobile()
  const scrollRef = useRef<HTMLDivElement>(null)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => {
      setCanScrollRight(el.scrollWidth - el.scrollLeft - el.clientWidth > 1)
    }
    check()
    el.addEventListener('scroll', check, { passive: true })
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => {
      el.removeEventListener('scroll', check)
      ro.disconnect()
    }
  }, [data, columns])

  // Mobile card layout
  if (isMobile && renderMobileCard) {
    if (loading) {
      return <div className="py-10 text-center text-sm text-muted-foreground">{t('common.loading')}</div>
    }
    if (data.length === 0) {
      return <div className="py-10 text-center text-sm text-muted-foreground">{emptyText ?? t('common.noData')}</div>
    }
    return (
      <div className="space-y-3">
        {data.map((row, i) => (
          <div key={rowKey(row)}>{renderMobileCard(row, i)}</div>
        ))}
      </div>
    )
  }

  return (
    <div className="relative rounded-xl border bg-card">
      <div ref={scrollRef} className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={cn(
                    'whitespace-nowrap px-3 py-2.5 font-medium text-muted-foreground',
                    ALIGN_CLASS[col.align ?? 'left'],
                    col.hiddenOnMobile && 'hidden sm:table-cell',
                    col.className,
                  )}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {t('common.loading')}
                </td>
              </tr>
            ) : data.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-muted-foreground"
                >
                  {emptyText ?? t('common.noData')}
                </td>
              </tr>
            ) : (
              data.map((row, i) => {
                const key = rowKey(row)
                const isExpanded = expandedRowKey != null && expandedRowKey === key
                return (
                  <DataTableRow
                    key={key}
                    row={row}
                    index={i}
                    columns={columns}
                    isExpanded={isExpanded}
                    onRowClick={onRowClick}
                    renderExpanded={renderExpanded}
                  />
                )
              })
            )}
          </tbody>
        </table>
      </div>
      {/* Scroll hint gradient on right edge */}
      {canScrollRight && (
        <div
          className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-card to-transparent"
          aria-hidden="true"
        />
      )}
    </div>
  )
}

function DataTableRow<T>({
  row,
  index,
  columns,
  isExpanded,
  onRowClick,
  renderExpanded,
}: {
  row: T
  index: number
  columns: Column<T>[]
  isExpanded: boolean
  onRowClick?: (row: T) => void
  renderExpanded?: (row: T) => ReactNode | null
}) {
  const expandedContent = isExpanded && renderExpanded ? renderExpanded(row) : null

  return (
    <>
      <tr
        className={cn(
          'border-b last:border-b-0',
          index % 2 !== 0 && 'bg-muted/30',
          onRowClick && 'cursor-pointer hover:bg-muted/50 transition-colors',
        )}
        tabIndex={onRowClick ? 0 : undefined}
        role={onRowClick ? 'button' : undefined}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
        onKeyDown={
          onRowClick
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onRowClick(row)
                }
              }
            : undefined
        }
      >
        {columns.map((col) => (
          <td
            key={col.key}
            className={cn(
              'px-3 py-2.5',
              ALIGN_CLASS[col.align ?? 'left'],
              col.hiddenOnMobile && 'hidden sm:table-cell',
              col.className,
            )}
          >
            {col.render(row, index)}
          </td>
        ))}
      </tr>
      {expandedContent && (
        <tr>
          <td colSpan={columns.length} className="border-t bg-muted/20 px-4 py-4">
            {expandedContent}
          </td>
        </tr>
      )}
    </>
  )
}
