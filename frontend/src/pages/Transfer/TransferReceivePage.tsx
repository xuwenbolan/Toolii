import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { AlertCircle, Download, FileIcon, Flame, Lock, PackageOpen } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatBytes } from '@/lib/fileValidation'
import {
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

  const handleCodeSubmit = useCallback(() => {
    if (!info || code.length !== 4 || codeLocked) return
    setCodeError(false)
    const url = buildTransferDownloadUrl(token, info.files[0].id, code)
    void fetch(url, { method: 'HEAD' }).then((res) => {
      if (res.ok) {
        setCodeVerified(true)
      } else if (res.status === 429) {
        setCodeLocked(true)
      } else if (res.status === 403) {
        setCodeError(true)
      }
    }).catch(() => {
      setCodeError(true)
    })
  }, [info, code, token, codeLocked])

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
        const body = await res.json().catch(() => null)
        const msg = resolveDownloadError(body?.code ?? '')
        setDownloadError(msg)
        // Re-fetch info to sync status (e.g. burned)
        void getTransferInfo(token).then(setInfo).catch(() => {})
        return
      }
      const blob = await res.blob()
      const name = parseContentDisposition(res.headers.get('content-disposition')) || fallbackName
      triggerBlobDownload(blob, name)
      // Re-fetch info to update download_count / status
      void getTransferInfo(token).then(setInfo).catch(() => {})
    } catch {
      setDownloadError(t('receive.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }, [downloading, token, resolveDownloadError, t])

  const handleDownloadSingle = useCallback(
    (fileId: number, filename: string) => {
      const url = buildTransferDownloadUrl(token, fileId, codeVerified && info?.has_extract_code ? code : undefined)
      void fetchAndDownload(url, filename)
    },
    [token, code, codeVerified, info, fetchAndDownload],
  )

  const handleDownloadZip = useCallback(() => {
    const url = buildTransferZipUrl(token, codeVerified && info?.has_extract_code ? code : undefined)
    void fetchAndDownload(url, `transfer-${token}.zip`)
  }, [token, code, codeVerified, info, fetchAndDownload])

  const currentInfo = info?.token === token ? info : null
  const loading = loadedToken !== token
  const visibleError = loadedToken === token ? error : null

  // Status messages for non-active transfers
  const statusMessage = currentInfo
    ? currentInfo.status === 'expired'
      ? t('receive.expired')
      : currentInfo.status === 'deleted'
        ? t('receive.deleted')
        : currentInfo.status === 'burned'
          ? t('receive.burned')
          : currentInfo.max_downloads && currentInfo.download_count >= currentInfo.max_downloads
            ? t('receive.limitReached')
            : null
    : null

  const isAvailable = currentInfo?.status === 'active' && !statusMessage

  return (
    <>
      <SEOHead title={t('receive.title')} noindex />

      <div className="mx-auto w-full max-w-2xl space-y-4">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PackageOpen className="h-5 w-5" />
              {t('receive.title')}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('receive.loading')}</p>
            ) : null}

            {visibleError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive-light/60 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm">{visibleError}</p>
              </div>
            ) : null}

            {statusMessage && currentInfo ? (
              <div className="flex items-center gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
                <p className="text-sm">{statusMessage}</p>
              </div>
            ) : null}

            {downloadError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive-light/60 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm">{downloadError}</p>
              </div>
            ) : null}

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
                      if (e.key === 'Enter') handleCodeSubmit()
                    }}
                    className="max-w-32"
                  />
                  <Button
                    type="button"
                    size="sm"
                    disabled={code.length !== 4 || codeLocked}
                    onClick={handleCodeSubmit}
                  >
                    {t('receive.codeSubmit')}
                  </Button>
                </div>
                {codeLocked ? (
                  <p className="text-sm text-destructive">{t('receive.codeLocked')}</p>
                ) : codeError ? (
                  <p className="text-sm text-destructive">{t('receive.codeError')}</p>
                ) : null}
              </div>
            ) : null}

            {currentInfo && isAvailable && codeVerified ? (
              <div className="space-y-4">
                {currentInfo.burn_after_read ? (
                  <div className="flex items-center gap-2 rounded-lg border border-orange-500/30 bg-orange-500/10 px-3 py-2.5">
                    <Flame className="h-4 w-4 shrink-0 text-orange-500" />
                    <p className="text-sm font-medium text-orange-600 dark:text-orange-400">{t('receive.burnWarning')}</p>
                  </div>
                ) : null}

                {currentInfo.message ? (
                  <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                    <p className="text-xs font-medium text-muted-foreground">{t('receive.message')}</p>
                    <p className="mt-1 text-sm">{currentInfo.message}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{t('receive.fileCount', { count: currentInfo.file_count })}</span>
                  <span>{t('receive.totalSize', { size: formatBytes(currentInfo.total_size) })}</span>
                  <span>{t('receive.downloads', { count: currentInfo.download_count })}</span>
                  <span>{t('receive.expiresAt', { date: formatTime(currentInfo.expires_at, i18n.language) })}</span>
                </div>

                <div className="space-y-1.5 rounded-lg border border-border/70 p-2">
                  {currentInfo.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                    >
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{file.original_filename}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 shrink-0 px-2"
                        disabled={downloading}
                        onClick={() => handleDownloadSingle(file.id, file.original_filename)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        {t('receive.download')}
                      </Button>
                    </div>
                  ))}
                </div>

                {currentInfo.files.length > 1 ? (
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
    </>
  )
}
