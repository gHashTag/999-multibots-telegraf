import { logger } from '@/utils/logger'

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

/**
 * WHAT TO DO ABOUT A PROVIDER, GIVEN WHAT IT WAS DOING BEFORE.
 *
 * Pure on purpose: inside the polling loop these four branches can only be
 * exercised by an actual outage, and an outage cannot be summoned on demand.
 *
 *   'page'      down, and it was not before -- the owner learns once
 *   'still'     down again -- the log keeps the record, nobody is woken
 *   'recovered' back up after being down
 *   'ok'        up, and it was up
 */
/**
 * A PROVIDER THE OWNER HAS PARKED IS NOT AN INCIDENT.
 *
 * ElevenLabs answers 400 to its probe and has done for weeks. The owner was
 * asked directly and answered: not needed now, maybe later. So the code that
 * calls it stays -- deleting a path somebody intends to return to is a worse
 * mistake than a noisy alarm -- but the alarm about it is not news. Today
 * proved what noise costs: a genuine regression sat behind a red gate for four
 * days because everything was red anyway.
 *
 * A LIST, NOT A DELETED CHECK. Parking is a decision that changes, and it
 * changes in the deploy rather than in a commit: set HEALTH_SKIP_PROVIDERS and
 * the probe stops; clear it and the alarm is back, unchanged. A check deleted
 * in code would have to be remembered and rewritten.
 *
 * The parked list is PRINTED at startup, so "we are not watching this" is a
 * visible state rather than a forgotten one.
 */
export function parkedProviders(
  env: NodeJS.ProcessEnv = process.env
): Set<string> {
  return new Set(
    (env.HEALTH_SKIP_PROVIDERS || '')
      .split(',')
      .map(v => v.trim().toLowerCase())
      .filter(Boolean)
  )
}

export type HealthAction = 'page' | 'still' | 'recovered' | 'ok'

export function healthAction(
  prev: { available: boolean } | undefined,
  now: { available: boolean }
): HealthAction {
  if (!now.available) return !prev || prev.available ? 'page' : 'still'
  return prev && !prev.available ? 'recovered' : 'ok'
}

async function notifyAdmin(message: string) {
  const chatId = process.env.ADMIN_CHAT_ID
  const token = process.env.BOT_TOKEN_1
  if (!chatId || !token) return

  try {
    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
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
  const parked = parkedProviders()
  const probes: Array<[string, () => Promise<ProviderStatus>]> = [
    ['fal.ai', checkFalAi],
    ['replicate', checkReplicate],
    ['zai', checkZai],
    ['elevenlabs', checkElevenLabs],
  ]
  const checks = await Promise.allSettled(
    probes.filter(([name]) => !parked.has(name)).map(([, run]) => run())
  )

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
      /*
       * THE LEVEL IS A ROUTING DECISION NOW, NOT A MOOD.
       *
       * This line ran on EVERY poll -- 288 times a day for a provider that has
       * been down for weeks -- and that was harmless while `error` only reached
       * a log file. It stopped being harmless the moment the owner's alert
       * channel was switched on (#2235/#2236): winston forwards every `error`
       * to their private chat, so a console line for whoever reads logs became
       * a push notification every five minutes.
       *
       * The alert two lines below was ALREADY right: it fires on the
       * transition only. So the fix is not to add deduplication, it is to stop
       * a second, undesigned channel from shouting past the designed one.
       *
       * Nothing is lost from the log: still down is still recorded, at `warn`,
       * with the same reason. Only the paging stops.
       */
      const line = `🚨 Provider ${status.name} is DOWN`
      if (healthAction(prev, status) === 'page') {
        logger.error(line, { reason: status.reason })
        alerts.push(`🔴 <b>${status.name}</b> — ${status.reason}`)
      } else {
        logger.warn(`${line} (still)`, { reason: status.reason })
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
  const parked = parkedProviders()
  if (parked.size)
    logger.info('[health] not watching parked providers', {
      parked: [...parked].join(', '),
      hint: 'clear HEALTH_SKIP_PROVIDERS to bring the alarm back',
    })
  monitorInterval = setInterval(checkAllProviders, intervalMs)
}

export function stopProviderMonitor() {
  if (monitorInterval) {
    clearInterval(monitorInterval)
    monitorInterval = null
  }
}
