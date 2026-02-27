import { GoogleLogin } from '@react-oauth/google'
import { useNavigate, useSearchParams } from 'react-router-dom'

import { loginWithGoogleCredential } from '@/services/authApi'

export function GoogleOAuthButton() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const redirectTo = params.get('redirect') ?? '/dashboard'

  if (!clientId) return null

  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={async (res) => {
          if (!res.credential) return
          await loginWithGoogleCredential(res.credential)
          navigate(redirectTo, { replace: true })
        }}
        onError={() => {
          // ignore
        }}
        useOneTap={false}
      />
    </div>
  )
}

