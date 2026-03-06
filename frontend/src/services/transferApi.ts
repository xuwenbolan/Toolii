import { api } from '@/services/api'
import type { AxiosProgressEvent } from 'axios'

export const TRANSFER_STATUS = {
  ACTIVE: 'active',
  EXPIRED: 'expired',
  BURNED: 'burned',
  DELETED: 'deleted',
} as const

export type TransferStatusType = (typeof TRANSFER_STATUS)[keyof typeof TRANSFER_STATUS]

export type TransferFileItem = {
  id: number
  original_filename: string
  size: number
  content_type: string
}

export type TransferCreateResponse = {
  token: string
  transfer_path: string
  expires_at: string
  file_count: number
  total_size: number
  burn_after_read: boolean
  extract_code: string | null
}

export type TransferInfoResponse = {
  token: string
  message: string | null
  expires_at: string
  file_count: number
  total_size: number
  has_extract_code: boolean
  download_count: number
  max_downloads: number | null
  burn_after_read: boolean
  status: TransferStatusType
  files: TransferFileItem[]
  created_at: string
}

export type TransferMyItem = {
  id: number
  token: string
  file_count: number
  total_size: number
  status: TransferStatusType
  download_count: number
  max_downloads: number | null
  burn_after_read: boolean
  extract_code: string | null
  expires_at: string
  created_at: string
}

export type TransferListResponse = {
  items: TransferMyItem[]
  total: number
}

export async function createTransfer(
  files: File[],
  opts: {
    retention: string
    useExtractCode?: boolean
    maxDownloads?: number
    message?: string
    burnAfterRead?: boolean
  },
  onProgress?: (percent: number) => void,
): Promise<TransferCreateResponse> {
  const fd = new FormData()
  for (const file of files) {
    fd.append('files', file)
  }
  fd.append('retention', opts.retention)
  if (opts.useExtractCode) fd.append('use_extract_code', 'true')
  if (opts.maxDownloads != null) fd.append('max_downloads', String(opts.maxDownloads))
  if (opts.message) fd.append('message', opts.message)
  if (opts.burnAfterRead) fd.append('burn_after_read', 'true')

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const res = await api.post<TransferCreateResponse>('/api/transfer/create', fd, {
    onUploadProgress: onProgress
      ? (evt: AxiosProgressEvent) => {
          const total = evt.total ?? totalSize
          if (total) onProgress((evt.loaded / total) * 100)
        }
      : undefined,
  })
  return res.data
}

export async function createTransferFromResult(
  fileId: string,
  retention = '24h',
): Promise<TransferCreateResponse> {
  const fd = new FormData()
  fd.append('file_id', fileId)
  fd.append('retention', retention)
  const res = await api.post<TransferCreateResponse>('/api/transfer/create-from-result', fd)
  return res.data
}

export async function getTransferInfo(token: string, code?: string): Promise<TransferInfoResponse> {
  const res = await api.get<TransferInfoResponse>(`/api/transfer/info/${token}`, {
    params: code ? { code } : undefined,
  })
  return res.data
}

export function buildTransferDownloadUrl(token: string, fileId: number, code?: string): string {
  const base = `/api/transfer/download/${token}/${fileId}`
  return code ? `${base}?code=${encodeURIComponent(code)}` : base
}

export function buildTransferZipUrl(token: string, code?: string): string {
  const base = `/api/transfer/download-zip/${token}`
  return code ? `${base}?code=${encodeURIComponent(code)}` : base
}

export async function getMyTransfers(limit = 50, offset = 0): Promise<TransferListResponse> {
  const res = await api.get<TransferListResponse>('/api/transfer/my', { params: { limit, offset } })
  return res.data
}

export async function deleteTransfer(transferId: number): Promise<void> {
  await api.delete(`/api/transfer/${transferId}`)
}
