/**
 * THE COURSE HELPER CHAT: POST /api/course/chat on the ladder unit.
 *
 * Contract of record: the page's spec (gHashTag trinity, apps/website
 * course-chat spec, gen at trinity commit 47783b41f, PR #1815) copied beside
 * its gen-ts in src/spec/course-chat.gen.ts. Every limit, size, reason code and
 * prompt clause below is a name from that gen file, never a retyped number; a
 * test pins the file's digest so a drift fails loudly.
 *
 * Wire: request `{course, lesson, title, message, turn, key?}`; probe
 * `{course, probe: true}` -> `{"ok":true,"probe":true}` with no model call, no
 * window hit and no count of the day; answer `{"ok":true,"answer":"..."}`, or
 * `{"ok":false,"offline":true,"reason":"<name>"}` with the reason names the
 * page already understands. Gate order is the spec's gate_reason: the request,
 * the turn of the conversation, the address and key windows, then the shared
 * daily cap (reason busy, status 503).
 *
 * What this route will NOT do, on purpose:
 *   - call a paid model. The chain is an explicit whitelist of the two free
 *     z.ai flash models (owner, 2026-10-04); a paid key in the environment
 *     (Kie, a reserve) is never read here.
 *   - trust a forged X-Forwarded-For. The reader's address is the hop the
 *     reverse proxy appended (the LAST entry) and only when the socket peer is
 *     the proxy's own side (loopback or a private address); otherwise the
 *     socket peer itself.
 *   - run without a ceiling. The spec's CHAT_GLOBAL_DAY (calls per UTC day, all
 *     readers) is the default; the env var of the same name can only LOWER it,
 *     never raise it. At the cap the route answers 503 busy.
 *   - log a word a reader typed, or a key. Lines carry counts and a short key id.
 *
 * State is in memory (one ladder process); a restart forgives the windows,
 * which is the cheap side of the failure.
 */
import crypto from 'node:crypto'
import net from 'node:net'
import * as CHAT from '../spec/course-chat.gen'
import { allProviders, diagnose, isKeyFailure, type Provider } from './provider'
import { courseKeySecret, readKey } from './course-access'

export interface ChatDeps {
  readBody: (req: unknown) => Promise<string>
  /** Injectable so tests call no model. */
  fetch?: typeof fetch
  now?: () => Date
  /** One line per call: counts and a key id, never text. */
  log?: (line: string) => void
}

export interface ChatRequest {
  url?: string
  method?: string
  headers?: Record<string, string | string[] | undefined>
  socket?: { remoteAddress?: string }
}

export interface ChatAnswer {
  status: number
  body: Record<string, unknown>
}

// t27-plumbing: the page's own origin, the only one this route answers for
export const CHAT_ORIGIN = 'https://t27.ai'
// t27-plumbing: a request body this route reads at most (message + title + key fit in a few hundred bytes)
export const CHAT_BODY_MAX = 8 * 1024
// t27-plumbing: units of time
const HOUR_MS = 60 * 60 * 1000
const DAY_MS = 24 * HOUR_MS
// t27-plumbing: the server answers before the page's own CHAT_TIMEOUT_MS gives up
const UPSTREAM_MS = CHAT.CHAT_TIMEOUT_MS - 2000
// t27-plumbing: the answer budget sent to the model, in tokens; the 1200-char clamp stays the rule
const ANSWER_TOKENS = 600
// t27-plumbing: memory bound on the in-process windows
const SWEEP_AT = 5000

/** The reason names, in the gen file's own order (REASON_NONE .. REASON_BUSY). */
export const REASON_NAMES: Record<number, string> = {
  [CHAT.REASON_NONE]: 'none',
  [CHAT.REASON_UNREACHABLE]: 'unreachable',
  [CHAT.REASON_TIMEOUT]: 'timeout',
  [CHAT.REASON_STATUS]: 'status',
  [CHAT.REASON_EMPTY]: 'empty',
  [CHAT.REASON_LIMIT]: 'limit',
  [CHAT.REASON_OFF]: 'off',
  [CHAT.REASON_BAD_REQUEST]: 'bad_request',
  [CHAT.REASON_BUSY]: 'busy',
}

/**
 * The free chain: id -> the model this route pins. AGENT_MODEL may rename the
 * agent's model elsewhere; it must not rename this one, and no other id (kie,
 * nemotron, reserve, ollama) is ever in the list.
 */
export const FREE_MODELS: Record<string, string> = {
  zai: 'glm-4.7-flash',
  'zai-lite': 'glm-4.5-flash',
}

export function freeChain(): Provider[] {
  const order = Object.keys(FREE_MODELS)
  return allProviders()
    .filter(p => p.id in FREE_MODELS)
    .sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))
    .map(p => ({ ...p, model: FREE_MODELS[p.id] }))
}

// ---------------------------------------------------------------- the reader

function stripV6Map(a: string): string {
  return a.startsWith('::ffff:') ? a.slice(7) : a
}

/** The proxy's own side of the wire: loopback or a private/link-local address. */
// t27-plumbing: classifies a socket peer address as the reverse-proxy side of the wire, not a product rule
export function isProxyPeer(raw: string | undefined): boolean {
  const a = stripV6Map((raw || '').toLowerCase())
  if (a === '::1' || a.startsWith('127.')) return true
  if (net.isIPv4(a)) {
    const [p, q] = a.split('.').map(Number)
    return (
      p === 10 ||
      (p === 172 && q >= 16 && q <= 31) ||
      (p === 192 && q === 168) ||
      (p === 169 && q === 254)
    )
  }
  // unique-local fc00::/7 and link-local fe80::/10
  return /^f[cd]/.test(a) || /^fe[89ab]/.test(a)
}

/**
 * Who is asking. The reverse proxy appends the address it saw to the end of
 * X-Forwarded-For, so the LAST entry is the one a reader cannot choose; an
 * earlier entry is whatever the reader sent. A request that did not come
 * through the proxy (a socket peer on the public side) is counted by that peer.
 */
export function clientAddress(req: ChatRequest): string {
  const peer = stripV6Map(String(req.socket?.remoteAddress || '').toLowerCase())
  if (isProxyPeer(peer)) {
    const raw = req.headers?.['x-forwarded-for']
    const line = Array.isArray(raw) ? raw[raw.length - 1] : raw
    const last = String(line || '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean)
      .pop()
    const hop = last ? stripV6Map(last.toLowerCase()) : ''
    if (hop && net.isIP(hop)) return hop
  }
  return peer || 'unknown'
}

// --------------------------------------------------------------- the windows

const ipHits = new Map<string, number[]>()
const keyHits = new Map<string, number[]>()
const globalDay = { day: -1, n: 0 }

function live(
  map: Map<string, number[]>,
  id: string,
  span: number,
  at: number
) {
  const hits = (map.get(id) ?? []).filter(t => at - t < span)
  if (hits.length) map.set(id, hits)
  else map.delete(id)
  return hits
}

function sweep(map: Map<string, number[]>, span: number, at: number) {
  if (map.size < SWEEP_AT) return
  for (const id of [...map.keys()]) live(map, id, span, at)
}

function record(map: Map<string, number[]>, id: string, at: number) {
  map.set(id, [...(map.get(id) ?? []), at])
}

/** For tests: forget every window. */
export function forgetChatWindowsForTests(): void {
  ipHits.clear()
  keyHits.clear()
  globalDay.day = -1
  globalDay.n = 0
}

/** The spec's `limit_reason`: past a limit the answer is offline, no model call. */
function limitReason(
  ipCount: number,
  keyCount: number,
  hasKey: boolean
): number {
  if (ipCount >= CHAT.CHAT_PER_IP_HOUR) return CHAT.REASON_LIMIT
  if (hasKey && keyCount >= CHAT.CHAT_PER_KEY_DAY) return CHAT.REASON_LIMIT
  return CHAT.REASON_NONE
}

/** The spec's `request_reason`. */
function requestReason(courseOn: boolean, title: number, msg: number): number {
  if (!courseOn) return CHAT.REASON_OFF
  if (title > CHAT.CHAT_TITLE_MAX) return CHAT.REASON_BAD_REQUEST
  if (msg < 1 || msg > CHAT.CHAT_MSG_MAX) return CHAT.REASON_BAD_REQUEST
  return CHAT.REASON_NONE
}

/** The spec's `turn_reason`: a thread that reached the turn cap stops with reason limit. */
function turnReason(turn: number): number {
  if (turn >= CHAT.CHAT_TURNS_MAX) return CHAT.REASON_LIMIT
  return CHAT.REASON_NONE
}

/** The spec's `global_reason`: past the day's cap the answer is offline with reason busy. */
function globalReason(globalCount: number, cap: number): number {
  if (globalCount >= cap) return CHAT.REASON_BUSY
  return CHAT.REASON_NONE
}

/** The spec's `system_prompt`: the lesson clause only when there is a title. */
export function systemPrompt(course: string, title: string): string {
  return (
    CHAT.CHAT_PROMPT_HEAD +
    course +
    (title.length > 0 ? CHAT.CHAT_PROMPT_LESSON + title : '') +
    CHAT.CHAT_PROMPT_TAIL
  )
}

function offline(status: number, reason: number, detail?: string): ChatAnswer {
  return {
    status,
    body: {
      ok: false,
      offline: true,
      reason: REASON_NAMES[reason],
      ...(detail ? { detail } : {}),
    },
  }
}

/**
 * The daily ceiling for every reader together: the spec's CHAT_GLOBAL_DAY, which
 * the env var of the same name may only lower (a positive whole number below
 * it). Unset, zero, negative, fractional or larger values leave the spec's own.
 */
export function globalCap(): number {
  const n = Number(process.env.CHAT_GLOBAL_DAY)
  return Number.isInteger(n) && n > 0 && n < CHAT.CHAT_GLOBAL_DAY
    ? n
    : CHAT.CHAT_GLOBAL_DAY
}

/** Calls made so far today (UTC), rolling the counter at midnight. */
function dayCount(at: number): number {
  const day = Math.floor(at / DAY_MS)
  if (globalDay.day !== day) {
    globalDay.day = day
    globalDay.n = 0
  }
  return globalDay.n
}

function keyId(learnerId: string): string {
  return crypto
    .createHash('sha256')
    .update(learnerId)
    .digest('hex')
    .slice(0, 10)
}

// --------------------------------------------------------------- the model

interface Upstream {
  text: string | null
  failure: 'timeout' | 'status' | 'unreachable' | 'empty' | null
}

async function ask(
  chain: Provider[],
  system: string,
  message: string,
  doFetch: typeof fetch
): Promise<Upstream> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), UPSTREAM_MS)
  let failure: Upstream['failure'] = 'unreachable'
  try {
    for (const p of chain) {
      for (const key of p.keys?.length ? p.keys : [p.key]) {
        let r: Response
        try {
          r = await doFetch(`${p.base}/chat/completions`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${key}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              model: p.model,
              messages: [
                { role: 'system', content: system },
                { role: 'user', content: message },
              ],
              temperature: 0.3,
              max_tokens: ANSWER_TOKENS,
              stream: false,
              thinking: { type: 'disabled' },
            }),
            signal: ctl.signal,
          })
        } catch (e) {
          if (ctl.signal.aborted) return { text: null, failure: 'timeout' }
          failure = 'unreachable'
          continue
        }
        if (!r.ok) {
          failure = 'status'
          const body = await r.text().catch(() => '')
          // A refusal that is this key's fault: the pool's next key may work.
          // Anything else: the next route (the other free model) is the retry.
          if (isKeyFailure(r.status, diagnose(p.id, r.status, body))) continue
          break
        }
        const j: any = await r.json().catch(() => null)
        const content = j?.choices?.[0]?.message?.content
        const text =
          typeof content === 'string'
            ? content.replace(/<think>[\s\S]*?<\/think>/g, '').trim()
            : ''
        if (text) return { text, failure: null }
        failure = 'empty'
        break
      }
    }
    return { text: null, failure }
  } finally {
    clearTimeout(timer)
  }
}

// -------------------------------------------------------------- the handler

export async function handleChat(
  req: ChatRequest,
  deps: ChatDeps
): Promise<ChatAnswer> {
  const log = deps.log ?? ((l: string) => console.log(l))
  const at = (deps.now ?? (() => new Date()))().getTime()
  const done = (out: ChatAnswer, extra = ''): ChatAnswer => {
    log(`[course-chat] status=${out.status}${extra}`)
    return out
  }
  if (req.method !== 'POST')
    return done(offline(405, CHAT.REASON_BAD_REQUEST, 'method'))

  let body: Record<string, unknown>
  try {
    const parsed = JSON.parse((await deps.readBody(req)) || '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed))
      throw new Error('not an object')
    body = parsed as Record<string, unknown>
  } catch {
    return done(offline(400, CHAT.REASON_BAD_REQUEST, 'bad_json'))
  }
  const course = typeof body.course === 'string' ? body.course : ''
  const courseOn = (CHAT.CHAT_COURSES as readonly string[]).includes(course)

  // The probe: the panel asks "are you there?" when it opens. It is answered
  // from the route's own state, with no model call, no window hit and no count
  // of the day; and it is honest: when a real message could not be answered
  // (course off, no key, the day's cap reached) it says so with the same status.
  if (body.probe !== undefined && typeof body.probe !== 'boolean')
    return done(offline(400, CHAT.REASON_BAD_REQUEST, 'bad_fields'), ' probe')
  if (body.probe === true) {
    if (!courseOn) return done(offline(404, CHAT.REASON_OFF), ' probe')
    if (!freeChain().length)
      return done(offline(503, CHAT.REASON_OFF, 'no_key'), ' probe')
    if (globalReason(dayCount(at), globalCap()) !== CHAT.REASON_NONE)
      return done(offline(503, CHAT.REASON_BUSY, 'global'), ' probe')
    return done({ status: 200, body: { ok: true, probe: true } }, ' probe')
  }

  const title = typeof body.title === 'string' ? body.title : ''
  const message = typeof body.message === 'string' ? body.message : ''
  // `turn` is how many questions were asked since the panel opened; absent
  // counts as the first. Anything but a whole number from zero up is not a turn.
  const turn = body.turn === undefined ? 0 : body.turn
  if (
    (body.title !== undefined && typeof body.title !== 'string') ||
    typeof body.message !== 'string' ||
    typeof turn !== 'number' ||
    !Number.isInteger(turn) ||
    turn < 0
  )
    return done(offline(400, CHAT.REASON_BAD_REQUEST, 'bad_fields'))

  const bad = requestReason(courseOn, title.length, message.length)
  if (bad === CHAT.REASON_OFF) return done(offline(404, bad))
  if (bad !== CHAT.REASON_NONE) return done(offline(400, bad))

  // Before any window is touched: a thread past the turn cap costs nothing.
  const turned = turnReason(turn)
  if (turned !== CHAT.REASON_NONE)
    return done(offline(429, turned, 'turns'), ` turn=${turn}`)

  // The key is counted only when it is a good one: a made-up key gets no
  // bucket of its own, so rotating garbage cannot dodge the address window.
  const reading =
    typeof body.key === 'string' && body.key
      ? readKey(body.key, new Date(at), courseKeySecret())
      : null
  const kid = reading?.ok && reading.learnerId ? keyId(reading.learnerId) : ''

  const who = clientAddress(req)
  sweep(ipHits, HOUR_MS, at)
  sweep(keyHits, DAY_MS, at)
  const ipCount = live(ipHits, who, HOUR_MS, at).length
  const keyCount = kid ? live(keyHits, kid, DAY_MS, at).length : 0
  const limited = limitReason(ipCount, keyCount, kid !== '')
  const counts = ` ip_n=${ipCount} key_n=${keyCount} key=${kid || '-'}`
  if (limited !== CHAT.REASON_NONE)
    return done(offline(429, limited, 'window'), counts)
  record(ipHits, who, at)
  if (kid) record(keyHits, kid, at)

  const chain = freeChain()
  if (!chain.length)
    return done(offline(503, CHAT.REASON_OFF, 'no_key'), counts)

  const busy = globalReason(dayCount(at), globalCap())
  if (busy !== CHAT.REASON_NONE)
    return done(offline(503, busy, 'global'), `${counts} day_n=${globalDay.n}`)
  globalDay.n += 1

  const started = Date.now()
  const out = await ask(
    chain,
    systemPrompt(course, title),
    message,
    deps.fetch ?? fetch
  )
  const tail = `${counts} day_n=${globalDay.n} ms=${Date.now() - started}`
  if (out.text === null) {
    if (out.failure === 'timeout')
      return done(offline(504, CHAT.REASON_TIMEOUT), tail)
    if (out.failure === 'empty')
      return done(offline(502, CHAT.REASON_EMPTY), tail)
    if (out.failure === 'status')
      return done(offline(502, CHAT.REASON_STATUS), tail)
    return done(offline(502, CHAT.REASON_UNREACHABLE), tail)
  }
  const answer = out.text.slice(0, CHAT.CHAT_ANSWER_MAX)
  return done({ status: 200, body: { ok: true, answer } }, tail)
}

// ---------------------------------------------------------------------- CORS

/**
 * The headers this path sets over the server-wide `*`. For the page's own
 * origin: that origin, POST and OPTIONS, Content-Type. For any other origin
 * (or none): the Access-Control-* headers are removed, so no `*` leaks out.
 * Null for every other path (they keep the server-wide answer).
 */
export function chatCorsHeaders(
  path: string,
  origin: string | undefined
): Record<string, string | null> | null {
  if (path !== CHAT.CHAT_ROUTE) return null
  if (origin === CHAT_ORIGIN)
    return {
      'Access-Control-Allow-Origin': CHAT_ORIGIN,
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '600',
      Vary: 'Origin',
    }
  return {
    'Access-Control-Allow-Origin': null,
    'Access-Control-Allow-Methods': null,
    'Access-Control-Allow-Headers': null,
    'Access-Control-Max-Age': null,
    Vary: 'Origin',
  }
}
