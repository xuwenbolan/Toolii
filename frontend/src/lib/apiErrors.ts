export function getApiErrorCode(error: unknown): string | undefined {
  const maybe = error as { response?: { data?: { code?: string } } }
  return maybe?.response?.data?.code
}
