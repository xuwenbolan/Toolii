import i18n from '@/config/i18n'

export function getApiErrorCode(error: unknown): string | undefined {
  const maybe = error as { response?: { data?: { code?: string } } }
  return maybe?.response?.data?.code
}

export function getApiErrorMessage(error: unknown): string | undefined {
  const maybe = error as { response?: { data?: { message?: string } } }
  return maybe?.response?.data?.message
}

/**
 * Translate an API response code to a localized message.
 * Falls back to the original message if no translation is found.
 */
export function translateApiCode(code: string | undefined, fallback: string): string {
  if (!code) return fallback
  const key = `apiErrors.${code}`
  const translated = i18n.t(key, { ns: 'common' })
  return translated === key ? fallback : translated
}

/**
 * Translate a success message code to a localized message.
 * Falls back to the original message if no translation is found.
 */
export function translateApiMessage(code: string | undefined, fallback: string): string {
  if (!code) return fallback
  const key = `apiMessages.${code}`
  const translated = i18n.t(key, { ns: 'common' })
  return translated === key ? fallback : translated
}

/**
 * Extract error code from an API error and return the translated message.
 */
export function getTranslatedApiError(error: unknown, fallback: string): string {
  const code = getApiErrorCode(error)
  const message = getApiErrorMessage(error) ?? fallback
  return translateApiCode(code, message)
}
