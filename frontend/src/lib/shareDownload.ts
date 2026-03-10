function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

/**
 * Download a blob as a file.
 * On mobile devices, prefer Web Share API (better UX for saving / sharing).
 * On desktop, always use blob + <a download> for a direct download.
 */
export async function shareOrDownloadBlob(
  blob: Blob,
  filename: string,
): Promise<'shared' | 'downloaded'> {
  if (isMobileDevice()) {
    const file = new File([blob], filename, { type: blob.type })
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file] })
      return 'shared'
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 500)
  return 'downloaded'
}

/**
 * Try to extract filename from Content-Disposition header.
 */
export function filenameFromResponse(res: Response): string | null {
  const cd = res.headers.get('content-disposition')
  if (!cd) return null

  // filename*=UTF-8''encoded or filename="quoted" or filename=bare
  const starMatch = cd.match(/filename\*=UTF-8''([^;\s]+)/i)
  if (starMatch) return decodeURIComponent(starMatch[1])

  const quotedMatch = cd.match(/filename="([^"]+)"/i)
  if (quotedMatch) return quotedMatch[1]

  const bareMatch = cd.match(/filename=([^;\s]+)/i)
  if (bareMatch) return bareMatch[1]

  return null
}
