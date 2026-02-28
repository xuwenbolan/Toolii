import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/source-sans-3/latin-400.css'
import '@fontsource/source-sans-3/latin-500.css'
import '@fontsource/source-sans-3/latin-600.css'
import '@fontsource/source-sans-3/latin-700.css'
import '@fontsource/source-code-pro/latin-400.css'
import '@fontsource/source-code-pro/latin-500.css'
import './index.css'
import App from './App.tsx'
import { AppProviders } from '@/providers/AppProviders'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <App />
    </AppProviders>
  </StrictMode>,
)
