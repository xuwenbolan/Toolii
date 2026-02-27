import { GoogleLogin } from '@react-oauth/google'

import { loginWithGoogleCredential } from '@/services/authApi'

export function GoogleOAuthButton() {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined
  if (!clientId) return null

  return (
    <div className="flex justify-center">
      <GoogleLogin
        onSuccess={async (res) => {
          if (!res.credential) return
          await loginWithGoogleCredential(res.credential)
        }}
        onError={() => {
          // ignore
        }}
        useOneTap={false}
      />
    </div>
  )
}

