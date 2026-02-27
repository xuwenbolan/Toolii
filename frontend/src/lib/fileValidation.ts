export function bytesToMb(bytes: number): number {
  return bytes / 1024 / 1024
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(2)} MB`
}

export function assertMaxFileSize(file: File, maxMb: number) {
  const maxBytes = maxMb * 1024 * 1024
  if (file.size > maxBytes) {
    throw new Error(`文件过大（> ${maxMb}MB）`)
  }
}

