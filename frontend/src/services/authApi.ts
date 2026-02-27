import { api } from '@/services/api'
import { useAuthStore, type AuthUser } from '@/stores/authStore'

type TokenPair = {
  token_type: 'bearer'
  access_token: string
  refresh_token: string
  expires_in: number
}

type AuthResponse = {
  user: AuthUser
  tokens: TokenPair
}

export async function registerWithEmail(email: string, password: string) {
  const res = await api.post<AuthResponse>('/api/auth/register', { email, password })
  const { user, tokens } = res.data
  useAuthStore.getState().setSession({
    user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  })
  return user
}

export async function loginWithEmail(email: string, password: string) {
  const res = await api.post<AuthResponse>('/api/auth/login', { email, password })
  const { user, tokens } = res.data
  useAuthStore.getState().setSession({
    user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  })
  return user
}

export async function loginWithGoogleCredential(credential: string) {
  const res = await api.post<AuthResponse>('/api/auth/google', { credential })
  const { user, tokens } = res.data
  useAuthStore.getState().setSession({
    user,
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
  })
  return user
}

export async function fetchMe() {
  const res = await api.get<AuthUser>('/api/auth/me')
  const user = res.data
  const { accessToken, refreshToken } = useAuthStore.getState()
  if (accessToken && refreshToken) {
    useAuthStore.getState().setSession({ user, accessToken, refreshToken })
  }
  return user
}

