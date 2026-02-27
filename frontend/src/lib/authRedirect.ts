export function sanitizeRedirect(raw: string | null): string {
  if (raw && raw.startsWith('/') && !raw.startsWith('//')) {
    return raw
  }
  return '/dashboard'
}
