import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { SEOHead } from '@/components/common/SEOHead'
import { buildBreadcrumbJsonLd, buildToolJsonLd } from '@/lib/jsonLd'
import { BeforeAfterPreview } from '@/components/tools/BeforeAfterPreview'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { cn } from '@/lib/utils'
import { ShareResultButton } from '@/components/tools/ShareResultButton'
import { removeBackground, type FileResult } from '@/services/imageApi'

type BgMode = 'transparent' | 'white' | 'custom'

export function RemoveBgPage() {
  const { t } = useTranslation(['tools', 'common'])
  const [file, setFile] = useState<File | null>(null)
  const [result, setResult] = useState<FileResult | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const [bgMode, setBgMode] = useState<BgMode>('transparent')
  const [customBgColor, setCustomBgColor] = useState('#dbeafe')
  const [showOriginalPreview, setShowOriginalPreview] = useState(false)
  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()
  const inputPreviewUrl = useObjectUrl(file)

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])
  const resultInfo = result ? `${result.filename} · ${formatBytes(result.size)}` : undefined
  const runState = useToolRunState({
    mode: 'auto',
    hasInput: Boolean(file),
    hasResult: Boolean(result),
    pending,
    error,
    texts: {
      input: fileInfo ?? undefined,
      result: resultInfo,
    },
  })

  const runRemoveBg = async (input: File) => {
    setResult(null)
    setResultPanelOpen(false)

    try {
      const res = await run((onProgress) => removeBackground(input, onProgress))
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // Error handled by useFileUpload.
    }
  }

  return (
    <>
      <SEOHead title={t('removeBg.seoTitle')} description={t('removeBg.seoDescription')} keywords={t('removeBg.seoKeywords')} canonicalPath="/image-tools/remove-bg" jsonLd={[buildToolJsonLd({ name: t('removeBg.seoTitle'), description: t('removeBg.seoDescription'), url: '/image-tools/remove-bg' }), buildBreadcrumbJsonLd([{ name: 'Home', path: '/' }, { name: t('title'), path: '/image-tools' }, { name: t('removeBg.title'), path: '/image-tools/remove-bg' }])]} />
      <ToolPageShell title={t('removeBg.title')} description={t('removeBg.description')} toolName="image/remove-bg" backTo="/image-tools" width="wide" layout="split">
        <div className="space-y-5">
          <ToolWorkspaceDropzone
            accept={{ 'image/*': [] }}
            multiple={false}
            maxFiles={1}
            onFiles={(files) => {
              reset()
              setResult(null)
              setResultPanelOpen(false)
              setShowOriginalPreview(false)
              const nextFile = files[0]
              setFile(nextFile)
              void runRemoveBg(nextFile)
            }}
            title={t('removeBg.dropTitle', t('common:upload.dropHere'))}
            hint={t('removeBg.dropHint', t('common:upload.orSelectBelow'))}
          />

          <ToolErrorBanner
            error={error}
            errorMeta={errorMeta}
            onRetry={file ? () => retry() : undefined}
          />

          {file && (result || inputPreviewUrl) ? (
            <div className="rounded-xl border border-border/70 bg-card p-4 shadow-sm">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium">{t('removeBg.previewTitle')}</p>
                {result && inputPreviewUrl ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onPointerDown={() => setShowOriginalPreview(true)}
                    onPointerUp={() => setShowOriginalPreview(false)}
                    onPointerLeave={() => setShowOriginalPreview(false)}
                    onPointerCancel={() => setShowOriginalPreview(false)}
                  >
                    {t('removeBg.showOriginalHold')}
                  </Button>
                ) : null}
              </div>

              <div
                className={cn(
                  'relative overflow-hidden rounded-lg border border-border/70 p-3',
                  bgMode === 'transparent' && !showOriginalPreview
                    ? 'bg-[linear-gradient(45deg,rgba(120,120,120,0.12)_25%,transparent_25%,transparent_75%,rgba(120,120,120,0.12)_75%,rgba(120,120,120,0.12)),linear-gradient(45deg,rgba(120,120,120,0.12)_25%,transparent_25%,transparent_75%,rgba(120,120,120,0.12)_75%,rgba(120,120,120,0.12))] [background-position:0_0,10px_10px] [background-size:20px_20px]'
                    : 'bg-muted/15',
                )}
                style={{
                  backgroundColor:
                    !showOriginalPreview && bgMode === 'white'
                      ? '#ffffff'
                      : !showOriginalPreview && bgMode === 'custom'
                        ? customBgColor
                        : undefined,
                }}
              >
                <div className="flex min-h-[16rem] items-center justify-center sm:min-h-[20rem]">
                  {showOriginalPreview ? (
                    inputPreviewUrl ? (
                      <img
                        src={inputPreviewUrl}
                        alt={file.name}
                        className="max-h-[60vh] w-full rounded-md object-contain"
                      />
                    ) : null
                  ) : result ? (
                    <img
                      src={result.download_url}
                      alt={result.filename}
                      className="max-h-[60vh] w-full rounded-md object-contain"
                    />
                  ) : inputPreviewUrl ? (
                    <img
                      src={inputPreviewUrl}
                      alt={file.name}
                      className="max-h-[60vh] w-full rounded-md object-contain opacity-70"
                    />
                  ) : null}
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
                <div className="space-y-2">
                  <Label>{t('removeBg.backgroundLabel')}</Label>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant={bgMode === 'transparent' ? 'secondary' : 'outline'}
                      onClick={() => setBgMode('transparent')}
                    >
                      {t('removeBg.backgroundTransparent')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bgMode === 'white' ? 'secondary' : 'outline'}
                      onClick={() => setBgMode('white')}
                    >
                      {t('removeBg.backgroundWhite')}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={bgMode === 'custom' ? 'secondary' : 'outline'}
                      onClick={() => setBgMode('custom')}
                    >
                      {t('removeBg.backgroundCustom')}
                    </Button>
                    {bgMode === 'custom' ? (
                      <input
                        type="color"
                        value={customBgColor}
                        onChange={(event) => setCustomBgColor(event.target.value)}
                        className="h-8 w-10 cursor-pointer rounded border border-border bg-background p-1"
                        aria-label={t('removeBg.backgroundCustom')}
                      />
                    ) : null}
                  </div>
                </div>

                {result ? (
                  <DownloadButton url={result.download_url} size="sm" className="w-auto" />
                ) : null}
              </div>
            </div>
          ) : null}

          <p className="text-xs text-muted-foreground">{t('removeBg.outputHint')}</p>
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="auto"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
      />

      <ToolResultPanel
        open={Boolean(result && resultPanelOpen)}
        title={t('common:actions.downloadResult')}
        onClose={() => setResultPanelOpen(false)}
      >
        {result && file && inputPreviewUrl ? (
          <div className="space-y-4">
            <BeforeAfterPreview
              beforeFilename={file.name}
              beforeSizeText={formatBytes(file.size)}
              beforeUrl={inputPreviewUrl}
              afterFilename={result.filename}
              afterSizeText={formatBytes(result.size)}
              afterUrl={result.download_url}
            />
            <div className="flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setResultPanelOpen(false)}>
                {t('common:actions.back')}
              </Button>
              <ShareResultButton originalFile={file} resultFileId={result.file_id} shareType="remove_bg" className="w-auto" />
              <DownloadButton url={result.download_url} className="w-auto" />
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
