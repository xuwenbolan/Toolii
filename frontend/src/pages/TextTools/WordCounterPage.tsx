import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ClipboardCopy, X } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { StatsGrid } from '@/components/textTools/StatsGrid'
import { TokenCountPanel } from '@/components/textTools/TokenCountPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { Button } from '@/components/ui/button'
import { useTextStats } from '@/hooks/useTextStats'
import { MODELS } from '@/lib/tokenCounter'

export function WordCounterPage() {
  const { t } = useTranslation('textTools')
  const [text, setText] = useState('')
  const [modelId, setModelId] = useState(MODELS[0].id)
  const { stats, tokens } = useTextStats(text, modelId)

  const handleCopyStats = useCallback(() => {
    const lines = [
      `${t('stats.words')}: ${stats.words}`,
      `${t('stats.characters')}: ${stats.characters}`,
      `${t('stats.charactersNoSpaces')}: ${stats.charactersNoSpaces}`,
      `${t('stats.cjkCharacters')}: ${stats.cjkCharacters}`,
      `${t('stats.sentences')}: ${stats.sentences}`,
      `${t('stats.paragraphs')}: ${stats.paragraphs}`,
      `${t('stats.lines')}: ${stats.lines}`,
      `${t('token.tokens')}: ${tokens.count} (${tokens.model.label})`,
    ]
    navigator.clipboard.writeText(lines.join('\n'))
  }, [stats, tokens, t])

  return (
    <>
      <SEOHead
        title={t('wordCounter.seoTitle')}
        description={t('wordCounter.seoDescription')}
        keywords={t('wordCounter.seoKeywords')}
        canonicalPath="/text-tools/word-counter"
        jsonLd={[buildToolJsonLd({ name: t('wordCounter.seoTitle'), description: t('wordCounter.seoDescription'), url: '/text-tools/word-counter' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('seoTitle'), path: '/text-tools' }, { name: t('wordCounter.title'), path: '/text-tools/word-counter' }])]}
      />
      <ToolPageShell
        title={t('wordCounter.title')}
        description={t('wordCounter.description')}
        backTo="/text-tools"
        layout="split"
        width="wide"
        sidebar={
          <div className="space-y-4">
            <StatsGrid stats={stats} />

            <TokenCountPanel
              modelId={modelId}
              onModelChange={setModelId}
              tokens={tokens}
            />

            <Button
              variant="outline"
              className="w-full"
              onClick={handleCopyStats}
              disabled={!text.trim()}
            >
              <ClipboardCopy className="mr-2 h-4 w-4" />
              {t('wordCounter.copyStats')}
            </Button>
          </div>
        }
      >
        <div className="space-y-3">
          <div className="relative">
            <textarea
              className="min-h-[320px] w-full resize-y rounded-md border border-input bg-background px-3 py-2.5 text-sm leading-6 shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 lg:min-h-[420px]"
              placeholder={t('wordCounter.placeholder')}
              value={text}
              onChange={(e) => setText(e.target.value)}
            />
            {text ? (
              <Button
                variant="ghost"
                size="icon"
                className="absolute right-2 top-2 h-7 w-7"
                onClick={() => setText('')}
                aria-label="Clear text"
              >
                <X className="h-4 w-4" />
              </Button>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">{t('wordCounter.description')}</p>
        </div>
      </ToolPageShell>
    </>
  )
}
