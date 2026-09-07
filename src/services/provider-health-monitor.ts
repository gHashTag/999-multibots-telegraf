import { logger } from '@/utils/logger'
import { telegramApiFor } from '@/services/telegramApi'

interface ProviderStatus {
  name: string
  available: boolean
  reason?: string
  lastCheck: number
}

const providerStatuses: Record<string, ProviderStatus> = {}
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

// A health probe with no timeout defeats the monitor: a provider that accepts
// the connection but never answers — the exact unhealthy state this exists to
// catch — makes fetch hang forever, so Promise.allSettled never settles, the
// status is never updated, and isProviderAvailable then reports every provider
// available (stale lastCheck -> true). setInterval also keeps firing, so the
// hung fetches pile up. Every probe fetch gets this deadline; on timeout fetch
// rejects and the existing catch marks the provider unreachable, which is
// correct. Overridable via env for tests and ops.
const probeTimeoutMs = (): number =>
  Number(process.env.HEALTH_PROBE_TIMEOUT_MS) || 10_000

async function notifyAdmin(message: string) {
  const chatId = process.env.ADMIN_CHAT_ID
  const token = process.env.BOT_TOKEN_1
  if (!chatId || !token) return

  try {
    await fetch(`${telegramApiFor(token)}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: 'HTML',
      }),
      signal: AbortSignal.timeout(probeTimeoutMs()),
    })
  } catch (e) {
    logger.error('Failed to notify admin about provider status', { error: e })
  }
}

async function checkFalAi(): Promise<ProviderStatus> {
  const key = process.env.FAL_KEY
  if (!key)
    return {
      name: 'fal.ai',
      available: false,
      reason: 'FAL_KEY not set',
      lastCheck: Date.now(),
    }

  try {
    const resp = await fetch('https://queue.fal.run/fal-ai/flux-schnell', {
      method: 'POST',
      headers: {
        Authorization: `Key ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(probeTimeoutMs()),
    })
    const body = await resp.text()
    if (body.includes('Exhausted balance') || body.includes('locked')) {
      return {
        name: 'fal.ai',
        available: false,
        reason: 'Balance exhausted',
        lastCheck: Date.now(),
      }
    }
    return { name: 'fal.ai', available: true, lastCheck: Date.now() }
  } catch {
    return {
      name: 'fal.ai',
      available: false,
      reason: 'API unreachable',
      lastCheck: Date.now(),
    }
  }
}

async function checkReplicate(): Promise<ProviderStatus> {
  const token = process.env.REPLICATE_API_TOKEN
  if (!token)
    return {
      name: 'replicate',
      available: false,
      reason: 'Token not set',
      lastCheck: Date.now(),
    }

  try {
    const resp = await fetch('https://api.replicate.com/v1/account', {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(probeTimeoutMs()),
    })
    if (resp.status === 401)
      return {
        name: 'replicate',
        available: false,
        reason: 'Invalid token',
        lastCheck: Date.now(),
      }
    return { name: 'replicate', available: resp.ok, lastCheck: Date.now() }
  } catch {
    return {
      name: 'replicate',
      available: false,
      reason: 'API unreachable',
      lastCheck: Date.now(),
    }
  }
}

async function checkZai(): Promise<ProviderStatus> {
  const key = process.env.GLM_API_KEY
  if (!key)
    return {
      name: 'zai',
      available: false,
      reason: 'GLM_API_KEY not set',
      lastCheck: Date.now(),
    }

  try {
    // Адрес — литерал: URL, собранный из ENV, сканер считает SSRF-вектором
    // (тот же урок, что у postStarPaid). Эндпоинт Z.AI единственный и
    // публичный; переопределение окружением не предусмотрено.
    const resp = await fetch('https://api.z.ai/api/coding/paas/v4/models', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(probeTimeoutMs()),
    })
    if (resp.status === 401 || resp.status === 429) {
      return {
        name: 'zai',
        available: false,
        reason: `HTTP ${resp.status}`,
        lastCheck: Date.now(),
      }
    }
    return { name: 'zai', available: resp.ok, lastCheck: Date.now() }
  } catch {
    return {
      name: 'zai',
      available: false,
      reason: 'API unreachable',
      lastCheck: Date.now(),
    }
  }
}

async function checkElevenLabs(): Promise<ProviderStatus> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key)
    return {
      name: 'elevenlabs',
      available: false,
      reason: 'Key not set',
      lastCheck: Date.now(),
    }

  try {
    const resp = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': key },
      signal: AbortSignal.timeout(probeTimeoutMs()),
    })
    if (!resp.ok)
      return {
        name: 'elevenlabs',
        available: false,
        reason: `HTTP ${resp.status}`,
        lastCheck: Date.now(),
      }
    const data = await resp.json()
    const charsLeft = (data.character_limit || 0) - (data.character_count || 0)
    if (charsLeft < 1000) {
      return {
        name: 'elevenlabs',
        available: false,
        reason: `Only ${charsLeft} chars left`,
        lastCheck: Date.now(),
      }
    }
    return { name: 'elevenlabs', available: true, lastCheck: Date.now() }
  } catch {
    return {
      name: 'elevenlabs',
      available: false,
      reason: 'API unreachable',
      lastCheck: Date.now(),
    }
  }
}

export async function checkAllProviders(): Promise<
  Record<string, ProviderStatus>
> {
  const checks = await Promise.allSettled([
    checkFalAi(),
    checkReplicate(),
    checkZai(),
    checkElevenLabs(),
  ])

  const results = checks.map(r =>
    r.status === 'fulfilled'
      ? r.value
      : {
          name: 'unknown',
          available: false,
          reason: 'Check failed',
          lastCheck: Date.now(),
        }
  )
  const alerts: string[] = []

  for (const status of results) {
    const prev = providerStatuses[status.name]
    providerStatuses[status.name] = status

    if (!status.available) {
      logger.error(`🚨 Provider ${status.name} is DOWN`, {
        reason: status.reason,
      })
      if (!prev || prev.available) {
        alerts.push(`🔴 <b>${status.name}</b> — ${status.reason}`)
      }
    } else if (prev && !prev.available) {
      logger.info(`✅ Provider ${status.name} recovered`)
      alerts.push(`🟢 <b>${status.name}</b> — recovered`)
    }
  }

  if (alerts.length > 0) {
    await notifyAdmin(
      `⚡ <b>Provider Alert</b>\n\n${alerts.join('\n')}\n\n🕐 ${new Date().toISOString()}`
    )
  }

  return providerStatuses
}

export function isProviderAvailable(name: string): boolean {
  const status = providerStatuses[name]
  if (!status) return true
  if (Date.now() - status.lastCheck > CHECK_INTERVAL_MS) return true
  return status.available
}

export function getProviderStatus(name: string): ProviderStatus | undefined {
  return providerStatuses[name]
}

export function getAllProviderStatuses(): Record<string, ProviderStatus> {
  return { ...providerStatuses }
}

let monitorInterval: ReturnType<typeof setInterval> | null = null

export function startProviderMonitor(intervalMs = CHECK_INTERVAL_MS) {
  logger.info('🔍 Starting provider health monitor', { intervalMs })
  checkAllProviders()
  monitorInterval = setInterval(checkAllProviders, intervalMs)
}

export function stopProviderMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
}
