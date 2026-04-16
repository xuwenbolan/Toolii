import type { AxiosProgressEvent } from 'axios'

import { api } from '@/services/api'
import type { FileResult } from '@/services/pdfApi'

// Re-export for convenience
export type { FileResult }

export type DocxIssue = {
  code: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  count: number
  fixable: boolean
  params?: Record<string, unknown>
}

export type DocxMetadata = {
  word_count: number
  paragraph_count: number
  heading_count: number
  image_count: number
  font_families: string[]
  style_count: number
  page_count_estimate: number
}

export type DocxHeadingItem = {
  level: number
  text: string
  has_issue: boolean
  issue_code: string | null
}

export type DocxAnalysisResult = {
  metadata: DocxMetadata
  headings: DocxHeadingItem[]
  issues: DocxIssue[]
  score: number
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

export async function analyzeDocx(
  file: File,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<DocxAnalysisResult> {
  const fd = new FormData()
  fd.append('file', file)

  const res = await api.post<DocxAnalysisResult>('/api/docx/analyze', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
    signal,
  })
  return res.data
}

export async function convertDocx(
  file: File,
  onProgress?: (percent: number) => void,
  issueCodes?: string[],
): Promise<FileResult> {
  const fd = new FormData()
  fd.append('file', file)
  if (issueCodes && issueCodes.length > 0) {
    fd.append('issues', JSON.stringify(issueCodes))
  }

  const res = await api.post<FileResult>('/api/docx/convert', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function repairDocx(
  file: File,
  issueCodes: string[],
  onProgress?: (percent: number) => void,
): Promise<FileResult> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('issues', JSON.stringify(issueCodes))

  const res = await api.post<FileResult>('/api/docx/repair', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function mergeDocx(
  files: File[],
  opts: {
    outputFormat?: 'docx' | 'pdf'
    issues?: Record<number, string[]>
  } = {},
  onProgress?: (percent: number) => void,
): Promise<FileResult> {
  const fd = new FormData()
  for (const file of files) fd.append('files', file)
  if (opts.outputFormat) fd.append('output_format', opts.outputFormat)
  if (opts.issues && Object.keys(opts.issues).length > 0) {
    fd.append('issues', JSON.stringify(opts.issues))
  }
  const total = files.reduce((acc, f) => acc + f.size, 0)

  const res = await api.post<FileResult>('/api/docx/merge', fd, {
    onUploadProgress: getProgressHandler(onProgress, total),
  })
  return res.data
}

export async function splitDocx(
  file: File,
  splitLevel: number = 1,
  onProgress?: (percent: number) => void,
): Promise<FileResult> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('split_level', String(splitLevel))

  const res = await api.post<FileResult>('/api/docx/split', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}

export async function compressDocx(
  file: File,
  imageQuality: number = 75,
  onProgress?: (percent: number) => void,
): Promise<FileResult> {
  const fd = new FormData()
  fd.append('file', file)
  fd.append('image_quality', String(imageQuality))

  const res = await api.post<FileResult>('/api/docx/compress', fd, {
    onUploadProgress: getProgressHandler(onProgress, file.size),
  })
  return res.data
}
