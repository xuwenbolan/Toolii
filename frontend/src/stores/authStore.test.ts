import { useAuthStore } from '@/stores/authStore'

describe('authStore', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({ user: null, accessToken: null, refreshToken: null })
  })

  it('sets full session', () => {
    useAuthStore.getState().setSession({
      user: { id: 1, email: 'user@example.com', is_active: true },
      accessToken: 'access-token',
      refreshToken: 'refresh-token',
    })

    const state = useAuthStore.getState()
    expect(state.user?.email).toBe('user@example.com')
    expect(state.accessToken).toBe('access-token')
    expect(state.refreshToken).toBe('refresh-token')
  })

  it('updates tokens only', () => {
    useAuthStore.getState().setSession({
      user: { id: 2, email: 'token@example.com', is_active: true },
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
    })
    useAuthStore.getState().setTokens({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
    })

    const state = useAuthStore.getState()
    expect(state.user?.id).toBe(2)
    expect(state.accessToken).toBe('new-access')
    expect(state.refreshToken).toBe('new-refresh')
  })

  it('clears session', () => {
    useAuthStore.getState().setSession({
      user: { id: 3, email: 'clear@example.com', is_active: true },
      accessToken: 'x',
      refreshToken: 'y',
    })
    useAuthStore.getState().clear()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
    expect(state.refreshToken).toBeNull()
  })
})
