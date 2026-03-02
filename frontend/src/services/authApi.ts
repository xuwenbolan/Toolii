import { api } from '@/services/api'
import { useAuthStore, type AuthUser } from '@/stores/authStore'

type AccessTokenResponse = {
  token_type: 'bearer'
  access_token: string
  expires_in: number
}

type AuthResponse = {
  user: AuthUser
  tokens: AccessTokenResponse
}

export async function registerWithEmail(email: string, password: string, name?: string) {
  const body: Record<string, string> = { email, password }
  if (name) body.name = name
  const res = await api.post<AuthResponse>('/api/auth/register', body)
  const { user, tokens } = res.data
  useAuthStore.getState().setSession({
    user,
    accessToken: tokens.access_token,
  })
  return user
}

export async function loginWithEmail(email: string, password: string) {
  const res = await api.post<AuthResponse>('/api/auth/login', { email, password })
  const { user, tokens } = res.data
  useAuthStore.getState().setSession({
    user,
    accessToken: tokens.access_token,
  })
  return user
}

export async function loginWithGoogleAccessToken(
  accessToken: string,
  linkPassword?: string,
) {
  const body: Record<string, string> = { access_token: accessToken }
  if (linkPassword) body.link_password = linkPassword
  const res = await api.post<AuthResponse>('/api/auth/google', body)
  const { user, tokens } = res.data
  useAuthStore.getState().setSession({
    user,
    accessToken: tokens.access_token,
  })
  return user
}

export async function fetchMe() {
  const res = await api.get<AuthUser>('/api/auth/me')
  const user = res.data
  useAuthStore.getState().setUser(user)
  return user
}

export async function logoutApi() {
  try {
    await api.post('/api/auth/logout')
  } catch {
    // Best-effort; clear local state regardless
  }
  useAuthStore.getState().clear()
}
