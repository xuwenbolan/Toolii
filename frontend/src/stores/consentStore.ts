import { create } from 'zustand'
import { persist } from 'zustand/middleware'

type ConsentState = {
  cookieConsent: 'unknown' | 'accepted' | 'rejected'
  accept: () => void
  reject: () => void
}

export const useConsentStore = create<ConsentState>()(
  persist(
    (set) => ({
      cookieConsent: 'unknown',
      accept: () => set({ cookieConsent: 'accepted' }),
      reject: () => set({ cookieConsent: 'rejected' }),
    }),
    {
      name: 'toolii_consent',
      version: 1,
      partialize: (s) => ({ cookieConsent: s.cookieConsent }),
    },
  ),
)

