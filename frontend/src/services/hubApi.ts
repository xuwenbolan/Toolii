import { api } from '@/services/api'
import type { AxiosProgressEvent } from 'axios'

// ── Types ────────────────────────────────────────────────

export type UserFileItem = {
  id: number
  file_name: string
  size: number
  content_type: string
  source: string
  expires_at: string
  created_at: string
  share_count: number
}

export type UserFileListResponse = {
  items: UserFileItem[]
  total: number
  used_bytes: number
  quota_bytes: number
}

export type ShareGroupResponse = {
  id: number
  token: string
  share_url: string
  extract_code: string | null
  message: string | null
  file_count: number
  total_size: number
  expires_at: string
  created_at: string
}

export type ShareGroupListItem = {
  id: number
  token: string
  file_count: number
  total_size: number
  download_count: number
  extract_code: string | null
  message: string | null
  status: string
  expires_at: string | null
  created_at: string
}

export type ShareGroupListResponse = {
  items: ShareGroupListItem[]
  total: number
}

export type QuickShareResponse = {
  files: UserFileItem[]
  share: ShareGroupResponse
}

export type ShareFileItem = {
  id: number
  file_name: string
  size: number
  content_type: string
}

export type ShareInfoResponse = {
  token: string
  message: string | null
  file_count: number
  total_size: number
  download_count: number
  has_extract_code: boolean
  status: string
  expires_at: string
  created_at: string
  files: ShareFileItem[]
}

export type ShareNeedCodeResponse = {
  need_code: true
}

// ── File management ──────────────────────────────────────

export async function listFiles(opts?: {
  page?: number
  pageSize?: number
  source?: string
}): Promise<UserFileListResponse> {
  const res = await api.get<UserFileListResponse>('/api/hub/files', {
    params: {
      page: opts?.page ?? 1,
      page_size: opts?.pageSize ?? 20,
      source: opts?.source,
    },
  })
  return res.data
}

export async function uploadFiles(
  files: File[],
  retentionDays = 3,
  onProgress?: (percent: number) => void,
): Promise<{ files: UserFileItem[] }> {
  const fd = new FormData()
  for (const file of files) {
    fd.append('files', file)
  }
  fd.append('retention_days', String(retentionDays))

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const res = await api.post<{ files: UserFileItem[] }>('/api/hub/upload', fd, {
    onUploadProgress: onProgress
      ? (evt: AxiosProgressEvent) => {
          const total = evt.total ?? totalSize
          if (total) onProgress((evt.loaded / total) * 100)
        }
      : undefined,
  })
  return res.data
}

export async function renameFile(fileId: number, fileName: string): Promise<void> {
  await api.patch(`/api/hub/files/${fileId}`, { file_name: fileName })
}

export async function extendFile(fileId: number, days: number): Promise<{ expires_at: string }> {
  const res = await api.post<{ id: number; expires_at: string }>(
    `/api/hub/files/${fileId}/extend`,
    { days },
  )
  return res.data
}

export async function deleteFiles(ids: number[]): Promise<{ deleted: number }> {
  const res = await api.delete<{ deleted: number }>('/api/hub/files', { data: { ids } })
  return res.data
}

export function buildFileDownloadUrl(fileId: number): string {
  return `/api/hub/files/${fileId}/download`
}

// ── Share groups ─────────────────────────────────────────

export async function createShare(opts: {
  fileIds: number[]
  useExtractCode?: boolean
  message?: string
}): Promise<ShareGroupResponse> {
  const res = await api.post<ShareGroupResponse>('/api/hub/shares', {
    file_ids: opts.fileIds,
    use_extract_code: opts.useExtractCode ?? false,
    message: opts.message,
  })
  return res.data
}

export async function listShares(opts?: {
  page?: number
  pageSize?: number
}): Promise<ShareGroupListResponse> {
  const res = await api.get<ShareGroupListResponse>('/api/hub/shares', {
    params: {
      page: opts?.page ?? 1,
      page_size: opts?.pageSize ?? 20,
    },
  })
  return res.data
}

export async function deleteShare(shareId: number): Promise<void> {
  await api.delete(`/api/hub/shares/${shareId}`)
}

// ── Quick Share ──────────────────────────────────────────

export async function quickShare(
  files: File[],
  opts: {
    retentionDays?: number
    useExtractCode?: boolean
    message?: string
  },
  onProgress?: (percent: number) => void,
): Promise<QuickShareResponse> {
  const fd = new FormData()
  for (const file of files) {
    fd.append('files', file)
  }
  fd.append('retention_days', String(opts.retentionDays ?? 3))
  if (opts.useExtractCode) fd.append('use_extract_code', 'true')
  if (opts.message) fd.append('message', opts.message)

  const totalSize = files.reduce((sum, f) => sum + f.size, 0)
  const res = await api.post<QuickShareResponse>('/api/hub/quick-share', fd, {
    onUploadProgress: onProgress
      ? (evt: AxiosProgressEvent) => {
          const total = evt.total ?? totalSize
          if (total) onProgress((evt.loaded / total) * 100)
        }
      : undefined,
  })
  return res.data
}

// ── Public share access ──────────────────────────────────

export async function getShareInfo(
  token: string,
  code?: string,
): Promise<ShareInfoResponse | ShareNeedCodeResponse> {
  const res = await api.get<ShareInfoResponse | ShareNeedCodeResponse>(
    `/api/hub/s/${token}/info`,
    { params: code ? { code } : undefined },
  )
  return res.data
}

export function buildShareDownloadUrl(token: string, fileId: number, code?: string): string {
  const base = `/api/hub/s/${token}/${fileId}/download`
  return code ? `${base}?code=${encodeURIComponent(code)}` : base
}

export function buildShareZipUrl(token: string, code?: string): string {
  const base = `/api/hub/s/${token}/download-zip`
  return code ? `${base}?code=${encodeURIComponent(code)}` : base
}
