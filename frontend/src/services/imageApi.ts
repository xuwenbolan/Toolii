import { api } from '@/services/api'
import type { AxiosProgressEvent } from 'axios'

export type FileResult = {
  file_id: string
  filename: string
  size: number
  content_type: string
  download_url: string
  expires_in: number
}

export type BatchResponse = {
  archive: FileResult
  items: Array<{ input_filename: string; output: FileResult }>
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

export async function mosaicImage(
  file: File,
  opts: { pixelSize?: number; regions?: unknown } = {},
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

export async function batchProcess(
  files: File[],
  opts: {
    action: 'compress' | 'convert'
    outputFormat?: string
    quality?: number
    targetKb?: number
  },
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  for (const file of files) fd.append('files', file)
  fd.append('action', opts.action)
  if (opts.outputFormat) fd.append('output_format', opts.outputFormat)
  if (opts.quality != null) fd.append('quality', String(opts.quality))
  if (opts.targetKb != null) fd.append('target_kb', String(opts.targetKb))

  const fallbackTotal = files.reduce((acc, f) => acc + f.size, 0)
  const res = await api.post<BatchResponse>('/api/image/batch', fd, {
    onUploadProgress: getProgressHandler(onProgress, fallbackTotal),
  })
  return res.data
}
