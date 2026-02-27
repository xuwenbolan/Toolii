import { GoogleOAuthProvider } from '@react-oauth/google'
import { QueryClientProvider } from '@tanstack/react-query'
import { HelmetProvider } from 'react-helmet-async'
import type { ReactNode } from 'react'

import { queryClient } from '@/config/queryClient'
import '@/config/i18n'

type Props = {
  children: ReactNode
}

const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined

export function AppProviders({ children }: Props) {
  const content = (
    <HelmetProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </HelmetProvider>
  )

  if (!googleClientId) return content

  return <GoogleOAuthProvider clientId={googleClientId}>{content}</GoogleOAuthProvider>
}
