import { useCallback, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Check, ClipboardCopy, Copy, FileIcon, Flame, Link2, Lock, Trash2 } from 'lucide-react'
import { Navigate, useLocation } from 'react-router-dom'

import { SEOHead } from '@/components/common/SEOHead'
import { ToolActionBar } from '@/components/tools/ToolActionBar'
import { ToolErrorBanner } from '@/components/tools/ToolErrorBanner'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { ToolResultPanel } from '@/components/tools/ToolResultPanel'
import { ToolWorkspaceDropzone } from '@/components/tools/ToolWorkspaceDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useAuth } from '@/hooks/useAuth'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useToolRunState } from '@/hooks/useToolRunState'
import { formatBytes } from '@/lib/fileValidation'
import { createTransfer, type TransferCreateResponse } from '@/services/transferApi'

const RETENTION_OPTIONS = ['1h', '24h', '7d'] as const

export function TransferCreatePage() {
  const { t, i18n } = useTranslation(['transfer', 'common'])
  const { user } = useAuth()
  const location = useLocation()

  const [files, setFiles] = useState<File[]>([])
  const [retention, setRetention] = useState<string>('24h')
  const [useExtractCode, setUseExtractCode] = useState(false)
  const [maxDownloads, setMaxDownloads] = useState('')
  const [message, setMessage] = useState('')
  const [burnAfterRead, setBurnAfterRead] = useState(false)
  const [result, setResult] = useState<TransferCreateResponse | null>(null)
  const [resultPanelOpen, setResultPanelOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [copiedCode, setCopiedCode] = useState(false)

  const { pending, progress, error, errorMeta, reset, run, retry } = useFileUpload()

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files])

  const addFiles = useCallback(
    (newFiles: File[]) => {
      if (burnAfterRead) {
        // Burn mode: only keep the last selected file
        setFiles(newFiles.slice(0, 1))
      } else {
        setFiles((prev) => [...prev, ...newFiles].slice(0, 20))
      }
    },
    [burnAfterRead],
  )

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleBurnToggle = useCallback(() => {
    setBurnAfterRead((prev) => {
      const next = !prev
      if (next) {
        setFiles((f) => f.slice(0, 1))
        setMaxDownloads('')
      }
      return next
    })
  }, [])

  const maxDownloadsValid = maxDownloads === '' || (Number(maxDownloads) >= 1 && Number.isInteger(Number(maxDownloads)))
  const formValid = files.length > 0 && maxDownloadsValid

  const runState = useToolRunState({
    mode: 'manual',
    hasInput: files.length > 0,
    hasResult: Boolean(result),
    pending,
    error,
    texts: {
      input: files.length > 0
        ? `${t('create.fileList', { count: files.length })} - ${formatBytes(totalSize)}`
        : undefined,
      processing: t('create.uploading'),
    },
  })

  // Require login
  if (!user) {
    const redirect = encodeURIComponent(location.pathname)
    return <Navigate to={`/auth/login?redirect=${redirect}`} replace />
  }

  const handleCreate = async () => {
    if (!formValid) return
    setResult(null)
    setResultPanelOpen(false)

    try {
      const res = await run((onProgress) =>
        createTransfer(files, {
          retention,
          useExtractCode: useExtractCode || undefined,
          maxDownloads: burnAfterRead ? undefined : (maxDownloads ? Number(maxDownloads) : undefined),
          message: message || undefined,
          burnAfterRead: burnAfterRead || undefined,
        }, onProgress),
      )
      setResult(res)
      setResultPanelOpen(true)
    } catch {
      // handled by useFileUpload
    }
  }

  const shareUrl = result ? `${window.location.origin}${result.transfer_path}` : ''

  const handleCopy = async () => {
    if (!shareUrl) return
    try {
      await navigator.clipboard.writeText(shareUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // fallback
    }
  }

  const handleCopyCode = async () => {
    if (!result?.extract_code) return
    try {
      await navigator.clipboard.writeText(result.extract_code)
      setCopiedCode(true)
      setTimeout(() => setCopiedCode(false), 2000)
    } catch {
      // fallback
    }
  }

  const handleCreateAnother = () => {
    setFiles([])
    setRetention('24h')
    setUseExtractCode(false)
    setMaxDownloads('')
    setMessage('')
    setBurnAfterRead(false)
    setResult(null)
    setResultPanelOpen(false)
    setCopied(false)
    setCopiedCode(false)
    reset()
  }

  return (
    <>
      <SEOHead
        title={t('create.seoTitle')}
        description={t('create.seoDescription')}
        canonicalPath="/transfer"
      />

      <ToolPageShell
        title={t('create.title')}
        description={t('create.description')}
        backTo="/"
      >
        <div className="space-y-5 tool-section-stagger">
          <ToolWorkspaceDropzone
            multiple={!burnAfterRead}
            maxFiles={burnAfterRead ? 1 : 20}
            onFiles={addFiles}
            title={t('create.dropTitle')}
            hint={burnAfterRead ? t('create.burnSingleFileHint') : t('create.dropHint')}
            browseLabel={t('create.browseLabel')}
          />

          <ToolErrorBanner
            error={error}
            errorMeta={errorMeta}
            onRetry={files.length > 0 ? () => retry() : undefined}
          />

          {files.length > 0 ? (
            <div className="space-y-3">
              <p className="text-sm font-medium text-muted-foreground">
                {t('create.fileList', { count: files.length })} - {t('create.totalSize', { size: formatBytes(totalSize) })}
              </p>
              <div className="max-h-60 space-y-1.5 overflow-y-auto rounded-lg border border-border/70 p-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.size}-${index}`}
                    className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                  >
                    <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{file.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 shrink-0"
                      onClick={() => removeFile(index)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {files.length > 0 ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setUseExtractCode((v) => !v)}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${useExtractCode ? 'border-primary/50 bg-primary/5' : 'border-border/70 hover:bg-muted/40'}`}
                >
                  <Lock className={`h-5 w-5 shrink-0 ${useExtractCode ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${useExtractCode ? 'text-primary' : ''}`}>
                      {t('create.extractCodeLabel')}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('create.extractCodeHint')}</p>
                  </div>
                  <div className={`h-5 w-9 shrink-0 rounded-full transition ${useExtractCode ? 'bg-primary' : 'bg-muted'}`}>
                    <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${useExtractCode ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>

                <button
                  type="button"
                  onClick={handleBurnToggle}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition ${burnAfterRead ? 'border-warning/50 bg-warning/10' : 'border-border/70 hover:bg-muted/40'}`}
                >
                  <Flame className={`h-5 w-5 shrink-0 ${burnAfterRead ? 'text-warning' : 'text-muted-foreground'}`} />
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm font-medium ${burnAfterRead ? 'text-warning' : ''}`}>
                      {t('create.burnAfterReadLabel')}
                    </p>
                    <p className="text-xs text-muted-foreground">{t('create.burnAfterReadHint')}</p>
                  </div>
                  <div className={`h-5 w-9 shrink-0 rounded-full transition ${burnAfterRead ? 'bg-warning' : 'bg-muted'}`}>
                    <div className={`h-5 w-5 rounded-full bg-white shadow transition-transform ${burnAfterRead ? 'translate-x-4' : 'translate-x-0'}`} />
                  </div>
                </button>
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label>{t('create.retentionLabel')}</Label>
                  <div className="flex gap-2">
                    {RETENTION_OPTIONS.map((opt) => (
                      <Button
                        key={opt}
                        type="button"
                        size="sm"
                        variant={retention === opt ? 'default' : 'outline'}
                        onClick={() => setRetention(opt)}
                      >
                        {t(`create.retention${opt}`)}
                      </Button>
                    ))}
                  </div>
                </div>

                {!burnAfterRead ? (
                  <div className="space-y-2">
                    <Label htmlFor="max-downloads">{t('create.maxDownloadsLabel')}</Label>
                    <Input
                      id="max-downloads"
                      type="number"
                      min={1}
                      placeholder={t('create.maxDownloadsPlaceholder')}
                      value={maxDownloads}
                      onChange={(e) => setMaxDownloads(e.target.value)}
                    />
                  </div>
                ) : null}

                <div className="space-y-2">
                  <Label htmlFor="message">{t('create.messageLabel')}</Label>
                  <Input
                    id="message"
                    type="text"
                    maxLength={500}
                    placeholder={t('create.messagePlaceholder')}
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </ToolPageShell>

      <ToolActionBar
        mode="manual"
        status={runState.statusText}
        pending={pending}
        progress={progress}
        error={error}
        done={runState.phase === 'done'}
        ctaLabel={t('create.startUpload')}
        ctaDisabled={!formValid || pending}
        onCta={() => {
          void handleCreate()
        }}
      />

      <ToolResultPanel
        open={Boolean(result && resultPanelOpen)}
        title={t('result.title')}
        onClose={() => setResultPanelOpen(false)}
      >
        {result ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">{t('result.linkLabel')}</Label>
              <div className="flex items-center gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                <Link2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{shareUrl}</span>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  onClick={() => { void handleCopy() }}
                >
                  {copied ? (
                    <>
                      <Check className="mr-1.5 h-3.5 w-3.5" />
                      {t('result.copied')}
                    </>
                  ) : (
                    <>
                      <Copy className="mr-1.5 h-3.5 w-3.5" />
                      {t('result.copyLink')}
                    </>
                  )}
                </Button>
              </div>
            </div>

            {result.burn_after_read ? (
              <p className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-sm font-medium text-warning">
                <Flame className="h-4 w-4 shrink-0" />
                {t('result.burnReminder')}
              </p>
            ) : null}

            {result.extract_code ? (
              <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/10 px-3 py-2">
                <span className="text-sm font-medium">
                  {t('result.extractCodeReminder', { code: result.extract_code })}
                </span>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 px-2"
                  onClick={() => { void handleCopyCode() }}
                >
                  {copiedCode ? (
                    <Check className="mr-1 h-3.5 w-3.5" />
                  ) : (
                    <ClipboardCopy className="mr-1 h-3.5 w-3.5" />
                  )}
                  {copiedCode ? t('result.copied') : t('result.copyCode')}
                </Button>
              </div>
            ) : null}

            <p className="text-xs text-muted-foreground">
              {t('result.expiresAt', {
                date: new Date(result.expires_at).toLocaleString(i18n.language, {
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              })}
            </p>

            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={handleCreateAnother}>
                {t('result.createAnother')}
              </Button>
              <Button
                type="button"
                onClick={() => { void handleCopy() }}
              >
                {copied ? t('result.copied') : t('result.copyLink')}
              </Button>
            </div>
          </div>
        ) : null}
      </ToolResultPanel>
    </>
  )
}
