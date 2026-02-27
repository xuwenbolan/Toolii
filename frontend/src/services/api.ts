import axios, { type AxiosError, type InternalAxiosRequestConfig } from 'axios'

import { useAuthStore } from '@/stores/authStore'

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean }

export const api = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
})

const refreshClient = axios.create({
  baseURL: '',
  headers: {
    'Content-Type': 'application/json',
  },
})

api.interceptors.request.use((config) => {
  const { accessToken } = useAuthStore.getState()
  if (accessToken) {
    config.headers = config.headers ?? {}
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  // Let the browser set the correct Content-Type with boundary for FormData
  if (config.data instanceof FormData) {
    delete config.headers['Content-Type']
  }
  return config
})

let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  const { refreshToken } = useAuthStore.getState()
  if (!refreshToken) return null

  if (!refreshPromise) {
    refreshPromise = refreshClient
      .post('/api/auth/refresh', { refresh_token: refreshToken })
      .then((res) => {
        const access = res.data?.access_token as string | undefined
        const refresh = res.data?.refresh_token as string | undefined
        if (!access || !refresh) return null
        useAuthStore.getState().setTokens({ accessToken: access, refreshToken: refresh })
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
