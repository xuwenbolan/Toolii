import { useTranslation } from 'react-i18next'
import { AlertTriangle, ChevronRight, FileText, Loader2 } from 'lucide-react'

import type { DocxFileEntry } from '@/hooks/useDocxWorkspace'

type Props = {
  entries: DocxFileEntry[]
  onSelectFile: (id: string) => void
}

export function MergePreviewPanel({ entries, onSelectFile }: Props) {
  const { t } = useTranslation('tools')

  const totalPages = entries.reduce((sum, e) => sum + (e.analysis?.metadata.page_count_estimate ?? 0), 0)
  const totalSize = entries.reduce((sum, e) => sum + e.file.size, 0)
  const totalIssues = entries.reduce((sum, e) => sum + (e.analysis?.issues.length ?? 0), 0)
  const totalSizeMb = (totalSize / 1024 / 1024).toFixed(1)

  return (
    <div className="max-w-xl mx-auto space-y-5">
      <h3 className="text-sm font-semibold">{t('docx.workspace.mergePreview')}</h3>

      {/* Document cards */}
      <div className="rounded-lg border border-border overflow-hidden divide-y divide-border">
        {entries.map((entry, index) => {
          const meta = entry.analysis?.metadata
          const issues = entry.analysis?.issues.length ?? 0
          const sizeMb = (entry.file.size / 1024 / 1024).toFixed(1)

          return (
            <button
              key={entry.id}
              onClick={() => onSelectFile(entry.id)}
              className="group w-full text-left px-4 py-3 hover:bg-accent/40 transition-colors duration-150 flex items-center gap-3"
            >
              {/* Order number */}
              <span className="h-5 w-5 rounded-full bg-muted text-[11px] font-semibold text-muted-foreground flex items-center justify-center shrink-0 tabular-nums">
                {index + 1}
              </span>

              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />

              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm truncate">{entry.file.name}</div>
                <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-2 flex-wrap">
                  {meta ? (
                    <>
                      <span>{meta.page_count_estimate} {t('docx.metadata.pageEstimate').toLowerCase()}</span>
                      <span className="text-border">|</span>
                      <span>{meta.word_count.toLocaleString()} {t('docx.metadata.wordCount').toLowerCase()}</span>
                      <span className="text-border">|</span>
                      <span>{sizeMb} MB</span>
                    </>
                  ) : entry.analysisLoading ? (
                    <span className="flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" />
                      {t('docx.workspace.analyzing')}
                    </span>
                  ) : (
                    <span>{sizeMb} MB</span>
                  )}
                </div>
              </div>

              {issues > 0 && (
                <div className="flex items-center gap-1 text-xs text-warning shrink-0">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{issues}</span>
                </div>
              )}

              <ChevronRight className="h-4 w-4 text-muted-foreground/50 shrink-0 group-hover:text-muted-foreground transition-colors duration-150" />
            </button>
          )
        })}
      </div>

      {/* Total stats */}
      <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm text-muted-foreground space-y-1">
        <div className="font-medium text-foreground/80">
          {t('docx.workspace.mergeTotal', {
            pages: totalPages,
            files: entries.length,
            size: `${totalSizeMb} MB`,
          })}
        </div>
        {totalIssues > 0 && (
          <div className="text-warning text-xs flex items-center gap-1">
            <AlertTriangle className="h-3 w-3" />
            {t('docx.workspace.mergeIssueCount', { count: totalIssues })}
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground text-center">
        {t('docx.workspace.clickToInspect')}
      </p>
    </div>
  )
}
