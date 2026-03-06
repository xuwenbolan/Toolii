import { useCallback, useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useParams } from 'react-router-dom'
import { AlertCircle, Download, FileIcon, Lock, PackageOpen } from 'lucide-react'

import { SEOHead } from '@/components/common/SEOHead'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { formatBytes } from '@/lib/fileValidation'
import {
  buildShareDownloadUrl,
  buildShareZipUrl,
  getShareInfo,
  type ShareInfoResponse,
} from '@/services/hubApi'

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

  const [info, setInfo] = useState<ShareInfoResponse | null>(null)
  const [loadedToken, setLoadedToken] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [downloadError, setDownloadError] = useState<string | null>(null)
  const [downloading, setDownloading] = useState(false)

  // Extract code gate
  const [needCode, setNeedCode] = useState(false)
  const [code, setCode] = useState('')
  const [codeVerified, setCodeVerified] = useState(false)
  const [codeError, setCodeError] = useState(false)
  const [codeLocked, setCodeLocked] = useState(false)
  const [codeLoading, setCodeLoading] = useState(false)

  useEffect(() => {
    let active = true
    void getShareInfo(token)
      .then((data) => {
        if (!active) return
        if ('need_code' in data && data.need_code) {
          setNeedCode(true)
          setCodeVerified(false)
          setError(null)
        } else {
          const shareInfo = data as ShareInfoResponse
          setInfo(shareInfo)
          setNeedCode(false)
          setCodeVerified(true)
          setError(null)
        }
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
    if (code.length !== 4 || codeLocked || codeLoading) return
    setCodeError(false)
    setCodeLoading(true)
    try {
      const data = await getShareInfo(token, code)
      if ('need_code' in data && data.need_code) {
        setCodeError(true)
      } else {
        setInfo(data as ShareInfoResponse)
        setNeedCode(false)
        setCodeVerified(true)
      }
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
  }, [code, token, codeLocked, codeLoading])

  const fetchAndDownload = useCallback(async (url: string, fallbackName: string) => {
    if (downloading) return
    setDownloadError(null)
    setDownloading(true)
    try {
      const res = await fetch(url)
      if (!res.ok) {
        setDownloadError(t('receive.downloadFailed'))
        return
      }
      const blob = await res.blob()
      const name = parseContentDisposition(res.headers.get('content-disposition')) || fallbackName
      triggerBlobDownload(blob, name)
    } catch {
      setDownloadError(t('receive.downloadFailed'))
    } finally {
      setDownloading(false)
    }
  }, [downloading, t])

  const handleDownloadSingle = useCallback(
    (fileId: number, filename: string) => {
      const codeParam = codeVerified && needCode ? code : undefined
      const url = buildShareDownloadUrl(token, fileId, codeParam)
      void fetchAndDownload(url, filename)
    },
    [token, code, codeVerified, needCode, fetchAndDownload],
  )

  const handleDownloadZip = useCallback(() => {
    const codeParam = codeVerified && needCode ? code : undefined
    const url = buildShareZipUrl(token, codeParam)
    void fetchAndDownload(url, `share-${token}.zip`)
  }, [token, code, codeVerified, needCode, fetchAndDownload])

  const loading = loadedToken !== token
  const visibleError = loadedToken === token ? error : null
  const isExpired = info?.status === 'expired'
  const isAvailable = info && info.status === 'active'

  const statusMessage = info
    ? info.status === 'expired'
      ? t('receive.expired')
      : info.status === 'deleted'
        ? t('receive.deleted')
        : null
    : null

  return (
    <>
      <SEOHead title={t('receive.title')} noindex />

      <div className="mx-auto w-full max-w-2xl space-y-4 px-4 py-8">
        <Card className="border-border/70 shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PackageOpen className="h-5 w-5" />
              {t('receive.title')}
              {isExpired && (
                <Badge variant="outline" className="ml-auto border-warning/30 text-warning">
                  {t('list.statusExpired')}
                </Badge>
              )}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <p className="text-sm text-muted-foreground">{t('receive.loading')}</p>
            ) : null}

            {visibleError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm">{visibleError}</p>
              </div>
            ) : null}

            {statusMessage && info ? (
              <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-warning" />
                <p className="text-sm">{statusMessage}</p>
              </div>
            ) : null}

            {downloadError ? (
              <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2.5">
                <AlertCircle className="h-4 w-4 shrink-0 text-destructive" />
                <p className="text-sm">{downloadError}</p>
              </div>
            ) : null}

            {/* Extract code gate */}
            {needCode && !codeVerified && !visibleError ? (
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

            {/* File content area */}
            {isAvailable && codeVerified && info ? (
              <div className="space-y-4">
                {info.message ? (
                  <div className="rounded-lg border border-border/70 bg-muted/30 px-3 py-2.5">
                    <p className="text-xs font-medium text-muted-foreground">{t('receive.message')}</p>
                    <p className="mt-1 text-sm">{info.message}</p>
                  </div>
                ) : null}

                <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                  <span>{t('receive.fileCount', { count: info.file_count })}</span>
                  <span>{t('receive.totalSize', { size: formatBytes(info.total_size) })}</span>
                  <span>{t('receive.downloads', { count: info.download_count })}</span>
                  <span>{t('receive.expiresAt', { date: formatTime(info.expires_at, i18n.language) })}</span>
                </div>

                <div className="space-y-1.5 rounded-lg border border-border/70 p-2">
                  {info.files.map((file) => (
                    <div
                      key={file.id}
                      className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/40"
                    >
                      <FileIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{file.file_name}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2"
                        disabled={downloading}
                        onClick={() => handleDownloadSingle(file.id, file.file_name)}
                      >
                        <Download className="mr-1 h-3.5 w-3.5" />
                        {downloading ? t('receive.downloading') : t('receive.download')}
                      </Button>
                    </div>
                  ))}
                </div>

                {info.files.length > 1 ? (
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
