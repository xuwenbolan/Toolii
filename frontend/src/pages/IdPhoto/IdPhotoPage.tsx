import { useEffect, useMemo, useState } from 'react'

import { BalanceDisplay } from '@/components/credits/BalanceDisplay'
import { InsufficientCreditsDialog } from '@/components/credits/InsufficientCreditsDialog'
import { BackgroundColorPicker } from '@/components/idPhoto/BackgroundColorPicker'
import { ComplianceResults } from '@/components/idPhoto/ComplianceResults'
import { ModelTierSelector } from '@/components/idPhoto/ModelTierSelector'
import { PaywallGate } from '@/components/idPhoto/PaywallGate'
import { PhotoPreview } from '@/components/idPhoto/PhotoPreview'
import { PrintLayoutPreview } from '@/components/idPhoto/PrintLayoutPreview'
import { SizeStandardPicker } from '@/components/idPhoto/SizeStandardPicker'
import { StepIndicator } from '@/components/idPhoto/StepIndicator'
import { DownloadButton } from '@/components/tools/DownloadButton'
import { ProcessingStatus } from '@/components/tools/ProcessingStatus'
import { ToolPageShell } from '@/components/tools/ToolPageShell'
import { UploadProgress } from '@/components/upload/UploadProgress'
import { FileDropzone } from '@/components/upload/FileDropzone'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { PHOTO_STANDARDS_FALLBACK } from '@/config/photoStandards'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
import { useFileUpload } from '@/hooks/useFileUpload'
import { formatBytes } from '@/lib/fileValidation'
import {
  exportIdPhoto,
  fetchPhotoStandards,
  layoutIdPhoto,
  processIdPhoto,
  type PhotoProcessResponse,
  type PhotoStandard,
  type PhotoUploadResponse,
  uploadIdPhoto,
} from '@/services/idPhotoApi'
import type { FileResult } from '@/services/imageApi'

const STEPS = ['上传', '检测', '规格', '预览', '导出']

function getApiErrorMessage(error: unknown, fallback: string): string {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe?.response?.data?.message || fallback
}

function getApiErrorCode(error: unknown): string | undefined {
  const maybe = error as { response?: { data?: { code?: string } } }
  return maybe?.response?.data?.code
}

export function IdPhotoPage() {
  const { isAuthenticated } = useAuth()
  const credits = useCredits({
    enabled: isAuthenticated,
    includeTransactions: isAuthenticated,
    transactionsLimit: 5,
  })
  const [standards, setStandards] = useState<PhotoStandard[]>(PHOTO_STANDARDS_FALLBACK)
  const [selectedStandardCode, setSelectedStandardCode] = useState(PHOTO_STANDARDS_FALLBACK[0]?.code ?? '')
  const [file, setFile] = useState<File | null>(null)
  const [uploadResult, setUploadResult] = useState<PhotoUploadResponse | null>(null)
  const [processResult, setProcessResult] = useState<PhotoProcessResponse | null>(null)
  const [exportResult, setExportResult] = useState<FileResult | null>(null)
  const [layoutResult, setLayoutResult] = useState<FileResult | null>(null)
  const [layoutCopies, setLayoutCopies] = useState<number | ''>('')
  const [backgroundColor, setBackgroundColor] = useState('#FFFFFF')
  const [modelTier, setModelTier] = useState<'fast' | 'balanced' | 'hq'>('fast')
  const [loadingStandards, setLoadingStandards] = useState(false)
  const [processPending, setProcessPending] = useState(false)
  const [processError, setProcessError] = useState<string | null>(null)
  const [exportPending, setExportPending] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)
  const [layoutPending, setLayoutPending] = useState(false)
  const [layoutError, setLayoutError] = useState<string | null>(null)
  const [insufficientDialogOpen, setInsufficientDialogOpen] = useState(false)
  const [insufficientActionLabel, setInsufficientActionLabel] = useState('导出无水印证件照')
  const uploadTask = useFileUpload()

  useEffect(() => {
    let active = true
    setLoadingStandards(true)
    void fetchPhotoStandards()
      .then((items) => {
        if (!active || items.length === 0) return
        setStandards(items)
        setSelectedStandardCode((prev) => prev || items[0].code)
      })
      .catch(() => {
        // Keep fallback standards.
      })
      .finally(() => {
        if (active) setLoadingStandards(false)
      })
    return () => {
      active = false
    }
  }, [])

  const selectedStandard = useMemo(
    () => standards.find((item) => item.code === selectedStandardCode) ?? standards[0] ?? null,
    [standards, selectedStandardCode],
  )

  const currentStep = useMemo(() => {
    if (exportResult || layoutResult) return 4
    if (processResult) return 3
    if (uploadResult) return 1
    if (file) return 0
    return 0
  }, [file, uploadResult, processResult, exportResult, layoutResult])

  const fileInfo = useMemo(() => {
    if (!file) return null
    return `${file.name} · ${formatBytes(file.size)}`
  }, [file])

  const handleInsufficientCredits = (error: unknown, actionLabel: string) => {
    if (getApiErrorCode(error) !== 'INSUFFICIENT_CREDITS') return false
    setInsufficientActionLabel(actionLabel)
    setInsufficientDialogOpen(true)
    void credits.refreshAll()
    return true
  }

  return (
    <ToolPageShell
      title="证件照"
      description="上传 → 合规检测 → 规格选择 → 预览（水印）→ 登录后导出（各消耗 1 Credit）"
      backTo="/"
    >
      <div className="space-y-5">
        <StepIndicator steps={STEPS} currentStep={currentStep} />

        <div className="space-y-3 rounded-xl border p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">1. 上传照片并检测人脸</h2>
            <p className="text-xs text-muted-foreground">
              建议上传正面、光线均匀、肩部完整的照片。
            </p>
          </div>

          <FileDropzone
            accept="image/*"
            onFiles={(files) => {
              uploadTask.reset()
              setProcessError(null)
              setExportError(null)
              setLayoutError(null)
              setUploadResult(null)
              setProcessResult(null)
              setExportResult(null)
              setLayoutResult(null)
              setFile(files[0])
            }}
          />

          {fileInfo ? <p className="text-xs text-muted-foreground">{fileInfo}</p> : null}
          <ProcessingStatus pending={uploadTask.pending} error={uploadTask.error} />
          <UploadProgress value={uploadTask.pending ? uploadTask.progress : null} />

          <Button
            type="button"
            className="w-full"
            disabled={!file || uploadTask.pending}
            onClick={async () => {
              if (!file) return
              setUploadResult(null)
              setProcessResult(null)
              setExportResult(null)
              setLayoutResult(null)
              try {
                const result = await uploadTask.run((onProgress) => uploadIdPhoto(file, onProgress), {
                  errorMessage: '上传或人脸检测失败，请换一张清晰正面照再试。',
                })
                setUploadResult(result)
              } catch {
                // Error message is handled by useFileUpload.
              }
            }}
          >
            {uploadTask.pending ? '上传检测中…' : '上传并检测'}
          </Button>
        </div>

        {uploadResult ? (
          <div className="space-y-2 rounded-xl border p-4">
            <h2 className="text-sm font-semibold">2. 检测结果</h2>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md bg-muted/60 px-3 py-2">
                图片尺寸：{uploadResult.width} × {uploadResult.height}
              </div>
              <div className="rounded-md bg-muted/60 px-3 py-2">
                检测方式：{uploadResult.detection_engine}
              </div>
              <div className="rounded-md bg-muted/60 px-3 py-2">
                人脸数量：{uploadResult.faces.length}
              </div>
              <div className="rounded-md bg-muted/60 px-3 py-2">
                会话 ID：{uploadResult.upload_id.slice(0, 8)}…
              </div>
            </div>
          </div>
        ) : null}

        <div className="space-y-4 rounded-xl border p-4">
          <div className="space-y-1">
            <h2 className="text-sm font-semibold">3. 选择规格与底色</h2>
            <p className="text-xs text-muted-foreground">
              生成水印预览后可登录导出无水印图片与 6x4 排版。
            </p>
          </div>

          <div className="grid gap-4">
            <SizeStandardPicker
              standards={standards}
              value={selectedStandardCode}
              onChange={(value) => {
                setSelectedStandardCode(value)
                setProcessResult(null)
                setExportResult(null)
                setLayoutResult(null)
              }}
            />
            <BackgroundColorPicker
              value={backgroundColor}
              onChange={(value) => {
                setBackgroundColor(value)
                setProcessResult(null)
              }}
            />
            <ModelTierSelector
              value={modelTier}
              onChange={(value) => {
                setModelTier(value)
                setProcessResult(null)
              }}
            />
          </div>

          {loadingStandards ? <p className="text-xs text-muted-foreground">正在加载规格列表…</p> : null}
          <ProcessingStatus pending={processPending} error={processError} />

          <Button
            type="button"
            className="w-full"
            disabled={!uploadResult || !selectedStandard || processPending}
            onClick={async () => {
              if (!uploadResult || !selectedStandard) return
              setProcessPending(true)
              setProcessError(null)
              setExportError(null)
              setLayoutError(null)
              setExportResult(null)
              setLayoutResult(null)
              try {
                const result = await processIdPhoto({
                  upload_id: uploadResult.upload_id,
                  standard: selectedStandard.code,
                  background_color: backgroundColor,
                  model_tier: modelTier,
                })
                setProcessResult(result)
              } catch (error) {
                setProcessError(getApiErrorMessage(error, '证件照处理失败，请稍后再试。'))
              } finally {
                setProcessPending(false)
              }
            }}
          >
            {processPending ? '处理中…' : '生成预览'}
          </Button>
        </div>

        {processResult ? (
          <>
            <PhotoPreview
              src={processResult.preview_data_url}
              subtitle={`${processResult.standard.name} · ${processResult.output_width}×${processResult.output_height}px · 模型 ${processResult.model_used}`}
            />

            <ComplianceResults result={processResult.compliance} />

            <div className="space-y-4 rounded-xl border p-4">
              <div className="space-y-1">
                <h2 className="text-sm font-semibold">4. 导出与打印排版</h2>
                <p className="text-xs text-muted-foreground">
                  导出无水印与 6x4 排版均需登录，且各消耗 1 Credit。
                </p>
              </div>

              <PaywallGate>
                <div className="space-y-3">
                  <BalanceDisplay
                    balance={credits.balance}
                    pending={credits.balancePending}
                    error={credits.balanceError}
                    requiredCredits={1}
                    onRefresh={() => {
                      void credits.refreshAll()
                    }}
                  />

                  <ProcessingStatus pending={exportPending} error={exportError} />
                  <Button
                    type="button"
                    className="w-full"
                    disabled={exportPending || !processResult}
                    onClick={async () => {
                      if (!processResult) return
                      setExportPending(true)
                      setExportError(null)
                      try {
                        const result = await exportIdPhoto(processResult.processed_id)
                        setExportResult(result)
                        void credits.refreshAll()
                      } catch (error) {
                        if (handleInsufficientCredits(error, '导出无水印证件照')) {
                          setExportError(getApiErrorMessage(error, 'Credits 余额不足，无法导出。'))
                        } else {
                          setExportError(getApiErrorMessage(error, '导出失败，请先登录后重试。'))
                        }
                      } finally {
                        setExportPending(false)
                      }
                    }}
                  >
                    {exportPending ? '导出中…' : '导出无水印证件照'}
                  </Button>

                  {exportResult ? (
                    <div className="rounded-lg border p-3">
                      <p className="mb-2 text-xs text-muted-foreground">
                        导出文件：{exportResult.filename} · {formatBytes(exportResult.size)}
                      </p>
                      <DownloadButton url={exportResult.download_url} label="下载证件照" />
                    </div>
                  ) : null}

                  <div className="grid grid-cols-[1fr_auto] gap-2">
                    <div className="space-y-2">
                      <Label htmlFor="layoutCopies">排版张数（可选）</Label>
                      <Input
                        id="layoutCopies"
                        type="number"
                        min={1}
                        max={20}
                        placeholder={String(processResult.standard.layout_default_copies)}
                        value={layoutCopies}
                        onChange={(e) => setLayoutCopies(e.target.value === '' ? '' : Number(e.target.value))}
                      />
                    </div>
                    <Button
                      type="button"
                      className="self-end"
                      variant="outline"
                      disabled={layoutPending}
                      onClick={async () => {
                        setLayoutPending(true)
                        setLayoutError(null)
                        try {
                          const result = await layoutIdPhoto(
                            processResult.processed_id,
                            layoutCopies === '' ? undefined : layoutCopies,
                          )
                          setLayoutResult(result)
                          void credits.refreshAll()
                        } catch (error) {
                          if (handleInsufficientCredits(error, '生成 6x4 排版')) {
                            setLayoutError(getApiErrorMessage(error, 'Credits 余额不足，无法生成排版。'))
                          } else {
                            setLayoutError(getApiErrorMessage(error, '排版导出失败，请先登录后重试。'))
                          }
                        } finally {
                          setLayoutPending(false)
                        }
                      }}
                    >
                      {layoutPending ? '生成中…' : '生成 6x4 排版'}
                    </Button>
                  </div>

                  <ProcessingStatus pending={layoutPending} error={layoutError} />
                  <PrintLayoutPreview result={layoutResult} />
                </div>
              </PaywallGate>
            </div>
          </>
        ) : null}

        <InsufficientCreditsDialog
          open={insufficientDialogOpen}
          onOpenChange={setInsufficientDialogOpen}
          requiredCredits={1}
          balance={credits.balance}
          actionLabel={insufficientActionLabel}
          transactions={credits.transactions}
          transactionsPending={credits.transactionsPending}
          transactionsError={credits.transactionsError}
          onRefreshBalance={() => {
            void credits.refreshAll()
          }}
          onRedeemed={() => {
            void credits.refreshAll()
          }}
        />
      </div>
    </ToolPageShell>
  )
}
