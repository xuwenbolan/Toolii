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

export async function compressImage(
  file: File,
  opts: { quality?: number; targetKb?: number; outputFormat?: string } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.quality != null) fd.append('quality', String(opts.quality))
  if (opts.targetKb != null) fd.append('target_kb', String(opts.targetKb))
  if (opts.outputFormat) fd.append('output_format', opts.outputFormat)

  const res = await api.post<FileResult>('/api/image/compress', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function convertImage(
  file: File,
  opts: { outputFormat: string; quality?: number },
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('output_format', opts.outputFormat)
  if (opts.quality != null) fd.append('quality', String(opts.quality))

  const res = await api.post<FileResult>('/api/image/convert', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export type MosaicRegion = {
  x: number
  y: number
  w: number
  h: number
}

export async function mosaicImage(
  file: File,
  opts: { pixelSize?: number; regions?: MosaicRegion[] } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.pixelSize != null) fd.append('pixel_size', String(opts.pixelSize))
  if (opts.regions != null) fd.append('regions', JSON.stringify(opts.regions))

  const res = await api.post<FileResult>('/api/image/mosaic', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function enhanceScan(
  file: File,
  opts: { mode?: 'bw' | 'color' } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.mode) fd.append('mode', opts.mode)

  const res = await api.post<FileResult>('/api/image/scan-enhance', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function removeBackground(
  file: File,
  opts: { model?: string } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.model) fd.append('model', opts.model)

  const res = await api.post<FileResult>('/api/image/remove-bg', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function upscaleImage(
  file: File,
  opts: { scale?: number; model?: string; denoise_strength?: number; face_enhance?: boolean } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.scale != null) fd.append('scale', String(opts.scale))
  if (opts.model) fd.append('model', opts.model)
  if (opts.denoise_strength != null) fd.append('denoise_strength', String(opts.denoise_strength))
  if (opts.face_enhance) fd.append('face_enhance', 'true')

  const res = await api.post<FileResult>('/api/image/upscale', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function restoreFace(
  file: File,
  opts: { w?: number; upscale?: number } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.w != null) fd.append('w', String(opts.w))
  if (opts.upscale != null) fd.append('upscale', String(opts.upscale))

  const res = await api.post<FileResult>('/api/image/restore-face', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function denoiseImage(
  file: File,
  opts: { strength?: number; task?: string; model_width?: number } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.strength != null) fd.append('strength', String(opts.strength))
  if (opts.task) fd.append('task', opts.task)
  if (opts.model_width != null) fd.append('model_width', String(opts.model_width))

  const res = await api.post<FileResult>('/api/image/denoise', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function colorizeImage(
  file: File,
  opts: { model?: string } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.model) fd.append('model', opts.model)

  const res = await api.post<FileResult>('/api/image/colorize', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function inpaintImage(
  file: File,
  mask: Blob,
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
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

export async function ocrImage(
  file: File,
  opts: { lang?: OcrLang } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.lang) fd.append('lang', opts.lang)

  const res = await api.post<OcrResult>('/api/image/ocr', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export type SegmentResult = {
  mask_b64: string
  score: number
  width: number
  height: number
}

export async function segmentImage(
  file: File,
  opts: { points?: number[][]; boxes?: number[][] } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.points) fd.append('points', JSON.stringify(opts.points))
  if (opts.boxes) fd.append('boxes', JSON.stringify(opts.boxes))

  const res = await api.post<SegmentResult>('/api/image/segment', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}
