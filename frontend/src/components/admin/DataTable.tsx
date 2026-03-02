import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'

export type Column<T> = {
  key: string
  header: string
  align?: 'left' | 'right' | 'center'
  className?: string
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
}: Props<T>) {
  const { t } = useTranslation('admin')

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-muted/50">
            {columns.map((col) => (
              <th
                key={col.key}
                className={`whitespace-nowrap px-3 py-2 font-medium text-muted-foreground ${ALIGN_CLASS[col.align ?? 'left']} ${col.className ?? ''}`}
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
        className={`border-b last:border-b-0 ${index % 2 !== 0 ? 'bg-muted/30' : ''} ${onRowClick ? 'cursor-pointer hover:bg-muted/50 transition-colors' : ''}`}
        onClick={onRowClick ? () => onRowClick(row) : undefined}
      >
        {columns.map((col) => (
          <td
            key={col.key}
            className={`px-3 py-2 ${ALIGN_CLASS[col.align ?? 'left']} ${col.className ?? ''}`}
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
