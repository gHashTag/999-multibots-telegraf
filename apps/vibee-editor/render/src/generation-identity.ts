import type { AuthResult } from '../auth'

/**
 * Resolve the owner used by paid Mini App generation after the global auth
 * guard has already accepted the request.
 *
 * A server-signed session carries its owner in `telegramId`. Telegram keeps
 * the existing independently verified initData parser. Other auth modes do
 * not silently become a billable end-user identity: server API calls are
 * bypassed explicitly by the caller and agent keys have their own quota path.
 */
export function generationOwnerId(
  auth: Pick<AuthResult, 'via' | 'telegramId'>,
  verifiedInitDataId: string | null
): string | null {
  if (auth.via === 'session') return auth.telegramId || null
  if (auth.via === 'telegram') return verifiedInitDataId
  return null
}

/**
 * Only the globally verified internal API-key identity has already paid in
 * the agent tool layer. Header presence is not proof: a user request may carry
 * a bogus X-Api-Key while authenticating correctly with Telegram/session.
 */
export function mayBypassGenerationBilling(
  auth: Pick<AuthResult, 'via'>
): boolean {
  return auth.via === 'api-key'
}
