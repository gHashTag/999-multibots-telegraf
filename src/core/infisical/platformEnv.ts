/**
 * Platform env precedence over Infisical.
 *
 * Infisical is the source of truth for *secrets*. A few variables are not
 * secrets but *topology*: they describe where THIS deployment runs and how it
 * reaches its neighbours. Those must be owned by the platform (Railway /
 * Fly.io service variables) and must NOT be overwritten by a shared Infisical
 * value, otherwise one deployment's URL leaks into every other one.
 *
 * Rule: if a key listed here is already present in `process.env` at boot,
 * the Infisical copy is ignored. If the platform did not set it, Infisical
 * still applies (so nothing regresses for keys that only live in Infisical).
 */
export const PLATFORM_ENV_PRECEDENCE: ReadonlySet<string> = new Set([
  // Must match this app's public URL (Inngest register URL).
  'INNGEST_SERVE_ORIGIN',
  // Webhook URL for Replicate callbacks — per deployment.
  'BASE_WEBHOOK_URL',
  // Where the SDK sends events / where the app reaches the Inngest server.
  // On Railway this is the PRIVATE hostname (`http://<svc>.railway.internal:8288`),
  // which is meaningless outside that project — hence platform-owned.
  'INNGEST_BASE_URL',
  // Read-only GraphQL endpoint used by /api/inngest/functions/status and MCP.
  'INNGEST_GQL_URL',
])

export interface SecretLike {
  secretKey: string
  secretValue: string
}

export interface ApplySecretsResult {
  applied: string[]
  preserved: string[]
}

/**
 * Copy Infisical secrets into `env`, honouring PLATFORM_ENV_PRECEDENCE.
 * Pure: no logging, no I/O — unit-testable.
 */
export function applySecretsToEnv(
  secrets: readonly SecretLike[],
  env: Record<string, string | undefined>,
  precedence: ReadonlySet<string> = PLATFORM_ENV_PRECEDENCE
): ApplySecretsResult {
  const applied: string[] = []
  const preserved: string[] = []
  for (const secret of secrets) {
    const key = secret.secretKey
    const existing = env[key]
    if (precedence.has(key) && existing !== undefined && existing !== '') {
      preserved.push(key)
      continue
    }
    env[key] = secret.secretValue
    applied.push(key)
  }
  return { applied, preserved }
}
