import type { AxiosProgressEvent } from 'axios'

import { api } from '@/services/api'

export type FileResult = {
  file_id: string
  filename: string
  size: number
  content_type: string
  download_url: string
  expires_in: number
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

export async function compressPdf(
  file: File,
  opts: { targetKb?: number } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  if (opts.targetKb != null) fd.append('target_kb', String(opts.targetKb))

  const res = await api.post<FileResult>('/api/pdf/compress', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function mergePdfs(
  files: File[],
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  for (const file of files) fd.append('files', file)
  const total = files.reduce((acc, file) => acc + file.size, 0)

  const res = await api.post<FileResult>('/api/pdf/merge', fd, {
    onUploadProgress: getProgressHandler(onProgress, total),
  })
  return res.data
}

export type EditPdfPagesOptions = {
  operation: 'rotate' | 'delete' | 'extract' | 'reorder'
  pages?: number[]
  order?: number[]
  rotation?: number
}

export async function editPdfPages(
  file: File,
  opts: EditPdfPagesOptions,
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('operation', opts.operation)
  if (opts.pages) fd.append('pages', JSON.stringify(opts.pages))
  if (opts.order) fd.append('order', JSON.stringify(opts.order))
  if (opts.rotation != null) fd.append('rotation', String(opts.rotation))

  const res = await api.post<FileResult>('/api/pdf/pages', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function splitPdf(
  file: File,
  opts: { ranges: string },
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('ranges', opts.ranges)

  const res = await api.post<FileResult>('/api/pdf/split', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function imagesToPdf(
  files: File[],
  opts: { dpi?: number } = {},
  onProgress?: (percent: number) => void,
) {
  const fd = new FormData()
  for (const file of files) fd.append('files', file)
  if (opts.dpi != null) fd.append('dpi', String(opts.dpi))
  const total = files.reduce((acc, file) => acc + file.size, 0)

  const res = await api.post<FileResult>('/api/pdf/from-images', fd, {
    onUploadProgress: getProgressHandler(onProgress, total),
  })
  return res.data
}

