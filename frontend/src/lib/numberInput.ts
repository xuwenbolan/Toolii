export function parseFiniteNumber(raw: string): number | null {
  const value = raw.trim()
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function isIntInRange(value: number, min: number, max: number): boolean {
  return Number.isInteger(value) && value >= min && value <= max
}
