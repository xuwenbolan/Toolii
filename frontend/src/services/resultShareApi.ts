import { api } from '@/services/api'

export type ResultShareCreateResponse = {
  token: string
  share_url: string
  expires_at: string
}

export type ResultShareData = {
  token: string
  result_json: string
  share_type: string
  locale: string
  image_url: string
  original_image_url: string | null
  expires_at: string
  created_at: string
}

export async function createResultShare(
  image: File,
  resultJson: string,
  shareType: string,
  locale: string,
  resultFileId?: string,
): Promise<ResultShareCreateResponse> {
  const fd = new FormData()
  fd.append('image', image)
  fd.append('result_json', resultJson)
  fd.append('share_type', shareType)
  fd.append('locale', locale)
  if (resultFileId) {
    fd.append('result_file_id', resultFileId)
  }
  const res = await api.post<ResultShareCreateResponse>('/api/result-share/create', fd)
  return res.data
}

export async function createSimilarityShare(
  file1: File,
  file2: File,
  resultJson: string,
  locale: string,
): Promise<ResultShareCreateResponse> {
  const fd = new FormData()
  fd.append('file1', file1)
  fd.append('file2', file2)
  fd.append('result_json', resultJson)
  fd.append('locale', locale)
  const res = await api.post<ResultShareCreateResponse>('/api/result-share/create-similarity', fd)
  return res.data
}

export async function getResultShare(token: string): Promise<ResultShareData> {
  const res = await api.get<ResultShareData>(`/api/result-share/${token}`)
  return res.data
}
