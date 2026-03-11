import { api } from '@/services/api'
import type { AxiosProgressEvent } from 'axios'

export type FileResult = {
  file_id: string
  filename: string
  size: number
  content_type: string
  download_url: string
  preview_url?: string | null
  requires_credit?: boolean
  credit_cost?: number
  expires_in: number
}

/** Get the URL to use for previewing a result (watermarked when gated, clean when free). */
export function getResultDisplayUrl(result: FileResult): string {
  if (result.requires_credit && result.preview_url) {
    return result.preview_url
  }
  return result.download_url
}

export async function unlockDownload(fileId: string): Promise<{ download_url: string }> {
  const res = await api.post<{ download_url: string }>(`/api/download/${fileId}/unlock`)
  return res.data
}

function getProgressHandler(
  onProgress?: (percent: number) => void,
  fallbackTotal?: number,
) {
  if (!onProgress) return undefined
  return (evt: AxiosProgressEvent) => {
    const total = evt.total ?? fallbackTotal
    if (!total) return
    onProgress((evt.loaded / total) * 100)
  }
}

// -- Shared utilities for image tool API calls --

type FormDataFieldValue = string | number | boolean | object | null | undefined

/**
 * Build a FormData with the file and optional key-value fields.
 * - null/undefined values are skipped
 * - booleans are converted to 'true'/'false'
 * - objects/arrays are JSON-stringified
 * - numbers are converted via String()
 */
function buildImageFormData(
  file: File,
  fields: Record<string, FormDataFieldValue> = {},
): FormData {
  const fd = new FormData()
  fd.append('file', file)
  for (const [key, val] of Object.entries(fields)) {
    if (val == null) continue
    if (typeof val === 'boolean') {
      fd.append(key, String(val))
    } else if (typeof val === 'object') {
      fd.append(key, JSON.stringify(val))
    } else {
      fd.append(key, String(val))
    }
  }
  return fd
}

/**
 * Factory: create a function that posts FormData to a fixed endpoint and returns typed data.
 */
function createImageToolApi<T, O extends Record<string, FormDataFieldValue>>(
  endpoint: string,
  mapOpts: (opts: O) => Record<string, FormDataFieldValue>,
) {
  return async (
    file: File,
    opts: O,
    onProgress?: (percent: number) => void,
  ): Promise<T> => {
    const fd = buildImageFormData(file, mapOpts(opts))
    const res = await api.post<T>(endpoint, fd, {
      onUploadProgress: getProgressHandler(onProgress, file.size),
    })
    return res.data
  }
}

// -- Public API functions --

export const compressImage = createImageToolApi<
  FileResult,
  { quality?: number; targetKb?: number; outputFormat?: string }
>('/api/image/compress', (opts) => ({
  quality: opts.quality,
  target_kb: opts.targetKb,
  output_format: opts.outputFormat,
}))

export const convertImage = createImageToolApi<
  FileResult,
  { outputFormat: string; quality?: number }
>('/api/image/convert', (opts) => ({
  output_format: opts.outputFormat,
  quality: opts.quality,
}))

export type MosaicRegion = {
  x: number
  y: number
  w: number
  h: number
}

export const mosaicImage = createImageToolApi<
  FileResult,
  { pixelSize?: number; regions?: MosaicRegion[] }
>('/api/image/mosaic', (opts) => ({
  pixel_size: opts.pixelSize,
  regions: opts.regions,
}))

export const enhanceScan = createImageToolApi<
  FileResult,
  { mode?: 'bw' | 'color' }
>('/api/image/scan-enhance', (opts) => ({
  mode: opts.mode,
}))

export const removeBackground = createImageToolApi<
  FileResult,
  { model?: string }
>('/api/image/remove-bg', (opts) => ({
  model: opts.model,
}))

export const upscaleImage = createImageToolApi<
  FileResult,
  { scale?: number; model?: string; denoise_strength?: number; face_enhance?: boolean }
>('/api/image/upscale', (opts) => ({
  scale: opts.scale,
  model: opts.model,
  denoise_strength: opts.denoise_strength,
  face_enhance: opts.face_enhance,
}))

export const restoreFace = createImageToolApi<
  FileResult,
  { w?: number; upscale?: number }
>('/api/image/restore-face', (opts) => ({
  w: opts.w,
  upscale: opts.upscale,
}))

export const denoiseImage = createImageToolApi<
  FileResult,
  { strength?: number; task?: string; model_width?: number }
>('/api/image/denoise', (opts) => ({
  strength: opts.strength,
  task: opts.task,
  model_width: opts.model_width,
}))

export const colorizeImage = createImageToolApi<
  FileResult,
  { model?: string }
>('/api/image/colorize', (opts) => ({
  model: opts.model,
}))

// inpaintImage has a unique signature (extra mask param), so it uses the utilities directly
export async function inpaintImage(
  file: File,
  mask: Blob,
  onProgress?: (percent: number) => void,
) {
  const fd = buildImageFormData(file)
  fd.append('mask', mask, 'mask.png')

  const res = await api.post<FileResult>('/api/image/inpaint', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export type OcrLine = {
  text: string
  score: number
  box: number[][]
}

export type OcrLang = 'ch' | 'en' | 'ch_en'

export type OcrResult = {
  engine: string
  lang: string
  width: number
  height: number
  lines: OcrLine[]
  full_text: string
}

export const ocrImage = createImageToolApi<
  OcrResult,
  { lang?: OcrLang }
>('/api/image/ocr', (opts) => ({
  lang: opts.lang,
}))

export type SegmentResult = {
  mask_b64: string
  score: number
  width: number
  height: number
}

export const segmentImage = createImageToolApi<
  SegmentResult,
  { points?: number[][]; boxes?: number[][] }
>('/api/image/segment', (opts) => ({
  points: opts.points,
  boxes: opts.boxes,
}))
