import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

import i18n from '@/config/i18n'
import { useAuthStore } from '@/stores/authStore'

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

export const api = axios.create({
  baseURL: '',
  timeout: 120_000,
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

const refreshClient = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
  withCredentials: true,
})

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState()
  config.headers = config.headers ?? {}
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  // Send current UI language to backend for email localization
  config.headers['Accept-Language'] = i18n.language || 'zh-CN'
  // Let the browser set the correct Content-Type with boundary for FormData
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/api/auth/refresh')
      .then((res) => {
        const access = res.data?.tokens?.access_token as string | undefined
        if (!access) return null
        const store = useAuthStore.getState()
        store.setAccessToken(access)
        if (res.data?.user) store.setUser(res.data.user)
        return access
      })
      .catch(() => null)
      .finally(() => {
        refreshPromise = null
      })
  }

  return refreshPromise
}

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined
    const status = error.response?.status

    if (original?.url?.includes('/api/auth/refresh')) {
      return Promise.reject(error)
    }

    if (!original || status !== 401 || original._retry) {
      return Promise.reject(error)
    }

    original._retry = true
    const newAccess = await refreshAccessToken()
    if (!newAccess) {
      useAuthStore.getState().clear()
      return Promise.reject(error)
    }

    original.headers = original.headers ?? {}
    original.headers.Authorization = `Bearer ${newAccess}`
    return api(original)
  },
)
