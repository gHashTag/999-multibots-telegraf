export interface GenerateAuthProofs {
  initData: string
  accessToken: string
  devAgentKey: string
}

/**
 * Select exactly one proof for every paid generation request.
 *
 * Telegram Mini App initData is the strongest proof in that runtime. Outside
 * Telegram, the browser/native app reuses the short-lived session issued by
 * the server. The development agent key is deliberately last and is supplied
 * only by a DEV build; production callers never invent an identity.
 */
export function buildGenerateAuthHeaders(
  proofs: GenerateAuthProofs
): Record<string, string> {
  if (proofs.initData) {
    return { 'X-Telegram-Init-Data': proofs.initData }
  }
  if (proofs.accessToken) {
    return { Authorization: `Bearer ${proofs.accessToken}` }
  }
  if (proofs.devAgentKey) {
    return { 'X-Agent-Key': proofs.devAgentKey }
  }
  return {}
}

/** Human-safe generation errors. Provider bodies and raw JSON stay server-side. */
export function generationErrorMessage(
  status: number,
  fallback: string
): string {
  if (status === 401) {
    return 'Войдите через Telegram или подтверждённую сессию и повторите.'
  }
  if (status === 402) return 'Недостаточно токенов для этой генерации.'
  if (status === 429) return 'Слишком много запросов. Попробуйте чуть позже.'
  if (status === 503) {
    return 'Генерация временно недоступна. Попробуйте позже.'
  }
  return fallback
}
