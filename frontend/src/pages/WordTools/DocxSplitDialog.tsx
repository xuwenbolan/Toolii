import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { DocxAnalysisResult } from '@/services/docxApi'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

type Props = {
  open: boolean
  onClose: () => void
  onConfirm: (level: number) => void
  analysis: DocxAnalysisResult | null
  pending?: boolean
}

export function DocxSplitDialog({ open, onClose, onConfirm, analysis, pending }: Props) {
  const { t } = useTranslation('tools')
  const [level, setLevel] = useState(1)

  // Count headings per level from analysis
  const headingCounts = new Map<number, number>()
  if (analysis) {
    for (const h of analysis.headings) {
      headingCounts.set(h.level, (headingCounts.get(h.level) ?? 0) + 1)
    }
  }

  const levels = [1, 2, 3].filter((l) => headingCounts.has(l) || l === 1)

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{t('docx.workspace.splitByHeading')}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {levels.map((l) => {
            const count = headingCounts.get(l) ?? 0
            return (
              <label
                key={l}
                className={`flex items-center justify-between rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                  level === l ? 'border-primary bg-accent' : 'border-border hover:bg-accent/50'
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="splitLevel"
                    value={l}
                    checked={level === l}
                    onChange={() => setLevel(l)}
                    className="accent-primary"
                  />
                  <span className="text-sm font-medium">
                    {t(`docx.workspace.splitLevelH${l}`)}
                  </span>
                </div>
                <span className="text-xs text-muted-foreground">
                  {count > 0
                    ? t('docx.workspace.splitPreview', { count: count })
                    : t('docx.workspace.splitPreview', { count: 0 })}
                </span>
              </label>
            )
          })}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t('common:actions.cancel')}
          </Button>
          <Button onClick={() => onConfirm(level)} disabled={pending}>
            {pending
              ? t('docx.workspace.splitting')
              : t('docx.workspace.splitByHeading')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
