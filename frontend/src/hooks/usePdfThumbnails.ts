import { useEffect, useState } from 'react'

export type PdfThumbnail = {
  pageNumber: number
  dataUrl: string
  width: number
  height: number
}

type UsePdfThumbnailsResult = {
  thumbnails: PdfThumbnail[]
  totalPages: number
  renderedPages: number
  loading: boolean
  error: string | null
}

type Options = {
  maxPages?: number
  thumbnailWidth?: number
}

export function usePdfThumbnails(file: File | null, options: Options = {}): UsePdfThumbnailsResult {
  const { maxPages = 80, thumbnailWidth = 168 } = options
  const [thumbnails, setThumbnails] = useState<PdfThumbnail[]>([])
  const [totalPages, setTotalPages] = useState(0)
  const [renderedPages, setRenderedPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    let task: { promise: Promise<unknown>; destroy: () => void | Promise<void> } | null = null

    if (!file) {
      setThumbnails([])
      setTotalPages(0)
      setRenderedPages(0)
      setLoading(false)
      setError(null)
      return
    }

    const render = async () => {
      setLoading(true)
      setError(null)
      setThumbnails([])
      setTotalPages(0)
      setRenderedPages(0)

      try {
        const [pdfjsLib, workerModule] = await Promise.all([
          import('pdfjs-dist'),
          import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
        ])
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default

        const data = new Uint8Array(await file.arrayBuffer())
        task = pdfjsLib.getDocument({ data })
        const pdf = await task.promise
        if (cancelled) return

        const typedPdf = pdf as { numPages: number; getPage: (pageNumber: number) => Promise<{
          getViewport: (opts: { scale: number }) => { width: number; height: number }
          render: (opts: { canvas: HTMLCanvasElement; canvasContext: CanvasRenderingContext2D; viewport: { width: number; height: number } }) => { promise: Promise<void> }
        }> }

        const pageCount = typedPdf.numPages
        const renderCount = Math.min(pageCount, maxPages)
        setTotalPages(pageCount)

        const next: PdfThumbnail[] = []
        for (let pageNumber = 1; pageNumber <= renderCount; pageNumber += 1) {
          if (cancelled) return

          const page = await typedPdf.getPage(pageNumber)
          const baseViewport = page.getViewport({ scale: 1 })
          const scale = baseViewport.width > 0 ? thumbnailWidth / baseViewport.width : 1
          const viewport = page.getViewport({ scale })

          const canvas = document.createElement('canvas')
          const context = canvas.getContext('2d', { alpha: false })
          if (!context) continue

          canvas.width = Math.ceil(viewport.width)
          canvas.height = Math.ceil(viewport.height)
          await page.render({ canvas, canvasContext: context, viewport }).promise
          next.push({
            pageNumber,
            dataUrl: canvas.toDataURL('image/jpeg', 0.82),
            width: canvas.width,
            height: canvas.height,
          })
        }

        if (cancelled) return
        setThumbnails(next)
        setRenderedPages(next.length)
      } catch {
        if (!cancelled) {
          setError('PDF_RENDER_FAILED')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void render()
    return () => {
      cancelled = true
      if (task) {
        void task.destroy()
      }
    }
  }, [file, maxPages, thumbnailWidth])

  return {
    thumbnails,
    totalPages,
    renderedPages,
    loading,
    error,
  }
}
