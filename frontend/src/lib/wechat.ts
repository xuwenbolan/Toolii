export function isWeChat(): boolean {
  if (typeof navigator === 'undefined') return false
  return /micromessenger/i.test(navigator.userAgent)
}

