import { API_BASE } from '@/config'
import { apiFetch, type ApiError } from '@/lib/apiFetch'

export interface HiveContribution {
  xp: number
  accepted: number
  specs: number
  finished: number
  hours: number
}

export interface HiveKey {
  id: number
  provider: 'nvidia' | 'zai'
  label: string
  fingerprint: string
  model: string
  enabled: boolean
  source: 'managed' | 'environment'
  createdAt: string | null
  lastProbe: {
    status: 'ok' | 'invalid' | 'rate_limited' | 'unavailable' | 'not_checked'
    checkedAt: string | null
    latencyMs: number | null
  }
  contribution: HiveContribution
}

export interface HiveKeyAccount {
  keys: HiveKey[]
  providers: { id: HiveKey['provider']; label: string; model: string }[]
  contribution: HiveContribution
  attribution: { subject: string; github?: string }
  scoring: { acceptedXp: number; specXp: number; hourXp: number }
}

export function loadHiveKeys(signal: AbortSignal): Promise<HiveKeyAccount> {
  return apiFetch(`${API_BASE}/api/hive/keys`, {
    signal,
    cache: 'no-store',
    credentials: 'omit',
  })
}

export function addHiveKey(
  input: { provider: HiveKey['provider']; apiKey: string; label: string },
  signal: AbortSignal
): Promise<{ key: HiveKey }> {
  return apiFetch(`${API_BASE}/api/hive/keys`, {
    method: 'POST',
    credentials: 'omit',
    body: JSON.stringify(input),
    signal,
  })
}

export function changeHiveKey(
  id: number,
  action: 'probe' | 'enable' | 'disable',
  signal: AbortSignal
): Promise<{ key: HiveKey }> {
  return apiFetch(
    `${API_BASE}/api/hive/keys/${encodeURIComponent(String(id))}/${action}`,
    {
      method: 'POST',
      credentials: 'omit',
      body: '{}',
      signal,
    }
  )
}

/** Never render a provider response, request body, or secret echoed by an upstream. */
export function hiveKeyError(error: unknown): string {
  const failure = error as Partial<ApiError> | null
  if (failure?.status === 401) return 'hiveAccount.error.signin'
  if (failure?.status === 403) return 'hiveAccount.error.attribution'
  if (failure?.status === 409) return 'hiveAccount.error.duplicate'
  if (failure?.status === 429) return 'hiveAccount.error.rate'
  if (failure?.status === 503) return 'hiveAccount.error.setup'
  if (failure?.status === 400) return 'hiveAccount.error.input'
  return 'hiveAccount.error.network'
}
