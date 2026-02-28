import { useEffect, useRef, useState } from 'react'

type FileCache = {
  pageCount: number
  thumbnails: Map<string, string>
}

type Result = {
  thumbnails: Map<string, string>
  pageCounts: Map<number, number>
  loading: boolean
  error: string | null
}

type Options = {
  maxPagesPerFile?: number
  thumbnailWidth?: number
}

/**
 * Render PDF page thumbnails for multiple files with per-file caching.
 * Returns a combined thumbnail map keyed by `f{fileIndex}-p{pageNumber}`.
 */
export function useMultiPdfThumbnails(files: File[], options: Options = {}): Result {
  const { maxPagesPerFile = 100, thumbnailWidth = 184 } = options
  const [thumbnails, setThumbnails] = useState<Map<string, string>>(new Map())
  const [pageCounts, setPageCounts] = useState<Map<number, number>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const cacheRef = useRef<WeakMap<File, FileCache>>(new WeakMap())

  useEffect(() => {
    let cancelled = false

    if (files.length === 0) {
      setThumbnails(new Map())
      setPageCounts(new Map())
      setLoading(false)
      setError(null)
      return
    }

    const render = async () => {
      setLoading(true)
      setError(null)

      try {
        const [pdfjsLib, workerModule] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default

        const allThumbs = new Map<string, string>()
        const allCounts = new Map<number, number>()

        for (let fi = 0; fi < files.length; fi++) {
          if (cancelled) return
          const file = files[fi]
          const cached = cacheRef.current.get(file)

          if (cached) {
            allCounts.set(fi, cached.pageCount)
            for (const [key, url] of cached.thumbnails) allThumbs.set(key, url)
            continue
          }

          const data = new Uint8Array(await file.arrayBuffer())
          const task = pdfjsLib.getDocument({ data })
          const pdf = await task.promise
          if (cancelled) { void task.destroy(); return }

          const typed = pdf as unknown as {
            numPages: number
            getPage: (n: number) => Promise<{
              getViewport: (o: { scale: number }) => { width: number; height: number }
              render: (o: {
                canvas: HTMLCanvasElement
                canvasContext: CanvasRenderingContext2D
                viewport: { width: number; height: number }
              }) => { promise: Promise<void> }
            }>
          }

          const pageCount = typed.numPages
          const renderCount = Math.min(pageCount, maxPagesPerFile)
          allCounts.set(fi, pageCount)

          // Emit page counts early so workspace can create page entries
          if (!cancelled) setPageCounts(new Map(allCounts))

          const fileCache = new Map<string, string>()
          for (let pn = 1; pn <= renderCount; pn++) {
            if (cancelled) return
            const page = await typed.getPage(pn)
            const baseVp = page.getViewport({ scale: 1 })
            const scale = baseVp.width > 0 ? thumbnailWidth / baseVp.width : 1
            const viewport = page.getViewport({ scale })
            const canvas = document.createElement('canvas')
            const ctx = canvas.getContext('2d', { alpha: false })
            if (!ctx) continue
            canvas.width = Math.ceil(viewport.width)
            canvas.height = Math.ceil(viewport.height)
            await page.render({ canvas, canvasContext: ctx, viewport }).promise
            const dataUrl = canvas.toDataURL('image/jpeg', 0.82)
            const id = `f${fi}-p${pn}`
            allThumbs.set(id, dataUrl)
            fileCache.set(id, dataUrl)
          }

          cacheRef.current.set(file, { pageCount, thumbnails: fileCache })

          // Emit thumbnails incrementally per file
          if (!cancelled) setThumbnails(new Map(allThumbs))
        }

        if (!cancelled) {
          setThumbnails(allThumbs)
          setPageCounts(allCounts)
        }
      } catch {
        if (!cancelled) setError('PDF_RENDER_FAILED')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void render()
    return () => { cancelled = true }
  }, [files, maxPagesPerFile, thumbnailWidth])

  return { thumbnails, pageCounts, loading, error }
}
