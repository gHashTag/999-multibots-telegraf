/**
 * THE ONLY DOOR TO A URL THE MODEL CHOSE.
 *
 * ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
 *
 * Giving the agent the internet means letting a language model name a host and
 * having us open a socket to it. That is the textbook shape of SSRF, and this
 * service is a worse-than-average place to get it wrong: Postgres answers on a
 * `*.railway.internal` name, every sibling service in the Railway project is
 * one private hop away, and the cloud metadata endpoint at 169.254.169.254
 * hands out credentials to anyone who asks from inside.
 *
 * So no web tool parses a URL itself. Both of them get their target from
 * `guardTargetUrl` or `resolveFinalUrl` here, and neither ever sees a string
 * this file has not approved.
 *
 * ── WHAT WAS ALREADY HERE, AND WHAT WAS NOT ────────────────────────────────
 *
 * The address primitives are NOT new. `isPublicInternetAddress`,
 * `resolvePublicAddress`, `createPinnedAgent` already live in
 * `src/lib/remoteMediaDuration.ts`, already use ipaddr.js rather than
 * hand-rolled range regexes, and already have tests. Reusing them was the
 * whole reason this could be done in one file.
 *
 * What is NOT reused is `assertFetchable` from render-server.ts. Its
 * private-range test is gated behind `isIP(literal) !== 0`, so it inspects
 * ranges only when the host is already a bare IP -- which means it waves
 * through `postgres-nfrq.railway.internal`, and any attacker-controlled name
 * that resolves privately. It also has no redirect policy. Both tools here
 * would have inherited exactly those two holes.
 *
 * ── THE FOUR THINGS ADVERSARIAL REVIEW FOUND, AND WHERE THEY LANDED ────────
 *
 * 1. A REDIRECT LAUNDERS ANY TARGET. Checking hop 1 and then handing the URL
 *    to a third-party reader (or to `redirect: 'follow'`) means the check was
 *    theatre: a public page that 302s to 169.254.169.254 passes. So
 *    `resolveFinalUrl` walks the chain OURSELVES, re-running every rule on
 *    every hop, and only the final validated URL is handed onward. This costs
 *    one extra request per read. That is the price of the policy being real.
 *
 * 2. "PUBLICLY ROUTABLE" IS NOT "NOT OURS". Every sibling service in this
 *    Railway project also has a PUBLIC edge hostname, and our own API is a
 *    fine thing to point a fetcher at. Rule 7 therefore denies the whole
 *    `railway.app` / `fly.dev` namespace and our own domains, as code
 *    constants -- not only as env lookups.
 *
 * 3. ENV-DERIVED SELF-IDENTITY IS EMPTY IN PRODUCTION. `PUBLIC_URL` is not
 *    set on the live service; the code's effective identity comes from the
 *    hardcoded fallback inside `shelfBase()`. A denylist built only from env
 *    vars would have been an empty list on the one machine that matters. The
 *    constants are therefore listed literally, and the env names are added on
 *    top.
 *
 * 4. DISTINCT REFUSALS ARE AN ORACLE. "resolves to a forbidden network" vs
 *    "is our own service" vs "did not resolve" tells a caller what our
 *    resolver sees and what we are called internally. Every address- and
 *    name-derived denial collapses to one fixed string; the specific cause
 *    goes to the log. Shape denials (bad scheme, bad port, credentials in the
 *    URL) stay distinct, because they describe the caller's own input and
 *    reveal nothing about us.
 *
 * ── REFUSALS ARE VALUES ────────────────────────────────────────────────────
 *
 * Nothing here throws on a denied URL. A throw becomes an error the model
 * retries, or a 500; a returned `{ ok: false, reason }` becomes a sentence the
 * agent can say. The only throws are programming errors.
 */

import ipaddr from 'ipaddr.js'
import { Agent, fetch as undiciFetch } from 'undici'
import {
  createPinnedAgent,
  isPublicInternetAddress,
  resolvePublicAddress,
  type AddressLookup,
} from '../lib/remoteMediaDuration'

export type GuardRefusal = { ok: false; reason: string }
export type GuardedUrl = { ok: true; url: URL }
export type GuardResult = GuardedUrl | GuardRefusal

/**
 * ONE string for every denial that depends on an address, a name, or our own
 * configuration. See point 4 of the header: the alternative is an oracle.
 */
export const ADDRESS_REFUSED = 'адрес отклонён'

/** How many hops a redirect chain may take before we stop following it. */
export const MAX_REDIRECT_HOPS = 3

/**
 * Names denied BEFORE any lookup, so a hostile resolver never gets a vote.
 *
 * `.internal` is the load-bearing entry: Railway addresses every service in
 * the project that way, Postgres included.
 */
const DENIED_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.home.arpa',
  '.onion',
]
const DENIED_NAMES = [
  'localhost',
  'metadata',
  'metadata.google.internal',
  'instance-data',
]

/**
 * Our own infrastructure, as CODE rather than as env lookups -- see point 3.
 *
 * The two Railway suffixes deny the project's public edge wholesale. That also
 * denies reading somebody else's legitimate page hosted on railway.app, which
 * is a trade worth making: a reader that cannot open one blog is a smaller
 * problem than a reader that can be aimed at a sibling service.
 */
const OWN_SUFFIXES = [
  '.railway.app',
  '.up.railway.app',
  '.railway.internal',
  // dead-domain-ok: this is a denylist, not a destination. The dead fly.dev
  // deployment has to stay listed exactly because it is ours -- removing it
  // would let the agent be aimed at whatever answers there next.
  '.fly.dev',
  '.t27.ai',
]
const OWN_NAMES = [
  'vibee-render-production.up.railway.app',
  'app.t27.ai',
  't27.ai',
]

/**
 * Every env var in this app whose value is a URL of something WE run. Read at
 * call time, not at module load, because tests set them per case.
 */
const OWN_URL_ENV = [
  'PUBLIC_URL',
  'PLAYER_URL',
  'SELF_URL',
  'MCP_URL',
  'AUTOPILOT_SELF_URL',
  'TELEGRAM_BRIDGE_URL',
  'QUEEN_BASE_URL',
  'RAILWAY_SERVICE_QUEEN_OLLAMA_URL',
  'OLLAMA_BASE_URL',
  'VISION_BASE_URL',
  'WHISPER_BASE_URL',
  'ZEP_API_URL',
  'SUPABASE_URL',
  'DATABASE_URL',
]

/** Strip the brackets an IPv6 literal wears inside a URL. */
function bare(hostname: string): string {
  return hostname.startsWith('[') && hostname.endsWith(']')
    ? hostname.slice(1, -1)
    : hostname
}

/** Lowercase, unbracket, and drop the one trailing dot `example.com.` may carry. */
export function normalizeHost(hostname: string): string {
  const lowered = String(hostname ?? '')
    .trim()
    .toLowerCase()
  const unbracketed = bare(lowered)
  return unbracketed.endsWith('.') && unbracketed.length > 1
    ? unbracketed.slice(0, -1)
    : unbracketed
}

/** Hostnames of services we run, from the constants above plus the env. */
export function ownHostnames(): Set<string> {
  const set = new Set<string>(OWN_NAMES)
  for (const name of OWN_URL_ENV) {
    const raw = (process.env[name] || '').trim()
    if (!raw) continue
    try {
      // postgres:// and friends parse fine; we only want the host.
      const host = normalizeHost(new URL(raw).hostname)
      if (host) set.add(host)
    } catch {
      /* Not a URL. Nothing to deny, and not our problem to report. */
    }
  }
  return set
}

function isOwnHost(host: string): boolean {
  if (ownHostnames().has(host)) return true
  return OWN_SUFFIXES.some(suffix => host.endsWith(suffix))
}

function isDeniedName(host: string): boolean {
  if (DENIED_NAMES.includes(host)) return true
  return DENIED_SUFFIXES.some(suffix => host.endsWith(suffix))
}

/**
 * Everything that can be decided WITHOUT a lookup.
 *
 * Used on its own for lists of links we return but do not fetch — a search
 * result page. Eight DNS lookups for eight URLs nobody will open would be
 * waste, but the shape and the IP-literal checks are free, and skipping them
 * was a real hole: without the literal check the tool happily hands the model
 * `http://169.254.169.254/latest/meta-data/` as a search result, and 46
 * sibling tools take a URL argument with no guard of their own.
 */
export function checkUrlShape(raw: unknown): GuardResult {
  const text = String(raw ?? '').trim()
  if (!text) return { ok: false, reason: 'адрес пустой' }

  let url: URL
  try {
    url = new URL(text)
  } catch {
    return { ok: false, reason: 'это не похоже на адрес страницы' }
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { ok: false, reason: 'открываю только http и https' }
  }
  if (url.username || url.password) {
    // `http://vibee-render.railway.internal@example.com/` is a name-parsing
    // trap, and credentials in a URL have no honest use here.
    return { ok: false, reason: 'в адресе есть логин или пароль' }
  }
  if (url.port && url.port !== '80' && url.port !== '443') {
    // Stricter than the internet, on purpose: 5432, 6379, 11434 and 8080 are
    // what an internal service answers on.
    return { ok: false, reason: 'открываю только обычные порты 80 и 443' }
  }

  const host = normalizeHost(url.hostname)
  if (!host) return { ok: false, reason: 'в адресе нет имени хоста' }
  if (isDeniedName(host)) return { ok: false, reason: ADDRESS_REFUSED }
  if (isOwnHost(host)) return { ok: false, reason: ADDRESS_REFUSED }

  // An IP literal is decided here and never reaches DNS.
  if (ipaddr.isValid(bare(host)) && !isPublicInternetAddress(host)) {
    return { ok: false, reason: ADDRESS_REFUSED }
  }

  return { ok: true, url }
}

/**
 * The full check: shape, then DNS, with every A and AAAA answer validated.
 *
 * A name with one public and one 10.x record is refused outright rather than
 * partly accepted — that is `resolvePublicAddress`'s existing behaviour and it
 * is the right one.
 */
export async function guardTargetUrl(
  raw: unknown,
  opts: { lookupImpl?: AddressLookup } = {}
): Promise<GuardResult> {
  const shape = checkUrlShape(raw)
  if (!shape.ok) return shape
  try {
    await resolvePublicAddress(shape.url.hostname, opts.lookupImpl)
  } catch (error) {
    console.warn(
      '[web] target refused:',
      shape.url.hostname,
      String((error as Error)?.message || error)
    )
    return { ok: false, reason: ADDRESS_REFUSED }
  }
  return shape
}

/**
 * Walk the redirect chain ourselves and return the FINAL validated URL.
 *
 * This is the fix for the hole that mattered most. `redirect: 'follow'` hands
 * the chain to undici, which re-resolves each hop outside this file; handing a
 * first-hop-validated URL to r.jina.ai hands the chain to a third party. Both
 * mean a public page can 302 an internal target into our socket — or into
 * theirs, with us as the proxy.
 *
 * Every hop goes through `guardTargetUrl` from the top, with a FRESH pinned
 * agent, so the address we connect to is the address we validated.
 */
export async function resolveFinalUrl(
  raw: unknown,
  opts: {
    lookupImpl?: AddressLookup
    fetchImpl?: typeof fetch
    timeoutMs?: number
  } = {}
): Promise<GuardResult> {
  let current = await guardTargetUrl(raw, opts)
  if (!current.ok) return current

  const deadline = AbortSignal.timeout(opts.timeoutMs ?? 15_000)

  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    let agent: Agent | undefined
    let response: Response
    try {
      if (opts.fetchImpl) {
        response = await opts.fetchImpl(current.url, {
          redirect: 'manual',
          signal: deadline,
        })
      } else {
        const resolved = await resolvePublicAddress(
          current.url.hostname,
          opts.lookupImpl
        )
        agent = createPinnedAgent(resolved)
        response = (await undiciFetch(current.url, {
          dispatcher: agent,
          redirect: 'manual',
          signal: deadline,
        })) as unknown as Response
      }
    } catch (error) {
      console.warn(
        '[web] could not reach',
        current.url.hostname,
        String((error as Error)?.message || error)
      )
      return { ok: false, reason: 'страница не ответила' }
    } finally {
      // The body is never read here: this pass exists only to learn where the
      // chain ends. Closing the agent cancels it.
      await agent?.close().catch(() => undefined)
    }

    const status = response.status
    if (status < 300 || status > 399) {
      await response.body?.cancel().catch(() => undefined)
      return current
    }

    const location = response.headers.get('location')
    await response.body?.cancel().catch(() => undefined)
    if (!location)
      return { ok: false, reason: 'страница ответила пустым переездом' }
    if (hop >= MAX_REDIRECT_HOPS) {
      return { ok: false, reason: 'слишком много переадресаций' }
    }

    let next: string
    try {
      next = new URL(location, current.url).href
    } catch {
      return { ok: false, reason: ADDRESS_REFUSED }
    }
    const checked = await guardTargetUrl(next, opts)
    if (!checked.ok) return checked
    current = checked
  }

  return { ok: false, reason: 'слишком много переадресаций' }
}

/**
 * Read a response body as text, stopping HARD at a byte cap.
 *
 * Both halves are needed. `content-length` is a hint an attacker writes, so it
 * is only a cheap pre-check; the in-loop count is what actually bounds a
 * chunked endless body. Without the second, a page that never ends is an
 * out-of-memory crash of the whole render service.
 */
export async function readBoundedText(
  response: Response,
  maxBytes: number
): Promise<string> {
  const declared = Number(response.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) {
    await response.body?.cancel().catch(() => undefined)
    return ''
  }
  if (!response.body) return ''

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      chunks.push(value)
      if (total >= maxBytes) break
    }
  } finally {
    await reader.cancel().catch(() => undefined)
  }

  return Buffer.concat(chunks.map(c => Buffer.from(c)))
    .subarray(0, maxBytes)
    .toString('utf8')
}
