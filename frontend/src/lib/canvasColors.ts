/**
 * Read CSS custom properties for use in Canvas 2D / SVG contexts
 * where var() is not available (e.g. ctx.fillStyle, ctx.strokeStyle).
 *
 * All canvas-related color tokens are defined in index.css under :root.
 */

let _cache: Record<string, string> = {}
let _root: CSSStyleDeclaration | null = null

function root(): CSSStyleDeclaration {
  if (!_root) _root = getComputedStyle(document.documentElement)
  return _root
}

/** Resolve a CSS variable name (with or without `--` prefix) to its computed value. */
export function cssVar(name: string): string {
  const key = name.startsWith('--') ? name : `--${name}`
  if (_cache[key]) return _cache[key]
  const value = root().getPropertyValue(key).trim()
  if (value) _cache[key] = value
  return value || key
}

/** Invalidate the cache (e.g. on theme change). */
export function invalidateCanvasColorCache() {
  _cache = {}
  _root = null
}

/**
 * Build an rgba() string from a CSS variable with an optional alpha override.
 * Falls back to returning the raw variable value when no alpha is specified.
 */
export function canvasColor(varName: string, alpha?: number): string {
  const raw = cssVar(varName)
  if (alpha == null) return raw
  // oklch values already support / alpha syntax; wrap in oklch() if needed
  if (raw.startsWith('oklch(')) {
    // Strip existing alpha if present, then append new one
    const inner = raw.slice(6, -1).split('/')[0].trim()
    return `oklch(${inner} / ${alpha})`
  }
  return raw
}
