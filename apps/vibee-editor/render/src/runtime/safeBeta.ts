/**
 * SAFE BETA is a release lock, not a runtime preference.
 *
 * Removing this lock requires a reviewed code change. An environment variable
 * cannot silently enable billing, paid generation, rendering, publication or
 * another external side effect in the beta artifact.
 */
export const SAFE_BETA_LOCKED = true as const

export type SafeBetaBlockReason =
  | 'paid-generation-disabled'
  | 'render-disabled'
  | 'publishing-disabled'
  | 'charges-disabled'
  | 'external-action-disabled'
  | 'approval-path-disabled'

export interface SafeBetaHttpDecision {
  blocked: boolean
  reason?: SafeBetaBlockReason
}

const exactPostBlocks = new Map<string, SafeBetaBlockReason>([
  // Legacy S3 inventory is global rather than owner-filtered.
  ['/assets', 'external-action-disabled'],
  ['/api/feed/publish', 'publishing-disabled'],
  ['/api/tokens/invoice', 'charges-disabled'],
  ['/api/tokens/verify', 'charges-disabled'],
  ['/api/star-paid', 'charges-disabled'],
  ['/api/ai/generate-script', 'paid-generation-disabled'],
  ['/api/agent/chat', 'paid-generation-disabled'],
  ['/render', 'render-disabled'],
  ['/render/template', 'render-disabled'],
  ['/api/notify/lead', 'external-action-disabled'],
  ['/api/notify/render-start', 'external-action-disabled'],
])

const prefixPostBlocks: ReadonlyArray<readonly [string, SafeBetaBlockReason]> =
  [
    // The legacy assets API places telegram_id in the URL. Even though its
    // handler compares the signed owner, SAFE BETA accepts ownership only from
    // server-owned profile context; keep the feature unreachable until that
    // route is redesigned without a client identity parameter.
    ['/api/assets', 'external-action-disabled'],
    ['/api/generate/', 'paid-generation-disabled'],
    ['/api/feed/', 'publishing-disabled'],
    ['/api/telegram/stars-wh/', 'charges-disabled'],
    ['/api/agent/access', 'approval-path-disabled'],
    ['/api/agent/approval', 'approval-path-disabled'],
  ]

const safeBetaPostAllowlist = new Set(['/mcp', '/api/users/me'])

/**
 * Decide before request bodies are consumed and before a handler can perform
 * a database, provider, Telegram or payment side effect.
 */
export function safeBetaHttpDecision(
  method: string | undefined,
  requestTarget: string | undefined
): SafeBetaHttpDecision {
  const normalizedMethod = (method || '').toUpperCase()
  const readLike =
    normalizedMethod === 'GET' ||
    normalizedMethod === 'HEAD' ||
    normalizedMethod === 'OPTIONS'
  const pathname = new URL(requestTarget || '/', 'http://safe-beta.local')
    .pathname
  const exactReason = exactPostBlocks.get(pathname)
  if (exactReason) return { blocked: true, reason: exactReason }

  for (const [prefix, reason] of prefixPostBlocks) {
    if (pathname.startsWith(prefix) && !(prefix === '/api/feed/' && readLike)) {
      return { blocked: true, reason }
    }
  }

  // CORS negotiation and ordinary reads cannot mutate product state. Every
  // write-like request is denied unless it is one of the two reviewed,
  // owner-bound SAFE BETA entry points. This fail-closed default also covers
  // handlers introduced after this list was reviewed.
  if (readLike) return { blocked: false }

  if (normalizedMethod === 'POST' && safeBetaPostAllowlist.has(pathname)) {
    return { blocked: false }
  }

  if (pathname === '/api/feed' || pathname.startsWith('/api/feed/')) {
    return { blocked: true, reason: 'publishing-disabled' }
  }

  return { blocked: true, reason: 'external-action-disabled' }
}

export interface SafeBetaHttpResponse {
  writeHead(statusCode: number, headers: Record<string, string>): unknown
  end(body?: string): unknown
}

/**
 * Apply the immutable HTTP lock before a caller reads the request body or
 * enters a route handler. Returning true means the request is fully handled.
 */
export function enforceSafeBetaHttpLock(
  method: string | undefined,
  requestTarget: string | undefined,
  response: SafeBetaHttpResponse
): boolean {
  const decision = safeBetaHttpDecision(method, requestTarget)
  if (!decision.blocked) return false

  response.writeHead(403, { 'Content-Type': 'application/json' })
  response.end(
    JSON.stringify({
      error: 'safe_beta_action_disabled',
      reason: decision.reason,
    })
  )
  return true
}

/**
 * Defense in depth for background/resume code paths which do not traverse the
 * HTTP router. The callback is unreachable while the SAFE BETA artifact lock
 * is compiled in.
 */
export async function runSafeBetaPublishingAction<T>(
  action: () => Promise<T>
): Promise<T | undefined> {
  if (SAFE_BETA_LOCKED) return undefined
  return action()
}

export function safeBetaStatus() {
  return {
    locked: SAFE_BETA_LOCKED,
    paidGeneration: false,
    rendering: false,
    charges: false,
    publishing: false,
    externalActions: false,
    approvals: false,
  } as const
}
