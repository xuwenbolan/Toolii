import { translateApiCode } from '@/lib/apiErrors'

export type ToolErrorKind =
  | 'file_too_large'
  | 'unsupported_format'
  | 'upload_failed'
  | 'processing_failed'
  | 'timeout'
  | 'rate_limited'
  | 'auth_required'
  | 'insufficient_credits'
  | 'invalid_input'
  | 'unknown'

export type ToolErrorMeta = {
  kind: ToolErrorKind
  message: string
  status?: number
  code?: string
  recoverable: boolean
}

type ApiErrorShape = {
  code?: string
  message?: string
}

type AxiosLikeError = {
  code?: string
  message?: string
  response?: {
    status?: number
    data?: ApiErrorShape
  }
}

function includesAny(value: string, needles: string[]) {
  const normalized = value.toLowerCase()
  return needles.some((item) => normalized.includes(item.toLowerCase()))
}

export function deriveToolErrorMeta(error: unknown, fallbackMessage: string): ToolErrorMeta {
  const next = error as AxiosLikeError
  const status = next?.response?.status
  const code = next?.response?.data?.code
  const remoteMessage = next?.response?.data?.message
  const rawMessage = remoteMessage ?? next?.message ?? fallbackMessage
  const message = translateApiCode(code, rawMessage)

  if (next?.code === 'ECONNABORTED' || status === 408 || status === 504) {
    return { kind: 'timeout', message, status, code, recoverable: true }
  }

  if (!next?.response) {
    return { kind: 'upload_failed', message, recoverable: true }
  }

  if (status === 413 || includesAny(rawMessage, ['too large', 'oversized'])) {
    return { kind: 'file_too_large', message, status, code, recoverable: true }
  }

  if (status === 429) {
    return { kind: 'rate_limited', message, status, code, recoverable: true }
  }

  if (code === 'INSUFFICIENT_CREDITS') {
    return { kind: 'insufficient_credits', message, status, code, recoverable: false }
  }

  if (code === 'EMAIL_NOT_VERIFIED' || status === 401 || status === 403) {
    return { kind: 'auth_required', message, status, code, recoverable: false }
  }

  if (code === 'NO_FACE_DETECTED') {
    return { kind: 'invalid_input', message, status, code, recoverable: true }
  }

  if (code === 'MODEL_UNAVAILABLE') {
    return { kind: 'processing_failed', message, status, code, recoverable: true }
  }

  if (
    code === 'INVALID_FILE_TYPE' ||
    code === 'INVALID_OUTPUT_FORMAT' ||
    code === 'INVALID_MODEL' ||
    code === 'INVALID_MODE'
  ) {
    return { kind: 'unsupported_format', message, status, code, recoverable: true }
  }

  if (code?.startsWith('INVALID_') || code === 'VALIDATION_ERROR') {
    return { kind: 'invalid_input', message, status, code, recoverable: true }
  }

  if (
    code === 'IMAGE_PROCESS_FAILED' ||
    code === 'PDF_PROCESS_FAILED' ||
    code?.startsWith('PHOTO_')
  ) {
    return { kind: 'processing_failed', message, status, code, recoverable: true }
  }

  return { kind: 'unknown', message, status, code, recoverable: true }
}
