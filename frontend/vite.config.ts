import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (/\/node_modules\/(react|react-dom|scheduler)\//.test(id)) {
            return 'react-core'
          }
          if (id.includes('@tanstack/react-query')) return 'query'
          if (id.includes('i18next') || id.includes('react-i18next')) return 'i18n'
          if (id.includes('@radix-ui')) return 'radix'
          if (id.includes('recharts') || id.includes('/d3-') || id.includes('victory-vendor')) return 'charts'
          if (id.includes('@dnd-kit')) return 'dnd'
          if (id.includes('zod')) return 'zod'
          if (id.includes('pdfjs-dist')) return 'pdfjs'
          if (id.includes('react-image-crop')) return 'image-crop'
          return 'vendor'
        },
      },
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': 'http://localhost:8000',
    },
  },
})
