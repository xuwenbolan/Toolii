import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { PHOTO_STANDARDS_FALLBACK } from '@/config/photoStandards'
import { useAuth } from '@/hooks/useAuth'
import { useCredits } from '@/hooks/useCredits'
import { useFileUpload } from '@/hooks/useFileUpload'
import { useObjectUrl } from '@/hooks/useObjectUrl'
import { getApiErrorCode } from '@/lib/apiErrors'
import {
  exportIdPhoto,
  fetchPhotoStandards,
  layoutIdPhoto,
  previewIdPhoto,
  type PhotoPreviewResponse,
  type PhotoStandard,
  type PhotoUploadResponse,
  uploadIdPhoto,
} from '@/services/idPhotoApi'
import type { FileResult } from '@/services/imageApi'

// ── Adjust ──────────────────────────────────────────────────────────
export type PhotoAdjustControl = {
  offsetX: number
  offsetY: number
  scale: number
}

export const DEFAULT_PHOTO_ADJUST: PhotoAdjustControl = {
  offsetX: 0,
  offsetY: 0,
  scale: 1,
}

export function clampAdjust(a: PhotoAdjustControl): PhotoAdjustControl {
  return {
    offsetX: clamp(a.offsetX, -0.45, 0.45),
    offsetY: clamp(a.offsetY, -0.45, 0.45),
    scale: clamp(a.scale, 0.75, 2.4),
  }
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// ── State ───────────────────────────────────────────────────────────
type State = {
  file: File | null
  standards: PhotoStandard[]
  selectedStandardCode: string
  loadingStandards: boolean
  backgroundColor: string

  uploadResult: PhotoUploadResponse | null
  previewResult: PhotoPreviewResponse | null
  previewPending: boolean
  previewError: string | null

  photoAdjust: PhotoAdjustControl
  layoutCopiesInput: string

  exportResult: FileResult | null
  layoutResult: FileResult | null
  exportPending: boolean
  layoutPending: boolean
  actionError: string | null

  paidProcessedIds: Set<string>
  resultPanelOpen: boolean
  resultPanelKind: 'export' | 'layout' | null
  insufficientDialogOpen: boolean
  insufficientActionLabel: string
}

const INITIAL_STATE: State = {
  file: null,
  standards: PHOTO_STANDARDS_FALLBACK,
  selectedStandardCode: PHOTO_STANDARDS_FALLBACK[0]?.code ?? '',
  loadingStandards: false,
  backgroundColor: '#FFFFFF',

  uploadResult: null,
  previewResult: null,
  previewPending: false,
  previewError: null,

  photoAdjust: DEFAULT_PHOTO_ADJUST,
  layoutCopiesInput: '',

  exportResult: null,
  layoutResult: null,
  exportPending: false,
  layoutPending: false,
  actionError: null,

  paidProcessedIds: new Set(),
  resultPanelOpen: false,
  resultPanelKind: null,
  insufficientDialogOpen: false,
  insufficientActionLabel: '',
}

// ── Actions ─────────────────────────────────────────────────────────
type Action =
  | { type: 'SET_FILE'; file: File | null }
  | { type: 'SET_STANDARDS'; standards: PhotoStandard[] }
  | { type: 'SET_LOADING_STANDARDS'; loading: boolean }
  | { type: 'SET_STANDARD'; code: string }
  | { type: 'SET_BG_COLOR'; color: string }
  | { type: 'SET_ADJUST'; adjust: PhotoAdjustControl }
  | { type: 'SET_LAYOUT_COPIES'; value: string }
  | { type: 'UPLOAD_DONE'; result: PhotoUploadResponse }
  | { type: 'PREVIEW_START' }
  | { type: 'PREVIEW_DONE'; result: PhotoPreviewResponse }
  | { type: 'PREVIEW_FAIL'; error: string }
  | { type: 'EXPORT_START' }
  | { type: 'EXPORT_DONE'; result: FileResult; processedId: string }
  | { type: 'EXPORT_FAIL'; error: string }
  | { type: 'LAYOUT_START' }
  | { type: 'LAYOUT_DONE'; result: FileResult; processedId: string }
  | { type: 'LAYOUT_FAIL'; error: string }
  | { type: 'OPEN_RESULT_PANEL'; kind: 'export' | 'layout' }
  | { type: 'CLOSE_RESULT_PANEL' }
  | { type: 'SET_INSUFFICIENT_DIALOG'; open: boolean; label?: string }
  | { type: 'CLEAR_ACTION_ERROR' }
  | { type: 'RESET_FOR_NEW_FILE' }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SET_FILE':
      return {
        ...state,
        file: action.file,
        uploadResult: null,
        previewResult: null,
        previewError: null,
        exportResult: null,
        layoutResult: null,
        actionError: null,
        resultPanelOpen: false,
        resultPanelKind: null,
        photoAdjust: DEFAULT_PHOTO_ADJUST,
      }
    case 'SET_STANDARDS':
      return {
        ...state,
        standards: action.standards,
        selectedStandardCode: state.selectedStandardCode || action.standards[0]?.code || '',
      }
    case 'SET_LOADING_STANDARDS':
      return { ...state, loadingStandards: action.loading }
    case 'SET_STANDARD':
      return { ...state, selectedStandardCode: action.code }
    case 'SET_BG_COLOR':
      return { ...state, backgroundColor: action.color }
    case 'SET_ADJUST':
      return { ...state, photoAdjust: action.adjust }
    case 'SET_LAYOUT_COPIES':
      return { ...state, layoutCopiesInput: action.value }
    case 'UPLOAD_DONE':
      return {
        ...state,
        uploadResult: action.result,
        previewResult: null,
        exportResult: null,
        layoutResult: null,
        actionError: null,
        resultPanelOpen: false,
        resultPanelKind: null,
        photoAdjust: DEFAULT_PHOTO_ADJUST,
      }
    case 'PREVIEW_START':
      return {
        ...state,
        previewPending: true,
        previewError: null,
        exportResult: null,
        layoutResult: null,
        actionError: null,
        resultPanelOpen: false,
        resultPanelKind: null,
      }
    case 'PREVIEW_DONE':
      return { ...state, previewPending: false, previewResult: action.result }
    case 'PREVIEW_FAIL':
      return { ...state, previewPending: false, previewError: action.error }
    case 'EXPORT_START':
      return { ...state, exportPending: true, actionError: null, resultPanelOpen: false, resultPanelKind: null }
    case 'EXPORT_DONE':
      return {
        ...state,
        exportPending: false,
        exportResult: action.result,
        paidProcessedIds: new Set([...state.paidProcessedIds, action.processedId]),
      }
    case 'EXPORT_FAIL':
      return { ...state, exportPending: false, actionError: action.error }
    case 'LAYOUT_START':
      return { ...state, layoutPending: true, actionError: null, resultPanelOpen: false, resultPanelKind: null }
    case 'LAYOUT_DONE':
      return {
        ...state,
        layoutPending: false,
        layoutResult: action.result,
        paidProcessedIds: new Set([...state.paidProcessedIds, action.processedId]),
      }
    case 'LAYOUT_FAIL':
      return { ...state, layoutPending: false, actionError: action.error }
    case 'OPEN_RESULT_PANEL':
      return { ...state, resultPanelOpen: true, resultPanelKind: action.kind }
    case 'CLOSE_RESULT_PANEL':
      return { ...state, resultPanelOpen: false }
    case 'SET_INSUFFICIENT_DIALOG':
      return {
        ...state,
        insufficientDialogOpen: action.open,
        insufficientActionLabel: action.label ?? state.insufficientActionLabel,
      }
    case 'CLEAR_ACTION_ERROR':
      return { ...state, actionError: null }
    case 'RESET_FOR_NEW_FILE':
      return {
        ...INITIAL_STATE,
        standards: state.standards,
        selectedStandardCode: state.selectedStandardCode,
        backgroundColor: state.backgroundColor,
        paidProcessedIds: state.paidProcessedIds,
        loadingStandards: state.loadingStandards,
      }
    default:
      return state
  }
}

// ── Hook ────────────────────────────────────────────────────────────
export function useIdPhotoState() {
  const { t } = useTranslation('idPhoto')
  const { isAuthenticated } = useAuth()
  const credits = useCredits({
    enabled: isAuthenticated,
    includeTransactions: isAuthenticated,
    transactionsLimit: 5,
  })

  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)
  const uploadTask = useFileUpload()
  const inputPreviewUrl = useObjectUrl(state.file)

  // AbortController for preview requests
  const previewAbortRef = useRef<AbortController | null>(null)
  const previewDebounceRef = useRef<number | null>(null)

  // ── Derived ─────────────────────────────────────────────────────
  const currentProcessedId = state.previewResult?.processed_id ?? null
  const isPaid = currentProcessedId ? state.paidProcessedIds.has(currentProcessedId) : false
  const actionPending = state.exportPending || state.layoutPending
  const selectedStandard = useMemo(
    () => state.standards.find((s) => s.code === state.selectedStandardCode) ?? state.standards[0],
    [state.standards, state.selectedStandardCode],
  )

  const uploadPhase = useMemo(() => {
    if (!uploadTask.pending) return 'idle' as const
    if (uploadTask.progress !== null && uploadTask.progress >= 100) return 'processing' as const
    return 'uploading' as const
  }, [uploadTask.pending, uploadTask.progress])

  const inputImageMeta = useInputImageMeta(inputPreviewUrl)

  // ── Fetch standards on mount ────────────────────────────────────
  useEffect(() => {
    let active = true
    dispatch({ type: 'SET_LOADING_STANDARDS', loading: true })
    void fetchPhotoStandards()
      .then((items) => {
        if (!active || items.length === 0) return
        dispatch({ type: 'SET_STANDARDS', standards: items })
      })
      .catch(() => {})
      .finally(() => {
        if (active) dispatch({ type: 'SET_LOADING_STANDARDS', loading: false })
      })
    return () => { active = false }
  }, [])

  // ── Preview ─────────────────────────────────────────────────────
  const refreshPreview = useCallback(
    async (uploadId: string, standardCode: string, bgColor: string, adjust: PhotoAdjustControl) => {
      previewAbortRef.current?.abort()
      const controller = new AbortController()
      previewAbortRef.current = controller

      dispatch({ type: 'PREVIEW_START' })
      try {
        const result = await previewIdPhoto({
          upload_id: uploadId,
          standard: standardCode,
          background_color: bgColor,
          adjust: { offset_x: adjust.offsetX, offset_y: adjust.offsetY, scale: adjust.scale },
        })
        if (controller.signal.aborted) return
        dispatch({ type: 'PREVIEW_DONE', result })
      } catch {
        if (controller.signal.aborted) return
        dispatch({ type: 'PREVIEW_FAIL', error: t('preview.failed') })
      }
    },
    [t],
  )

  const schedulePreviewRefresh = useCallback(
    (uploadId: string, standardCode: string, bgColor: string, adjust: PhotoAdjustControl) => {
      if (previewDebounceRef.current != null) {
        window.clearTimeout(previewDebounceRef.current)
      }
      previewDebounceRef.current = window.setTimeout(() => {
        void refreshPreview(uploadId, standardCode, bgColor, adjust)
        previewDebounceRef.current = null
      }, 180)
    },
    [refreshPreview],
  )

  const cancelScheduledPreview = useCallback(() => {
    if (previewDebounceRef.current != null) {
      window.clearTimeout(previewDebounceRef.current)
      previewDebounceRef.current = null
    }
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      previewAbortRef.current?.abort()
      if (previewDebounceRef.current != null) {
        window.clearTimeout(previewDebounceRef.current)
      }
    }
  }, [])

  // ── Upload ──────────────────────────────────────────────────────
  const handleUpload = useCallback(async () => {
    if (!state.file) return
    dispatch({ type: 'UPLOAD_DONE', result: null as unknown as PhotoUploadResponse }) // reset preview
    try {
      const result = await uploadTask.run(
        (onProgress) => uploadIdPhoto(state.file!, onProgress),
        { errorMessage: t('upload.failed') },
      )
      dispatch({ type: 'UPLOAD_DONE', result })
      void refreshPreview(result.upload_id, state.selectedStandardCode, state.backgroundColor, DEFAULT_PHOTO_ADJUST)
    } catch {
      // error set by uploadTask
    }
  }, [state.file, state.selectedStandardCode, state.backgroundColor, uploadTask, refreshPreview, t])

  // ── Export ──────────────────────────────────────────────────────
  const handleExport = useCallback(async () => {
    if (!state.previewResult || !isAuthenticated) return
    const processedId = state.previewResult.processed_id

    // If already paid and we have the export result, just re-open the panel
    if (isPaid && state.exportResult) {
      dispatch({ type: 'OPEN_RESULT_PANEL', kind: 'export' })
      return
    }

    dispatch({ type: 'EXPORT_START' })
    try {
      const result = await exportIdPhoto(processedId)
      dispatch({ type: 'EXPORT_DONE', result, processedId })
      dispatch({ type: 'OPEN_RESULT_PANEL', kind: 'export' })
      void credits.refreshAll()
    } catch (error) {
      if (getApiErrorCode(error) === 'INSUFFICIENT_CREDITS') {
        dispatch({ type: 'SET_INSUFFICIENT_DIALOG', open: true, label: t('export.exportSingle') })
        dispatch({ type: 'EXPORT_FAIL', error: t('export.insufficientCredits') })
        void credits.refreshAll()
      } else if (getApiErrorCode(error) === 'EMAIL_NOT_VERIFIED') {
        dispatch({ type: 'EXPORT_FAIL', error: t('common:errors.emailNotVerified') })
      } else {
        dispatch({ type: 'EXPORT_FAIL', error: t('export.loginRequired') })
      }
    }
  }, [state.previewResult, state.exportResult, isAuthenticated, isPaid, credits, t])

  // ── Layout ─────────────────────────────────────────────────────
  const handleGenerateLayout = useCallback(async () => {
    if (!state.previewResult || !isAuthenticated) return
    const processedId = state.previewResult.processed_id

    // If already paid and we have the layout result, just re-open the panel
    if (isPaid && state.layoutResult) {
      dispatch({ type: 'OPEN_RESULT_PANEL', kind: 'layout' })
      return
    }

    dispatch({ type: 'LAYOUT_START' })
    try {
      const copies = state.layoutCopiesInput.trim()
        ? Number(state.layoutCopiesInput)
        : undefined
      const result = await layoutIdPhoto(processedId, copies)
      dispatch({ type: 'LAYOUT_DONE', result, processedId })
      dispatch({ type: 'OPEN_RESULT_PANEL', kind: 'layout' })
      void credits.refreshAll()
    } catch (error) {
      if (getApiErrorCode(error) === 'INSUFFICIENT_CREDITS') {
        dispatch({ type: 'SET_INSUFFICIENT_DIALOG', open: true, label: t('export.exportLayout') })
        dispatch({ type: 'LAYOUT_FAIL', error: t('export.insufficientCredits') })
        void credits.refreshAll()
      } else if (getApiErrorCode(error) === 'EMAIL_NOT_VERIFIED') {
        dispatch({ type: 'LAYOUT_FAIL', error: t('common:errors.emailNotVerified') })
      } else {
        dispatch({ type: 'LAYOUT_FAIL', error: t('export.layoutLoginRequired') })
      }
    }
  }, [state.previewResult, state.layoutResult, state.layoutCopiesInput, isAuthenticated, isPaid, credits, t])

  // ── Change handlers ────────────────────────────────────────────
  const handleFileSelect = useCallback((files: File[]) => {
    cancelScheduledPreview()
    previewAbortRef.current?.abort()
    uploadTask.reset()
    dispatch({ type: 'SET_FILE', file: files[0] ?? null })
  }, [cancelScheduledPreview, uploadTask])

  const handleStandardChange = useCallback(
    (code: string) => {
      cancelScheduledPreview()
      dispatch({ type: 'SET_STANDARD', code })
      if (state.uploadResult) {
        void refreshPreview(state.uploadResult.upload_id, code, state.backgroundColor, state.photoAdjust)
      }
    },
    [cancelScheduledPreview, refreshPreview, state.uploadResult, state.backgroundColor, state.photoAdjust],
  )

  const handleBgColorChange = useCallback(
    (color: string) => {
      cancelScheduledPreview()
      dispatch({ type: 'SET_BG_COLOR', color })
      if (state.uploadResult) {
        void refreshPreview(state.uploadResult.upload_id, state.selectedStandardCode, color, state.photoAdjust)
      }
    },
    [cancelScheduledPreview, refreshPreview, state.uploadResult, state.selectedStandardCode, state.photoAdjust],
  )

  const handleAdjustChange = useCallback(
    (next: PhotoAdjustControl) => {
      const clamped = clampAdjust(next)
      dispatch({ type: 'SET_ADJUST', adjust: clamped })
    },
    [],
  )

  const handleAdjustCommit = useCallback(
    (next: PhotoAdjustControl) => {
      const clamped = clampAdjust(next)
      dispatch({ type: 'SET_ADJUST', adjust: clamped })
      if (state.uploadResult) {
        schedulePreviewRefresh(
          state.uploadResult.upload_id,
          state.selectedStandardCode,
          state.backgroundColor,
          clamped,
        )
      }
    },
    [schedulePreviewRefresh, state.uploadResult, state.selectedStandardCode, state.backgroundColor],
  )

  const handleAdjustSlider = useCallback(
    (field: keyof PhotoAdjustControl, value: number) => {
      const next = clampAdjust({ ...state.photoAdjust, [field]: value })
      dispatch({ type: 'SET_ADJUST', adjust: next })
      if (state.uploadResult) {
        schedulePreviewRefresh(
          state.uploadResult.upload_id,
          state.selectedStandardCode,
          state.backgroundColor,
          next,
        )
      }
    },
    [schedulePreviewRefresh, state.photoAdjust, state.uploadResult, state.selectedStandardCode, state.backgroundColor],
  )

  const handleAdjustReset = useCallback(() => {
    cancelScheduledPreview()
    dispatch({ type: 'SET_ADJUST', adjust: DEFAULT_PHOTO_ADJUST })
    if (state.uploadResult) {
      void refreshPreview(
        state.uploadResult.upload_id,
        state.selectedStandardCode,
        state.backgroundColor,
        DEFAULT_PHOTO_ADJUST,
      )
    }
  }, [cancelScheduledPreview, refreshPreview, state.uploadResult, state.selectedStandardCode, state.backgroundColor])

  return {
    state,
    dispatch,
    // Derived
    currentProcessedId,
    isPaid,
    actionPending,
    selectedStandard,
    uploadPhase,
    inputPreviewUrl,
    inputImageMeta,
    isAuthenticated,
    credits,
    uploadTask,
    // Handlers
    handleFileSelect,
    handleUpload,
    handleExport,
    handleGenerateLayout,
    handleStandardChange,
    handleBgColorChange,
    handleAdjustChange,
    handleAdjustCommit,
    handleAdjustSlider,
    handleAdjustReset,
  }
}

// ── Internal: read image dimensions ─────────────────────────────────
function useInputImageMeta(url: string | null) {
  const [meta, setMeta] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    setMeta(null)
    if (!url) return
    let active = true
    const img = new Image()
    img.onload = () => { if (active) setMeta({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { if (active) setMeta(null) }
    img.src = url
    return () => { active = false }
  }, [url])

  return meta
}

