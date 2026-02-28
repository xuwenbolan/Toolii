import type { AxiosProgressEvent } from 'axios'

import { api } from '@/services/api'
import type { FileResult } from '@/services/imageApi'

export type PhotoFaceBox = {
  x: number
  y: number
  w: number
  h: number
  confidence?: number | null
}

export type PhotoStandard = {
  code: string
  name: string
  country: string
  width_mm: number
  height_mm: number
  dpi: number
  face_height_ratio: number
  top_margin_ratio: number
  layout_default_copies: number
}

export type ComplianceCheckItem = {
  id: string
  label: string
  passed: boolean
  severity: string
  message: string
}

export type ComplianceResult = {
  passed: boolean
  score: number
  checks: ComplianceCheckItem[]
}

export type UploadWarning = {
  id: string
  params: Record<string, string | number>
}

export type PhotoUploadResponse = {
  upload_id: string
  filename: string
  width: number
  height: number
  faces: PhotoFaceBox[]
  detection_engine: string
  warnings: UploadWarning[]
  compliance: ComplianceResult
}

export type PhotoPreviewResponse = {
  processed_id: string
  standard: PhotoStandard
  background_color: string
  preview_data_url: string
  compliance: ComplianceResult
  crop_box: { x: number; y: number; w: number; h: number }
  applied_adjust: { offset_x: number; offset_y: number; scale: number }
  output_width: number
  output_height: number
}

function getProgressHandler(onProgress?: (percent: number) => void, fallbackTotal?: number) {
  if (!onProgress) return undefined
  return (evt: AxiosProgressEvent) => {
    const total = evt.total ?? fallbackTotal
    if (!total) return
    onProgress((evt.loaded / total) * 100)
  }
}

export async function fetchPhotoStandards() {
  const res = await api.get<PhotoStandard[]>('/api/photo/standards')
  return res.data
}

export async function uploadIdPhoto(file: File, onProgress?: (percent: number) => void) {
  const fd = new FormData()
  fd.append('file', file)
  const res = await api.post<PhotoUploadResponse>('/api/photo/upload', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function previewIdPhoto(payload: {
  upload_id: string
  standard: string
  background_color: string
  adjust?: { offset_x: number; offset_y: number; scale: number }
}) {
  const res = await api.post<PhotoPreviewResponse>('/api/photo/preview', payload)
  return res.data
}

export async function exportIdPhoto(processedId: string) {
  const res = await api.post<FileResult>('/api/photo/export', { processed_id: processedId })
  return res.data
}

export async function layoutIdPhoto(processedId: string, copies?: number) {
  const res = await api.post<FileResult>('/api/photo/layout', {
    processed_id: processedId,
    copies,
  })
  return res.data
}
