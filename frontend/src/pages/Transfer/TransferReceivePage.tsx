import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { AlertCircle, Download, Eye, FileIcon, Flame, Lock, PackageOpen } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { formatBytes } from '@/lib/fileValidation'
import {
  TRANSFER_STATUS,
  buildTransferDownloadUrl,
  buildTransferZipUrl,
  getTransferInfo,
  type TransferInfoResponse,
} from '@/services/transferApi'

function formatTime(value: string, locale: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString(locale, { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
}

function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

function parseContentDisposition(header: string | null): string | null {
  if (!header) return null
  const match = /filename\*?=(?:UTF-8''|"?)([^";]+)"?/i.exec(header)
  return match ? decodeURIComponent(match[1]) : null
}

function isPreviewableImage(contentType: string): boolean {
  return contentType.startsWith('image/')
}

export function TransferReceivePage() {
  const { t, i18n } = useTranslation('transfer')
  const { token = '' } = useParams()

  const [info, setInfo] = useState<TransferInfoResponse | null>(null)
  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Extract code gate
  const [code, setCode] = useState('')
  const [codeVerified, setCodeVerified] = useState(false)
  const [codeError, setCodeError] = useState(false)
  const [codeLocked, setCodeLocked] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)

  // Burn confirmation dialog
  const [burnConfirmOpen, setBurnConfirmOpen] = useState(false)
  const [pendingBurnAction, setPendingBurnAction] = useState<(() => void) | null>(null)
  const [burnConfirmIsPreview, setBurnConfirmIsPreview] = useState(false)

  // Image preview dialog
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getTransferInfo(token)
      .then((data) => {
        if (!active) return
        setInfo(data)
        setCodeVerified(!data.has_extract_code)
        setCodeError(false)
        setCodeLocked(false)
        setError(null)
        setLoadedToken(token)
      })
      .catch(() => {
        if (!active) return
        setError(t('receive.notFound'))
        setLoadedToken(token)
      })
    return () => { active = false }
  }, [token, t])

  const handleCodeSubmit = useCallback(async () => {
    if (!info || code.length !== 4 || codeLocked || codeLoading) return
    setCodeError(false)
    setCodeLoading(true)
    try {
      const updated = await getTransferInfo(token, code)
      setInfo(updated)
      setCodeVerified(true)
    } catch (err: unknown) {
      const status = (err as { response?: { status?: number } })?.response?.status
      if (status === 429) {
        setCodeLocked(true)
      } else {
        setCodeError(true)
      }
    } finally {
      setCodeLoading(false)
    }
  }, [info, code, token, codeLocked, codeLoading])

  const resolveDownloadError = useCallback((errorCode: string) => {
    const map: Record<string, string> = {
      TRANSFER_NOT_ACTIVE: t('receive.notActive'),
      TRANSFER_EXPIRED: t('receive.expired'),
      TRANSFER_DOWNLOAD_LIMIT: t('receive.limitReached'),
      INVALID_EXTRACT_CODE: t('receive.codeError'),
      EXTRACT_CODE_LOCKED: t('receive.codeLocked'),
    }
    return map[errorCode] || t('receive.downloadFailed')
  }, [t])

  const fetchAndDownload = useCallback(async (url: string, fallbackName: string) => {
    if (downloading) return
    setDownloadError(null)
    setDownloading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { code?: string } | null
        setDownloadError(resolveDownloadError(body?.code ?? ''))
        void getTransferInfo(token, codeVerified && info?.has_extract_code ? code : undefined)
          .then(setInfo)
          .catch(() => {})
        return
      }
      const blob = await res.blob()
      const name = parseContentDisposition(res.headers.get('content-disposition')) || fallbackName
      triggerBlobDownload(blob, name)
      // Re-fetch to update download_count / status
      void getTransferInfo(token, codeVerified && info?.has_extract_code ? code : undefined)
        .then(setInfo)
        .catch(() => {})
    } catch {
      setDownloadError(t('receive.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }, [downloading, token, resolveDownloadError, t, code, codeVerified, info])

  const fetchAndPreview = useCallback(async (url: string) => {
    if (downloading) return
    setDownloadError(null)
    setDownloading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) {
        const body = await res.json().catch(() => null) as { code?: string } | null
        setDownloadError(resolveDownloadError(body?.code ?? ''))
        void getTransferInfo(token, codeVerified && info?.has_extract_code ? code : undefined)
          .then(setInfo)
          .catch(() => {})
        return
      }
      const blob = await res.blob()
      const objUrl = URL.createObjectURL(blob)
      setPreviewUrl(objUrl)
      // Re-fetch to update status (file is now burned)
      void getTransferInfo(token, codeVerified && info?.has_extract_code ? code : undefined)
        .then(setInfo)
        .catch(() => {})
    } catch {
      setDownloadError(t('receive.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }, [downloading, token, resolveDownloadError, t, code, codeVerified, info])

  const handleDownloadSingle = useCallback(
    (fileId: number, filename: string) => {
      const doDownload = () => {
        const url = buildTransferDownloadUrl(token, fileId, codeVerified && info?.has_extract_code ? code : undefined)
        void fetchAndDownload(url, filename)
      }

      if (info?.burn_after_read) {
        setPendingBurnAction(() => doDownload)
        setBurnConfirmIsPreview(false)
        setBurnConfirmOpen(true)
      } else {
        doDownload()
      }
    },
    [token, code, codeVerified, info, fetchAndDownload],
  )

  const handlePreviewSingle = useCallback(
    (fileId: number) => {
      const doPreview = () => {
        const url = buildTransferDownloadUrl(token, fileId, codeVerified && info?.has_extract_code ? code : undefined)
        void fetchAndPreview(url)
      }

      if (info?.burn_after_read) {
        setPendingBurnAction(() => doPreview)
        setBurnConfirmIsPreview(true)
        setBurnConfirmOpen(true)
      } else {
        doPreview()
      }
    },
    [token, code, codeVerified, info, fetchAndPreview],
  )

  const handleBurnConfirm = useCallback(() => {
    setBurnConfirmOpen(false)
    pendingBurnAction?.()
    setPendingBurnAction(null)
  }, [pendingBurnAction])

  const handleDownloadZip = useCallback(() => {
    const url = buildTransferZipUrl(token, codeVerified && info?.has_extract_code ? code : undefined)
    void fetchAndDownload(url, `transfer-${token}.zip`)
  }, [token, code, codeVerified, info, fetchAndDownload])

  const currentInfo = info?.token === token ? info : null
  const loading = loadedToken !== token
  const visibleError = loadedToken === token ? error : null
  const isBurn = currentInfo?.burn_after_read ?? false

  // Status messages for non-active transfers
  const statusMessage = currentInfo
    ? currentInfo.status === TRANSFER_STATUS.EXPIRED
      ? t('receive.expired')
      : currentInfo.status === TRANSFER_STATUS.DELETED
        ? t('receive.deleted')
        : currentInfo.status === TRANSFER_STATUS.BURNED
          ? t('receive.burned')
          : currentInfo.max_downloads && currentInfo.download_count >= currentInfo.max_downloads
            ? t('receive.limitReached')
            : null
    : null

  const isAvailable = currentInfo?.status === TRANSFER_STATUS.ACTIVE && !statusMessage

  return (
    <>
      <SEOHead title={t('receive.title')} noindex />

      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
        <Card
          className={
            isBurn && isAvailable
              ? 'border-warning/40 shadow-sm shadow-warning/10'
              : 'border-border/70 shadow-sm'
          }
        >
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              {isBurn ? (
                <Flame className="h-5 w-5 text-warning" />
              ) : (
                <PackageOpen className="h-5 w-5" />
              )}
              {t('receive.title')}
              {isBurn && (
                <Badge variant="outline" className="ml-auto border-warning/30 text-warning">
                  {t('receive.burnBadge')}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Loading state */}
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('receive.loading')}</p>
            ) : null}

            {/* Not found error */}
            {visibleError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm">{visibleError}</p>
              </div>
            ) : null}

            {/* Non-active status */}
            {statusMessage && currentInfo ? (
              <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                <p className="text-sm">{statusMessage}</p>
              </div>
            ) : null}

            {/* Download error */}
            {downloadError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm">{downloadError}</p>
              </div>
            ) : null}

            {/* Extract code gate */}
            {currentInfo && isAvailable && !codeVerified ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Lock className="h-4 w-4" />
                  <span>{t('receive.enterCode')}</span>
                </div>
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder={t('receive.codePlaceholder')}
                    value={code}
                    onChange={(e) => {
                      setCode(e.target.value.replace(/\D/g, '').slice(0, 4))
                      setCodeError(false)
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') void handleCodeSubmit()
                    }}
                    className="max-w-32"
                    disabled={codeLocked}
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={code.length !== 4 || codeLocked || codeLoading}
                    onClick={() => { void handleCodeSubmit() }}
                  >
                    {codeLoading ? t('receive.loading') : t('receive.codeSubmit')}
                  </Button>
                </div>
                {codeLocked ? (
                  <p className="text-sm text-destructive">{t('receive.codeLocked')}</p>
                ) : codeError ? (
                  <p className="text-sm text-destructive">{t('receive.codeError')}</p>
                ) : null}
              </div>
            ) : null}

            {/* File content area (after code verified) */}
            {currentInfo && isAvailable && codeVerified ? (
              <div className="space-y-4">
                {/* Burn after read warning */}
                {isBurn ? (
                  <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
                    <Flame className="h-4 w-4 shrink-0 text-warning" />
                    <p className="text-sm font-medium text-warning">{t('receive.burnWarning')}</p>
                  </div>
                ) : null}

                {/* Sender message */}
                {currentInfo.message ? (
                  <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                    <p className="text-xs font-medium text-muted-foreground">{t('receive.message')}</p>
                    <p className="mt-1 text-sm">{currentInfo.message}</p>
                  </div>
                ) : null}

                {/* Transfer metadata */}
                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{t('receive.fileCount', { count: currentInfo.file_count })}</span>
                  <span>{t('receive.totalSize', { size: formatBytes(currentInfo.total_size) })}</span>
                  {!isBurn && <span>{t('receive.downloads', { count: currentInfo.download_count })}</span>}
                  <span>{t('receive.expiresAt', { date: formatTime(currentInfo.expires_at, i18n.language) })}</span>
                </div>

                {/* File list */}
                <div className="space-y-1.5 rounded-lg border border-border/70 p-2">
                  {currentInfo.files.map((file) => {
                    const canPreview = isBurn && isPreviewableImage(file.content_type)
                    return (
                      <div
                        key={file.id}
                        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                      >
                        <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0 flex-1 truncate">{file.original_filename}</span>
                        <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                        <div className="flex shrink-0 gap-1">
                          {canPreview ? (
                            <Button
                              type="button"
                              size="sm"
                              variant={isBurn ? 'destructive' : 'ghost'}
                              className="h-7 px-2"
                              disabled={downloading}
                              onClick={() => handlePreviewSingle(file.id)}
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" />
                              {t('receive.preview')}
                            </Button>
                          ) : null}
                          <Button
                            type="button"
                            size="sm"
                            variant={isBurn ? 'destructive' : 'ghost'}
                            className="h-7 px-2"
                            disabled={downloading}
                            onClick={() => handleDownloadSingle(file.id, file.original_filename)}
                          >
                            <Download className="mr-1 h-3.5 w-3.5" />
                            {downloading ? t('receive.downloading') : t('receive.download')}
                          </Button>
                        </div>
                      </div>
                    )
                  })}
                </div>

                {/* ZIP download (only for non-burn multi-file transfers) */}
                {!isBurn && currentInfo.files.length > 1 ? (
                  <Button
                    type="button"
                    className="w-full"
                    disabled={downloading}
                    onClick={handleDownloadZip}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    {downloading ? t('receive.downloading') : t('receive.downloadAll')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      {/* Burn confirmation dialog */}
      <ConfirmDialog
        open={burnConfirmOpen}
        onOpenChange={(open) => {
          if (!open) {
            setBurnConfirmOpen(false)
            setPendingBurnAction(null)
          }
        }}
        title={burnConfirmIsPreview ? t('receive.burnPreviewConfirmTitle') : t('receive.burnConfirmTitle')}
        description={burnConfirmIsPreview ? t('receive.burnPreviewConfirmDesc') : t('receive.burnConfirmDesc')}
        confirmLabel={burnConfirmIsPreview ? t('receive.burnPreviewConfirmAction') : t('receive.burnConfirmAction')}
        cancelLabel={t('receive.cancel')}
        variant="destructive"
        onConfirm={handleBurnConfirm}
      />

      {/* Image preview dialog */}
      <Dialog
        open={previewUrl !== null}
        onOpenChange={(open) => {
          if (!open) {
            if (previewUrl) URL.revokeObjectURL(previewUrl)
            setPreviewUrl(null)
          }
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{t('receive.preview')}</DialogTitle>
          </DialogHeader>
          {previewUrl ? (
            <div className="flex items-center justify-center">
              <img
                src={previewUrl}
                alt="Preview"
                className="max-h-[70vh] max-w-full rounded object-contain"
              />
            </div>
          ) : null}
          {isBurn ? (
            <p className="text-center text-sm font-medium text-warning">
              {t('receive.burnDestroyed')}
            </p>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  )
}
