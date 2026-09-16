import { logger } from '@/utils/logger'
import { resolveAdminChatId } from '@/helpers/adminChatId'

/**
 * WHAT KIND OF FAILURE THIS IS -- BECAUSE THE TWO NEED DIFFERENT ANSWERS.
 *
 *   'transient'  a second look can give a different answer: a timeout, a 429,
 *                a 5xx from an edge node, a dropped connection. One sample is
 *                not evidence of an outage.
 *   'standing'   nothing a retry can change: a key that is not set, a rejected
 *                credential, an exhausted balance, a 404 that says the endpoint
 *                moved. Somebody has to do something, and a second probe only
 *                delays telling them.
 *
 * Only meaningful when `available` is false. Absent means unclassified, and
 * unclassified is treated as 'standing' everywhere it is read -- a failure
 * nobody labelled must be loud, never quietly debounced.
 */
export type ProviderFault = 'transient' | 'standing'

interface ProviderStatus {
  name: string
  available: boolean
  reason?: string
  fault?: ProviderFault
  lastCheck: number
}

/**
 * 429 and 5xx are what a working provider says while something momentary is
 * happening to it -- our own probe got rate-limited, an edge node failed, a
 * rolling deploy is halfway through. Everything else in the 4xx range means the
 * account or the endpoint changed: 401/403 a rejected credential, 404 a moved
 * endpoint, 402 a billing stop. Those are ours to fix and must not wait.
 */
function httpFault(status: number): ProviderFault {
  return status === 429 || status >= 500 ? 'transient' : 'standing'
}

const providerStatuses: Record<string, ProviderStatus> = {}
const CHECK_INTERVAL_MS = 5 * 60 * 1000 // 5 minutes

/**
 * HOW MANY FAILED PROBES IN A ROW BEFORE THE OWNER IS WOKEN.
 *
 * One probe is one sample. A 10s timeout or a single 502 from a provider's edge
 * was a DOWN verdict here, and since #2235/#2236 a DOWN verdict is a push
 * notification -- two of them, in fact, because `notifyAdmin` sends its own
 * message past winston entirely. The provider is back on the next poll and
 * there was never anything to do; the cost is that a real outage now arrives in
 * a channel the owner has been trained to ignore.
 *
 * Two consecutive failures means the condition survived a full poll interval.
 * Set HEALTH_FAILURE_THRESHOLD=1 to get the old page-on-first-sample back.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. The counter lives in this process, so it
 * is reset by a restart, and in a container that restarts more often than
 * threshold x interval it would never arrive -- a genuine outage paging nobody.
 * That is why it gates ONLY transient failures: a standing fault (no key, bad
 * key, no balance) still pages on the very first probe of a fresh process, so a
 * deploy into a broken environment is never silent. Suppressing THAT repeat
 * needs durable state, and durable state can be down in the same outage it is
 * meant to report on, so it is not attempted here.
 */
const failureThreshold = (): number =>
  Math.max(1, Number(process.env.HEALTH_FAILURE_THRESHOLD) || 2)

/**
 * THE OUTAGE A STREAK CANNOT SEE: A PROVIDER THAT FAILS HALF THE TIME.
 *
 * A consecutive counter asks "is it down twice in a row", and the most
 * expensive failure mode there is answers no. Replicate refusing every other
 * poll is half of every customer's generation failing, and it never reaches two
 * in a row: each good probe zeroed the streak, each bad one wrote
 * '(unconfirmed)' at warn, and BOTH paging surfaces -- the winston error and
 * the separate notifyAdmin send -- stayed unreachable for that provider for as
 * long as it lasted. Paging on every down transition, which is what this file
 * did before the debounce, did reach the owner for exactly this pattern. So the
 * cure for the flood had opened a hole for the real thing.
 *
 * The streak is therefore no longer the only road: `flapFailures` of the last
 * `flapWindow` probes failing is an outage too, consecutive or not. Both are
 * derived from the one knob ops already have rather than adding two more to get
 * wrong, and they are sized so this rule can never fire BEFORE the streak rule
 * -- it always demands strictly more failed probes:
 *
 *   threshold 2 (default)  3 of the last 6 -> a half-broken provider pages on
 *                          its fifth poll, 25 minutes in
 *   threshold 1            never consulted; the first failed probe pages
 *
 * WHY A SLIDING WINDOW AND NOT A RUNNING TOTAL. A counter that only ever grows
 * pages for ANY failure rate above zero, given enough days -- a provider with
 * one blip a week would eventually wake somebody at 3am for the sixth of them.
 * Evidence has to age out, so only probes still inside the window may vote.
 *
 * WHAT THIS DELIBERATELY DOES NOT CATCH. One failure in three is below half the
 * window and stays a warn line. Catching that would mean paging for two
 * unrelated blips half an hour apart, which is the noise this branch exists to
 * end; a provider that bad is in the log, and a rate belongs in the log.
 */
const flapWindow = (threshold: number): number => 2 * threshold + 2
const flapFailures = (threshold: number): number => threshold + 1

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

/**
 * WHAT THE PAGER REMEMBERS, WHICH IS NOT THE SAME AS WHAT THE PROBE SAW.
 *
 *   failures   consecutive failed probes, this one included; zero when up
 *   announced  the owner has been told about THIS outage
 *   recent     how the last `flapWindow` probes went, oldest first, true =
 *              failed -- the evidence for the flap rule, and it is SPENT: a
 *              page empties it, so the next page has to be earned from probes
 *              taken after it. Without that, a flapping provider would page,
 *              recover, and page again on every second poll -- the same flood
 *              from the other end.
 *
 * `announced` is the whole reason this exists. The recovery notice used to be
 * gated on the previous probe's raw `available`, so the moment a single failed
 * probe stopped paging, the next healthy poll still sent "🟢 recovered" -- a
 * cheerful all-clear for an incident nobody was ever told about, which is the
 * debounce leaking straight back out of the other end. Recovery is now news
 * only if the outage was news.
 */
export interface OutageMemory {
  failures: number
  announced: boolean
  recent: boolean[]
}

/** 'wait' is new: down, but not on enough evidence to wake anybody yet. */
export type AlertAction = HealthAction | 'wait'

/**
 * THE WHOLE PAGING DECISION, IN ONE PURE STEP.
 *
 * Pure because the four interesting branches can only be reached through a real
 * outage otherwise, and an outage cannot be summoned on demand -- the same
 * reason `healthAction` is pure. It takes the memory from the last poll and the
 * status from this one, and returns what to do, the memory to keep, and the
 * window count the decision rested on -- that last one so the log line can say
 * WHICH rule fired rather than printing a streak of 1 next to the word DOWN.
 *
 * `available` is NOT debounced, only the paging is. A provider that failed its
 * probe is reported unavailable to `isProviderAvailable` the instant
 * checkAllProviders resolves, so customer routing (generateNeuroPhotoHybrid)
 * and /api/providers keep telling the truth while the pager waits for a second
 * opinion. Delaying `available` would keep sending users to a dead provider.
 */
export function nextOutageState(
  prev: OutageMemory | undefined,
  now: { available: boolean; fault?: ProviderFault },
  threshold: number
): { action: AlertAction; memory: OutageMemory; recentFailures: number } {
  const failures = now.available ? 0 : (prev?.failures ?? 0) + 1
  const wasAnnounced = prev?.announced ?? false
  const recent = [...(prev?.recent ?? []), !now.available].slice(
    -flapWindow(threshold)
  )
  const recentFailures = recent.filter(Boolean).length

  // The transition rule is unchanged; what it is asked about is the pager's
  // view of the provider (announced or not), not the last raw sample.
  const verdict = healthAction(
    prev ? { available: !wasAnnounced } : undefined,
    now
  )

  // Two ways to have earned a page, and a transient failure needs neither
  // until it has one: the streak (down and staying down) or the window (down
  // often enough that the gaps are not a recovery, they are the other half of
  // the same outage).
  let action: AlertAction = verdict
  if (
    verdict === 'page' &&
    now.fault === 'transient' &&
    failures < threshold &&
    recentFailures < flapFailures(threshold)
  ) {
    action = 'wait'
  }

  return {
    action,
    recentFailures,
    memory: {
      failures,
      announced:
        action === 'page' ? true : now.available ? false : wasAnnounced,
      recent: action === 'page' ? [] : recent,
    },
  }
}

const outages: Record<string, OutageMemory> = {}

/**
 * THIS FUNCTION HAD NOT DELIVERED A MESSAGE IN MONTHS, AND SAID NOTHING.
 *
 * Two defects, and each one hid the other.
 *
 * The address: production sets `ADMIN_CHAT_ID=neuro_blogger_pulse`, and a bare
 * username is not a chat id. Telegram answers `400 Bad Request: chat not found`
 * -- measured against the live API on 2026-09-15, and `@neuro_blogger_pulse`
 * resolves to the supergroup fine.
 *
 * The silence: `fetch` does not throw on a 400. It resolves, `resp.ok` was
 * never read, and so the `catch` written to report exactly this failure could
 * never run. A send that never arrives and never complains is the worst of both
 * -- the designed alert channel was dead and the evidence of its death was
 * discarded by the same line that should have raised it.
 *
 * Silence is not zero. A refused send now says so, once, with the answer
 * Telegram actually gave.
 */
async function notifyAdmin(message: string) {
  const chatId = resolveAdminChatId()
  const token = process.env.BOT_TOKEN_1
  if (!chatId || !token) return

  try {
    const resp = await fetch(
      `https://api.telegram.org/bot${token}/sendMessage`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: message,
          parse_mode: 'HTML',
        }),
        signal: AbortSignal.timeout(probeTimeoutMs()),
      }
    )
    if (!resp.ok) {
      logger.error('Provider alert was refused by Telegram', {
        chatId,
        status: resp.status,
        description: await resp.text().catch(() => ''),
        hint: 'ADMIN_CHAT_ID must be a numeric id or an @username the bot can post to',
      })
    }
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
      fault: 'standing',
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
        fault: 'standing',
        lastCheck: Date.now(),
      }
    }
    // NOT a place to start reading resp.ok. This probe POSTs an empty body to a
    // real job-queue endpoint, which a healthy fal.ai rejects with a 4xx; the
    // body text is the only signal here, and mapping the status would declare
    // fal.ai down on every single poll -- and refuse customers with it.
    return { name: 'fal.ai', available: true, lastCheck: Date.now() }
  } catch {
    return {
      name: 'fal.ai',
      available: false,
      reason: 'API unreachable',
      fault: 'transient',
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
      fault: 'standing',
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
        fault: 'standing',
        lastCheck: Date.now(),
      }
    // `available: resp.ok` carried no reason, so the owner's message read
    // "🔴 replicate — undefined" and there was no way to tell a 429 from a 503
    // from a 404. A page that does not say what happened cannot be acted on.
    if (!resp.ok)
      return {
        name: 'replicate',
        available: false,
        reason: `HTTP ${resp.status}`,
        fault: httpFault(resp.status),
        lastCheck: Date.now(),
      }
    return { name: 'replicate', available: true, lastCheck: Date.now() }
  } catch {
    return {
      name: 'replicate',
      available: false,
      reason: 'API unreachable',
      fault: 'transient',
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
      fault: 'standing',
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
    // 401 and 429 were named here on purpose and both still report DOWN; what
    // changed is that they no longer report it the same way. A rejected key is
    // standing and pages at once. A 429 is transient for one sample -- it is
    // our own probe being rate-limited -- but a SUSTAINED 429 from Z.AI is an
    // exhausted Coding Plan key, which is genuinely actionable, so it pages as
    // soon as the streak reaches the threshold. Every other non-2xx now carries
    // its status instead of `available: resp.ok` with no reason at all.
    if (!resp.ok) {
      return {
        name: 'zai',
        available: false,
        reason: `HTTP ${resp.status}`,
        fault: httpFault(resp.status),
        lastCheck: Date.now(),
      }
    }
    return { name: 'zai', available: true, lastCheck: Date.now() }
  } catch {
    return {
      name: 'zai',
      available: false,
      reason: 'API unreachable',
      fault: 'transient',
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
      fault: 'standing',
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
        fault: httpFault(resp.status),
        lastCheck: Date.now(),
      }
    const data = await resp.json()
    const charsLeft = (data.character_limit || 0) - (data.character_count || 0)
    if (charsLeft < 1000) {
      return {
        name: 'elevenlabs',
        available: false,
        reason: `Only ${charsLeft} chars left`,
        fault: 'standing',
        lastCheck: Date.now(),
      }
    }
    return { name: 'elevenlabs', available: true, lastCheck: Date.now() }
  } catch {
    return {
      name: 'elevenlabs',
      available: false,
      reason: 'API unreachable',
      fault: 'transient',
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
          // A probe that threw outside its own try/catch is our machinery
          // misbehaving, not the provider. Nothing to wait for.
          fault: 'standing' as const,
          lastCheck: Date.now(),
        }
  )
  const alerts: string[] = []
  const threshold = failureThreshold()

  for (const status of results) {
    providerStatuses[status.name] = status

    /*
     * THE LEVEL IS A ROUTING DECISION NOW, NOT A MOOD.
     *
     * The DOWN line ran on EVERY poll -- 288 times a day for a provider that
     * has been down for weeks -- and that was harmless while `error` only
     * reached a log file. It stopped being harmless the moment the owner's
     * alert channel was switched on (#2235/#2236): winston forwards every
     * `error` to their private chat, so a console line for whoever reads logs
     * became a push notification every five minutes. That flood was fixed by
     * paging on the transition only.
     *
     * The transition itself was still one sample wide. A single 10s timeout or
     * one 502 from an edge node was a transition, so a blip that had cleared
     * before the owner could open a laptop cost three messages: the winston
     * page, the `alerts` entry below (a second, unthrottled Telegram send via
     * notifyAdmin), and then "🟢 recovered" on the next poll. A transient fault
     * now has to survive `threshold` consecutive probes before anyone is woken,
     * and recovery is announced only for an outage that was announced.
     *
     * Nothing is lost from the log: an unconfirmed failure is recorded at
     * `warn` with its streak, still-down is recorded at `warn` with the same
     * reason. Only the paging waits.
     */
    const { action, memory, recentFailures } = nextOutageState(
      outages[status.name],
      status,
      threshold
    )
    outages[status.name] = memory

    // A missing key is not an outage and must not read like one. It cannot
    // clear on its own and it names its own remedy.
    const down =
      status.fault === 'transient'
        ? `🚨 Provider ${status.name} is DOWN`
        : `🚨 Provider ${status.name} needs an operator`

    if (action === 'page') {
      // `failedProbes` alone reads as 1 when a flap is what woke the owner, and
      // a page that understates its own evidence is a page nobody acts on. Both
      // counts, always, so the message says which rule fired.
      logger.error(down, {
        reason: status.reason,
        failedProbes: memory.failures,
        recentFailures,
        ofLastProbes: flapWindow(threshold),
      })
      alerts.push(
        `${status.fault === 'transient' ? '🔴' : '⚙️'} <b>${status.name}</b> — ${status.reason}`
      )
    } else if (action === 'wait') {
      logger.warn(`${down} (unconfirmed)`, {
        reason: status.reason,
        failedProbes: memory.failures,
        recentFailures,
        pagesAfter: threshold,
        orRecentFailures: flapFailures(threshold),
      })
    } else if (action === 'still') {
      logger.warn(`${down} (still)`, {
        reason: status.reason,
        failedProbes: memory.failures,
      })
    } else if (action === 'recovered') {
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
  // The threshold is printed for the same reason the parked list is: how long
  // a provider may be failing before anybody hears about it is a state that
  // should be visible, not one somebody has to go and read the code for.
  logger.info('🔍 Starting provider health monitor', {
    intervalMs,
    pagesAfterFailedProbes: failureThreshold(),
    orAfterRecentFailures: flapFailures(failureThreshold()),
    ofLastProbes: flapWindow(failureThreshold()),
  })
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
