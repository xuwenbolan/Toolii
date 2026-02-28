/**
 * Convert PDF pages to high-resolution image Blobs using pdf.js.
 * Renders each page at ~200 DPI for OCR accuracy.
 */

const OCR_SCALE = 3 // ~216 DPI (72 * 3), good balance for OCR accuracy vs size

export type PdfPageImage = {
  pageNumber: number
  blob: File
}

export type PdfProgress = {
  current: number
  total: number
}

/**
 * Render all pages of a PDF to image Files (PNG).
 * Calls `onProgress` after each page is rendered.
 */
export async function pdfToImages(
  pdfFile: File,
  onProgress?: (p: PdfProgress) => void,
): Promise<PdfPageImage[]> {
  const [pdfjsLib, workerModule] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default

  const data = new Uint8Array(await pdfFile.arrayBuffer())
  const task = pdfjsLib.getDocument({ data })
  const pdf = await task.promise

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

  const results: PdfPageImage[] = []
  const total = typed.numPages
  const stem = pdfFile.name.replace(/\.[^.]+$/, '')

  for (let pn = 1; pn <= total; pn++) {
    const page = await typed.getPage(pn)
    const viewport = page.getViewport({ scale: OCR_SCALE })

    const canvas = document.createElement('canvas')
    canvas.width = Math.ceil(viewport.width)
    canvas.height = Math.ceil(viewport.height)
    const ctx = canvas.getContext('2d', { alpha: false })
    if (!ctx) continue

    // White background (PDFs may have transparent bg)
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    await page.render({ canvas, canvasContext: ctx, viewport }).promise

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/png'),
    )
    if (!blob) continue

    // Wrap as File so the OCR API can read the filename
    const file = new File([blob], `${stem}-page${pn}.png`, { type: 'image/png' })
    results.push({ pageNumber: pn, blob: file })

    onProgress?.({ current: pn, total })
  }

  return results
}
