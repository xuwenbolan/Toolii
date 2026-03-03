import { useCallback, useState } from 'react'

import { shareOrDownloadBlob } from '@/lib/shareDownload'

type ShareDimension = {
  label: string
  percentile: number
}

type ShareCardData = {
  title: string
  subtitle: string
  overallScore: number
  geneDescription: string
  tags: string[]
  dimensions: ShareDimension[]
  imageUrl?: string | null
  fileName?: string
  scoreLabel?: string
  insightLabel?: string
  watermark?: string
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  const lines: string[] = []
  let current = ''

  for (const ch of text) {
    const next = current + ch
    if (ctx.measureText(next).width <= maxWidth) {
      current = next
      continue
    }
    if (current) lines.push(current)
    current = ch
  }

  if (current) lines.push(current)
  return lines
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2)
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.lineTo(x + width - r, y)
  ctx.arcTo(x + width, y, x + width, y + r, r)
  ctx.lineTo(x + width, y + height - r)
  ctx.arcTo(x + width, y + height, x + width - r, y + height, r)
  ctx.lineTo(x + r, y + height)
  ctx.arcTo(x, y + height, x, y + height - r, r)
  ctx.lineTo(x, y + r)
  ctx.arcTo(x, y, x + r, y, r)
  ctx.closePath()
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('image-load-failed'))
    img.src = url
  })
}

function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('share-card-blob-failed'))
        return
      }
      resolve(blob)
    }, 'image/png')
  })
}

export function useShareCard() {
  const [pending, setPending] = useState(false)

  const generate = useCallback(async (data: ShareCardData): Promise<Blob> => {
    setPending(true)
    try {
      const width = 1080
      const height = 1620
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      const ctx = canvas.getContext('2d')
      if (!ctx) throw new Error('canvas-context-unavailable')

      const bg = ctx.createLinearGradient(0, 0, width, height)
      bg.addColorStop(0, '#fffdf8')
      bg.addColorStop(0.55, '#f7f3ea')
      bg.addColorStop(1, '#eee8dc')
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, width, height)

      ctx.fillStyle = 'rgba(180, 155, 110, 0.14)'
      ctx.beginPath()
      ctx.arc(width * 0.82, 180, 220, 0, Math.PI * 2)
      ctx.fill()

      ctx.fillStyle = 'rgba(106, 146, 171, 0.12)'
      ctx.beginPath()
      ctx.arc(120, height - 120, 180, 0, Math.PI * 2)
      ctx.fill()

      const cardX = 72
      const cardW = width - cardX * 2
      const imageH = 560

      drawRoundedRect(ctx, cardX, 72, cardW, imageH, 28)
      ctx.save()
      ctx.clip()
      ctx.fillStyle = '#f4efe5'
      ctx.fillRect(cardX, 72, cardW, imageH)
      if (data.imageUrl) {
        try {
          const img = await loadImage(data.imageUrl)
          const scale = Math.max(cardW / img.width, imageH / img.height)
          const drawW = img.width * scale
          const drawH = img.height * scale
          const dx = cardX + (cardW - drawW) / 2
          const dy = 72 + (imageH - drawH) / 2
          ctx.drawImage(img, dx, dy, drawW, drawH)
        } catch {
          // Keep fallback background if image fails to load.
        }
      }
      ctx.restore()

      ctx.fillStyle = '#1f2937'
      ctx.font = '700 56px "Source Sans 3", sans-serif'
      ctx.fillText(data.title, cardX, 710)

      ctx.fillStyle = '#4b5563'
      ctx.font = '500 30px "Source Sans 3", sans-serif'
      ctx.fillText(data.subtitle, cardX, 758)

      drawRoundedRect(ctx, cardX, 798, 260, 174, 20)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.84)'
      ctx.fill()
      ctx.fillStyle = '#6b7280'
      ctx.font = '600 24px "Source Sans 3", sans-serif'
      ctx.fillText(data.scoreLabel ?? 'Score', cardX + 28, 856)
      ctx.fillStyle = '#111827'
      ctx.font = '700 84px "Source Sans 3", sans-serif'
      ctx.fillText(String(data.overallScore), cardX + 26, 940)

      const dimX = cardX + 286
      const dimW = cardW - 286
      drawRoundedRect(ctx, dimX, 798, dimW, 174, 20)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
      ctx.fill()

      const dims = data.dimensions.slice(0, 4)
      ctx.font = '600 22px "Source Sans 3", sans-serif'
      dims.forEach((d, idx) => {
        const row = idx % 2
        const col = Math.floor(idx / 2)
        const x = dimX + 26 + col * ((dimW - 52) / 2)
        const y = 852 + row * 62
        ctx.fillStyle = '#4b5563'
        ctx.fillText(d.label, x, y)
        ctx.fillStyle = '#0f766e'
        ctx.font = '700 28px "Source Sans 3", sans-serif'
        ctx.fillText(`${d.percentile}%`, x, y + 34)
        ctx.font = '600 22px "Source Sans 3", sans-serif'
      })

      drawRoundedRect(ctx, cardX, 1002, cardW, 300, 20)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.72)'
      ctx.fill()
      ctx.fillStyle = '#111827'
      ctx.font = '700 30px "Source Sans 3", sans-serif'
      ctx.fillText(data.insightLabel ?? 'FaceMap Insight', cardX + 24, 1050)

      ctx.font = '500 26px "Source Sans 3", sans-serif'
      ctx.fillStyle = '#374151'
      const wrapped = wrapText(ctx, data.geneDescription, cardW - 48).slice(0, 6)
      wrapped.forEach((line, i) => {
        ctx.fillText(line, cardX + 24, 1098 + i * 40)
      })

      if (data.tags.length > 0) {
        ctx.fillStyle = '#0f766e'
        ctx.font = '600 22px "Source Sans 3", sans-serif'
        const tagText = data.tags.slice(0, 4).join(' · ')
        ctx.fillText(tagText, cardX + 24, 1282)
      }

      ctx.fillStyle = '#6b7280'
      ctx.font = '500 22px "Source Sans 3", sans-serif'
      ctx.fillText(data.watermark ?? 'Generated by Toolii FaceMap', cardX, height - 48)

      return canvasToBlob(canvas)
    } finally {
      setPending(false)
    }
  }, [])

  const shareOrDownload = useCallback(
    (blob: Blob, fileName?: string) =>
      shareOrDownloadBlob(blob, fileName || `facemap-${Date.now()}.png`),
    [],
  )

  return {
    pending,
    generate,
    shareOrDownload,
  }
}

export type { ShareCardData }
