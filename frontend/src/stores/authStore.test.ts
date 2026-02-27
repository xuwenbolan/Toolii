import { useAuthStore } from '@/stores/authStore'

describe('authStore', () => {
  beforeEach(() => {
    useAuthStore.setState({ user: null, accessToken: null })
  })

  it('sets full session', () => {
    useAuthStore.getState().setSession({
      user: { id: 1, email: 'user@example.com', name: null, is_active: true },
      accessToken: 'access-token',
    })

    const state = useAuthStore.getState()
    expect(state.user?.email).toBe('user@example.com')
    expect(state.accessToken).toBe('access-token')
  })

  it('updates access token only', () => {
    useAuthStore.getState().setSession({
      user: { id: 2, email: 'token@example.com', name: null, is_active: true },
      accessToken: 'old-access',
    })
    useAuthStore.getState().setAccessToken('new-access')

    const state = useAuthStore.getState()
    expect(state.user?.id).toBe(2)
    expect(state.accessToken).toBe('new-access')
  })

  it('updates user only', () => {
    useAuthStore.getState().setSession({
      user: { id: 3, email: 'a@b.com', name: null, is_active: true },
      accessToken: 'tok',
    })
    useAuthStore.getState().setUser({ id: 3, email: 'a@b.com', name: 'New Name', is_active: true })

    const state = useAuthStore.getState()
    expect(state.user?.name).toBe('New Name')
    expect(state.accessToken).toBe('tok')
  })

  it('clears session', () => {
    useAuthStore.getState().setSession({
      user: { id: 3, email: 'clear@example.com', name: null, is_active: true },
      accessToken: 'x',
    })
    useAuthStore.getState().clear()
    const state = useAuthStore.getState()
    expect(state.user).toBeNull()
    expect(state.accessToken).toBeNull()
  })
})
