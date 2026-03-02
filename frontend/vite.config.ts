import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'

const SITE_URL = 'https://www.toolii.cc'
const SITE_NAME = 'Toolii'

// All public routes for sitemap and SEO meta injection.
// Auth, dashboard, admin, and share routes are excluded.
const PUBLIC_ROUTES = [
  '/',
  '/id-photo',
  '/facemap',
  '/image-tools',
  '/image-tools/compress',
  '/image-tools/heic-to-jpg',
  '/image-tools/convert',
  '/image-tools/jpg-to-png',
  '/image-tools/jpg-to-webp',
  '/image-tools/png-to-jpg',
  '/image-tools/png-to-webp',
  '/image-tools/webp-to-jpg',
  '/image-tools/webp-to-png',
  '/image-tools/mosaic',
  '/image-tools/scan-enhance',
  '/image-tools/remove-bg',
  '/pdf-tools',
  '/pdf-tools/compress',
  '/pdf-tools/merge',
  '/pdf-tools/pages',
  '/pdf-tools/from-images',
  '/pdf-tools/split',
  '/text-tools',
  '/text-tools/word-counter',
  '/legal/privacy',
  '/legal/terms',
]

// ---------------------------------------------------------------------------
// Build-time SEO: read i18n JSON, inject meta tags into per-route HTML files
// ---------------------------------------------------------------------------

type SeoMeta = { title: string; description: string; keywords?: string }

function readLocaleJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(__dirname, 'public/locales/en', file), 'utf-8'))
}

function g(obj: Record<string, unknown>, keyPath: string): string {
  let cur: unknown = obj
  for (const k of keyPath.split('.')) {
    if (cur && typeof cur === 'object') cur = (cur as Record<string, unknown>)[k]
    else return ''
  }
  return typeof cur === 'string' ? cur : ''
}

function buildRouteMeta(): Record<string, SeoMeta> {
  const common = readLocaleJson('common.json')
  const tools = readLocaleJson('tools.json')
  const idPhoto = readLocaleJson('idPhoto.json')
  const faceMap = readLocaleJson('faceMap.json')
  const textTools = readLocaleJson('textTools.json')
  const legal = readLocaleJson('legal.json')

  return {
    '/':          { title: g(common, 'home.seoTitle'), description: g(common, 'home.seoDescription'), keywords: g(common, 'home.seoKeywords') },
    '/id-photo':  { title: g(idPhoto, 'seo.title'), description: g(idPhoto, 'seo.description'), keywords: g(idPhoto, 'seo.keywords') },
    '/facemap':   { title: g(faceMap, 'seo.title'), description: g(faceMap, 'seo.description'), keywords: g(faceMap, 'seo.keywords') },

    '/image-tools':              { title: g(tools, 'seoTitle'), description: g(tools, 'seoDescription'), keywords: g(tools, 'seoKeywords') },
    '/image-tools/compress':     { title: g(tools, 'compress.seoTitle'), description: g(tools, 'compress.seoDescription'), keywords: g(tools, 'compress.seoKeywords') },
    '/image-tools/heic-to-jpg':  { title: g(tools, 'heicToJpg.seoTitle'), description: g(tools, 'heicToJpg.seoDescription'), keywords: g(tools, 'heicToJpg.seoKeywords') },
    '/image-tools/convert':      { title: g(tools, 'convert.seoTitle'), description: g(tools, 'convert.seoDescription'), keywords: g(tools, 'convert.seoKeywords') },
    '/image-tools/mosaic':       { title: g(tools, 'mosaic.seoTitle'), description: g(tools, 'mosaic.seoDescription'), keywords: g(tools, 'mosaic.seoKeywords') },
    '/image-tools/scan-enhance': { title: g(tools, 'scanEnhance.seoTitle'), description: g(tools, 'scanEnhance.seoDescription'), keywords: g(tools, 'scanEnhance.seoKeywords') },
    '/image-tools/remove-bg':    { title: g(tools, 'removeBg.seoTitle'), description: g(tools, 'removeBg.seoDescription'), keywords: g(tools, 'removeBg.seoKeywords') },
    '/image-tools/jpg-to-png':   { title: g(tools, 'jpgToPng.seoTitle'), description: g(tools, 'jpgToPng.seoDescription'), keywords: g(tools, 'jpgToPng.seoKeywords') },
    '/image-tools/jpg-to-webp':  { title: g(tools, 'jpgToWebp.seoTitle'), description: g(tools, 'jpgToWebp.seoDescription'), keywords: g(tools, 'jpgToWebp.seoKeywords') },
    '/image-tools/png-to-jpg':   { title: g(tools, 'pngToJpg.seoTitle'), description: g(tools, 'pngToJpg.seoDescription'), keywords: g(tools, 'pngToJpg.seoKeywords') },
    '/image-tools/png-to-webp':  { title: g(tools, 'pngToWebp.seoTitle'), description: g(tools, 'pngToWebp.seoDescription'), keywords: g(tools, 'pngToWebp.seoKeywords') },
    '/image-tools/webp-to-jpg':  { title: g(tools, 'webpToJpg.seoTitle'), description: g(tools, 'webpToJpg.seoDescription'), keywords: g(tools, 'webpToJpg.seoKeywords') },
    '/image-tools/webp-to-png':  { title: g(tools, 'webpToPng.seoTitle'), description: g(tools, 'webpToPng.seoDescription'), keywords: g(tools, 'webpToPng.seoKeywords') },

    '/pdf-tools':             { title: g(tools, 'pdf.seoTitle'), description: g(tools, 'pdf.seoDescription'), keywords: g(tools, 'pdf.seoKeywords') },
    '/pdf-tools/compress':    { title: g(tools, 'pdf.compress.seoTitle'), description: g(tools, 'pdf.compress.seoDescription'), keywords: g(tools, 'pdf.compress.seoKeywords') },
    '/pdf-tools/merge':       { title: g(tools, 'pdf.merge.seoTitle'), description: g(tools, 'pdf.merge.seoDescription'), keywords: g(tools, 'pdf.merge.seoKeywords') },
    '/pdf-tools/pages':       { title: g(tools, 'pdf.pages.seoTitle'), description: g(tools, 'pdf.pages.seoDescription'), keywords: g(tools, 'pdf.pages.seoKeywords') },
    '/pdf-tools/from-images': { title: g(tools, 'pdf.imagesToPdf.seoTitle'), description: g(tools, 'pdf.imagesToPdf.seoDescription'), keywords: g(tools, 'pdf.imagesToPdf.seoKeywords') },
    '/pdf-tools/split':       { title: g(tools, 'pdf.split.seoTitle'), description: g(tools, 'pdf.split.seoDescription'), keywords: g(tools, 'pdf.split.seoKeywords') },

    '/text-tools':              { title: g(textTools, 'seoTitle'), description: g(textTools, 'seoDescription'), keywords: g(textTools, 'seoKeywords') },
    '/text-tools/word-counter': { title: g(textTools, 'wordCounter.seoTitle'), description: g(textTools, 'wordCounter.seoDescription'), keywords: g(textTools, 'wordCounter.seoKeywords') },

    '/legal/privacy': { title: g(legal, 'privacy.metaTitle'), description: g(legal, 'privacy.metaDescription') },
    '/legal/terms':   { title: g(legal, 'terms.metaTitle'), description: g(legal, 'terms.metaDescription') },
  }
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function injectMeta(html: string, meta: SeoMeta, route: string): string {
  const fullTitle = `${meta.title} | ${SITE_NAME}`
  const url = `${SITE_URL}${route}`
  const ogImage = `${SITE_URL}/og-image.png`

  // Strip default meta/OG/twitter tags from base HTML to avoid duplicates
  html = html
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(fullTitle)}</title>`)
    .replace(/\s*<meta name="description"[^>]*\/>\s*/g, '\n')
    .replace(/\s*<meta property="og:[^>]*\/>\s*/g, '\n')
    .replace(/\s*<meta name="twitter:[^>]*\/>\s*/g, '\n')

  const tags = [
    `<meta name="description" content="${escHtml(meta.description)}" />`,
    meta.keywords ? `<meta name="keywords" content="${escHtml(meta.keywords)}" />` : '',
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="${SITE_NAME}" />`,
    `<meta property="og:title" content="${escHtml(fullTitle)}" />`,
    `<meta property="og:description" content="${escHtml(meta.description)}" />`,
    `<meta property="og:url" content="${url}" />`,
    `<meta property="og:image" content="${ogImage}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escHtml(fullTitle)}" />`,
    `<meta name="twitter:description" content="${escHtml(meta.description)}" />`,
    `<meta name="twitter:image" content="${ogImage}" />`,
    `<link rel="canonical" href="${url}" />`,
    `<link rel="alternate" hreflang="en" href="${url}" />`,
    `<link rel="alternate" hreflang="zh-Hans" href="${url}" />`,
    `<link rel="alternate" hreflang="x-default" href="${url}" />`,
  ].filter(Boolean)

  return html.replace('</head>', `    ${tags.join('\n    ')}\n  </head>`)
}

function seoPlugin(): Plugin {
  return {
    name: 'seo-meta-and-sitemap',
    enforce: 'post',
    closeBundle() {
      const distDir = path.join(__dirname, 'dist')
      const baseHtml = readFileSync(path.join(distDir, 'index.html'), 'utf-8')
      const routeMeta = buildRouteMeta()

      let injected = 0
      for (const route of PUBLIC_ROUTES) {
        const meta = routeMeta[route]
        if (!meta?.title) continue

        const html = injectMeta(baseHtml, meta, route)
        if (route === '/') {
          writeFileSync(path.join(distDir, 'index.html'), html)
        } else {
          const dir = path.join(distDir, route)
          mkdirSync(dir, { recursive: true })
          writeFileSync(path.join(dir, 'index.html'), html)
        }
        injected++
      }

      // Generate sitemap.xml
      const buildDate = new Date().toISOString().split('T')[0]
      const urls = PUBLIC_ROUTES.map((r) => {
        let priority = 0.7
        let changefreq = 'monthly'
        if (r === '/') {
          priority = 1.0
          changefreq = 'weekly'
        } else if (['/id-photo', '/facemap', '/image-tools', '/pdf-tools', '/text-tools'].includes(r)) {
          priority = 0.8
          changefreq = 'weekly'
        } else if (r.startsWith('/legal/')) {
          priority = 0.3
          changefreq = 'yearly'
        }
        return [
          '  <url>',
          `    <loc>${SITE_URL}${r}</loc>`,
          `    <lastmod>${buildDate}</lastmod>`,
          `    <changefreq>${changefreq}</changefreq>`,
          `    <priority>${priority}</priority>`,
          '  </url>',
        ].join('\n')
      }).join('\n')
      writeFileSync(
        path.join(distDir, 'sitemap.xml'),
        `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`,
      )

      console.log(`[seo] Injected meta for ${injected} routes, sitemap.xml generated (${PUBLIC_ROUTES.length} URLs)`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), seoPlugin()],
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
          if (id.includes('gpt-tokenizer')) return 'tokenizer'
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
