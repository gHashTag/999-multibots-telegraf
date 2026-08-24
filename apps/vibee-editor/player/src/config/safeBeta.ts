import type { RenderQuota } from '@vibee/atoms'

/**
 * Compile-time release lock.
 *
 * This intentionally does not read Vite/runtime environment variables. A
 * production artifact built for SAFE BETA must not acquire paid capabilities
 * because a host supplies a different env value at startup.
 */
export const SAFE_BETA_CLIENT_LOCKED = true as const

const ZERO_QUOTAS = Object.freeze({
  total: 0,
  remaining: 0,
  free: 0,
} as const)

export const SAFE_BETA_CLIENT_CAPABILITIES = Object.freeze({
  paid: false,
  generate: false,
  render: false,
  publish: false,
  charges: false,
  quotas: ZERO_QUOTAS,
} as const)

/** Local display state only. It never contains or claims an authenticated id. */
export const SAFE_BETA_RENDER_QUOTA: Readonly<RenderQuota> = Object.freeze({
  telegram_id: 0,
  total_renders: 0,
  free_remaining: 0,
  subscription: null,
})

export type SafeBetaCapability =
  | 'paid'
  | 'generate'
  | 'render'
  | 'publish'
  | 'charges'

export class SafeBetaCapabilityError extends Error {
  readonly code: string
  readonly capability: SafeBetaCapability

  constructor(capability: SafeBetaCapability) {
    super(`SAFE_BETA_${capability.toUpperCase()}_DISABLED`)
    this.name = 'SafeBetaCapabilityError'
    this.code = this.message
    this.capability = capability
  }
}

export function requireSafeBetaCapability(
  capability: SafeBetaCapability
): never {
  throw new SafeBetaCapabilityError(capability)
}

const DISABLED_ROUTE_PREFIXES = Object.freeze([
  '/generate',
  '/instagram/callback',
] as const)

export function isSafeBetaRouteEnabled(pathname: string): boolean {
  return !DISABLED_ROUTE_PREFIXES.some(
    prefix => pathname === prefix || pathname.startsWith(`${prefix}/`)
  )
}
