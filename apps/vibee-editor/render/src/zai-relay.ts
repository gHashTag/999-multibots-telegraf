/**
 * A ONE-FIX PROXY FOR Z.AI, ON THE WAY OF ZEP'S LLM CALLS.
 *
 * Zep CE v0.27.2 talks to its "openai" LLM with a single system message and
 * nothing else (pkg/llms/llm_openai.go, ZepOpenAILLM.Call). Z.AI answers
 * that with `400 1214 "The messages parameter is illegal"` -- measured
 * 2026-09-13, see zai-relay.test.ts for the full truth table. OpenAI and
 * Ollama accept the shape, which is why zep ever worked elsewhere.
 *
 * The legalizer below appends one user turn when the array has none,
 * because Z.AI's actual rule is presence, not order. Status and body of the
 * upstream cross back verbatim: this route fixes the wire shape, it does
 * not interpret, cache, or re-key anything.
 *
 * Two more measured facts (2026-09-13), both about TIME:
 * - zep hard-caps every LLM HTTP call at 20s (OpenAIAPITimeout in
 *   llm_openai.go; 60s ctx, 5 retries). No config can raise it.
 * - the coding endpoint only serves hybrid reasoners (glm-5.3-flash,
 *   glm-4.5-flash...), ignores thinking:{"type":"disabled"}, and takes
 *   27-57s on a summary prompt -- every zep call times out. The normal
 *   endpoint (api/paas/v4) accepts the same key, HONORS thinking:disabled,
 *   and answers in ~13s with zero reasoning.
 * So the relay also (a) injects thinking:{"type":"disabled"} when the
 * caller sent none -- zep never sends it -- and (b) can be switched to the
 * normal endpoint via ZAI_RELAY_UPSTREAM, leaving the coding default in
 * place for deployments that do not set it.
 *
 * Who may call: a service holding the same key we forward (zep carries the
 * Z.AI key as ZEP_OPENAI_API_KEY and sends it as a bearer). The upstream
 * Authorization is always rebuilt from OUR environment, so the relay can
 * never be pointed at anybody else's account through a caller-chosen key.
 * Route: ZEP_LLM_OPENAI_ENDPOINT=https://<render>/api/zai/relay -- zep's
 * vendored langchaingo appends "/chat/completions" itself.
 *
 * BACKGROUND YIELDS TO THE PERSON'S TURN (measured 2026-10-06, vibee-render
 * production logs 05:00-11:32 UTC). The agent (AGENT_PROVIDER=zai,
 * glm-4.7-flash) and zep's memory share ONE Z.AI key. In 6.5 h the relay
 * made 630 upstream calls (~97/h, in bursts of 15-30 back to back) against
 * ~45 agent turns; the agent got Z.AI's 429 33 times (zai-lite 6 more), and
 * 15 of the 45 turns ended in an error -- the fallbacks behind zai were
 * exhausted, unfunded, or "talked instead of calling" tools. The person saw
 * the agent stop mid-task. Memory is background work and can wait; the
 * person cannot. So the relay holds at most ZAI_RELAY_MAX_INFLIGHT upstream
 * calls at once (default 1) and starts them at least ZAI_RELAY_MIN_GAP_MS
 * apart (default 3000). Over either line it answers 429 with Retry-After
 * at once, WITHOUT touching Z.AI: zep retries, the agent keeps the quota.
 * ZAI_RELAY_API_KEY, when set, moves memory to a quota of its own (see
 * zaiRelayKey): it is then BOTH the key forwarded and the bearer expected,
 * so zep's ZEP_OPENAI_API_KEY must change to the same value at the same time.
 */
import { createHash, timingSafeEqual } from 'node:crypto'

export const ZAI_RELAY_UPSTREAM =
  'https://api.z.ai/api/coding/paas/v4/chat/completions'

const RELAY_TIMEOUT_MS = 120_000

const DEFAULT_MAX_INFLIGHT = 1
const DEFAULT_MIN_GAP_MS = 3000

/**
 * The relay's share of the Z.AI quota. One per process in production (see
 * processGate); tests hand in their own so nothing leaks between them.
 */
export interface ZaiRelayGate {
  inFlight: number
  /** When the last upstream call started, by deps.now(). */
  lastStartAt: number
}

export function createZaiRelayGate(): ZaiRelayGate {
  return { inFlight: 0, lastStartAt: Number.NEGATIVE_INFINITY }
}

const processGate = createZaiRelayGate()

/**
 * The one key the relay runs on: ZAI_RELAY_API_KEY when set (memory on its
 * own quota), else GLM_API_KEY (shared with the agent). Forwarded upstream
 * AND expected as the caller's bearer -- one key, so a caller can never
 * spend a key it does not hold. Blank counts as unset.
 */
export function zaiRelayKey(
  env: Record<string, string | undefined> = process.env
): string | undefined {
  return env.ZAI_RELAY_API_KEY?.trim() || env.GLM_API_KEY || undefined
}

/** A whole number from the environment at or above `min`, else `fallback`. */
function envInt(name: string, fallback: number, min: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= min ? n : fallback
}

export function isZaiRelayPath(path: string): boolean {
  return /^\/api\/zai\/relay\/chat\/completions\/?$/.test(path)
}

/**
 * Returns the array Z.AI will accept, or an error. Pass-through is by
 * reference: an already-legal body must cross the relay bit-identical.
 */
export function legalizeZaiMessages(
  messages: unknown
):
  | { messages: unknown[]; error: undefined }
  | { messages: undefined; error: string } {
  if (!Array.isArray(messages) || messages.length === 0) {
    return { messages: undefined, error: 'messages must be a non-empty array' }
  }
  for (const m of messages) {
    if (!m || typeof m !== 'object' || Array.isArray(m)) {
      return { messages: undefined, error: 'each message must be an object' }
    }
    // A message with no role is not a message; Z.AI would reject the whole
    // array, and relaying it would turn that into our confusing 502.
    if (typeof (m as { role?: unknown }).role !== 'string') {
      return { messages: undefined, error: 'each message must have a role' }
    }
  }
  const hasUser = messages.some(m => (m as { role?: unknown }).role === 'user')
  if (hasUser) return { messages, error: undefined }
  return {
    messages: [...messages, { role: 'user', content: 'Proceed.' }],
    error: undefined,
  }
}

export interface ZaiRelayDeps {
  readBody: (req: unknown) => Promise<string>
  /** The caller's Authorization header, verbatim. */
  bearerOf: (req: unknown) => string | undefined
  /** zaiRelayKey(): forwarded and expected; absent means the relay is off. */
  apiKey: () => string | undefined
  fetchImpl: typeof fetch
  /** Overridable so tests never leave the machine. */
  upstream?: string
  /** Defaults to the one process-wide gate. */
  gate?: ZaiRelayGate
  /** Milliseconds; defaults to Date.now. Tests move time by hand. */
  now?: () => number
}

export interface ZaiRelayResult {
  status: number
  body: string
  /** Extra response headers, e.g. Retry-After on a busy 429. */
  headers?: Record<string, string>
}

/** The relay's own 429, in the error shape an OpenAI client expects. */
function busy(why: string, retryAfterMs: number): ZaiRelayResult {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000))
  return {
    status: 429,
    headers: { 'Retry-After': String(seconds) },
    body: JSON.stringify({
      error: {
        message: `zai relay busy: ${why}; the agent's turn goes first`,
        type: 'rate_limit',
        code: 'relay_busy',
      },
    }),
  }
}

/**
 * Timing-safe bearer check that never leaks length: compare digests, not
 * raw strings. Returns true only for an exact match.
 */
function bearerMatches(bearer: string | undefined, key: string): boolean {
  if (!bearer) return false
  const digest = (s: string) => createHash('sha256').update(s).digest()
  return timingSafeEqual(digest(bearer), digest(`Bearer ${key}`))
}

export async function handleZaiRelay(
  req: { method?: string },
  deps: ZaiRelayDeps
): Promise<ZaiRelayResult> {
  if (req.method !== 'POST') {
    return { status: 405, body: JSON.stringify({ error: 'POST only' }) }
  }
  const key = deps.apiKey()
  if (!key) {
    // Fail closed: without our own key there is nothing honest to forward.
    return {
      status: 503,
      body: JSON.stringify({
        error: 'neither ZAI_RELAY_API_KEY nor GLM_API_KEY is set',
      }),
    }
  }
  if (!bearerMatches(deps.bearerOf(req), key)) {
    return { status: 403, body: JSON.stringify({ error: 'bad bearer' }) }
  }
  let raw: string
  try {
    raw = await deps.readBody(req)
  } catch (e) {
    return {
      status: 413,
      body: JSON.stringify({ error: `unreadable body: ${String(e)}` }),
    }
  }
  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw || '{}')
  } catch {
    return { status: 400, body: JSON.stringify({ error: 'bad json' }) }
  }
  if (parsed.stream === true) {
    // One buffered JSON body in, one out; a stream would hang the caller.
    return {
      status: 400,
      body: JSON.stringify({ error: 'streaming is not supported' }),
    }
  }
  const legal = legalizeZaiMessages(parsed.messages)
  if (legal.error) {
    return { status: 400, body: JSON.stringify({ error: legal.error }) }
  }
  const upstream =
    deps.upstream ?? process.env.ZAI_RELAY_UPSTREAM ?? ZAI_RELAY_UPSTREAM
  // Zep never sends a thinking flag; without "disabled" the hybrid reasoners
  // behind this key think for 27-57s and blow zep's hardcoded 20s HTTP cap.
  // A caller who DID set the flag gets exactly what it asked for.
  const body: Record<string, unknown> = { ...parsed, messages: legal.messages }
  if (typeof body.thinking !== 'object' || body.thinking === null) {
    body.thinking = { type: 'disabled' }
  }
  // Background yields: take a slot or step aside before Z.AI is touched.
  const gate = deps.gate ?? processGate
  const now = (deps.now ?? Date.now)()
  const maxInFlight = envInt('ZAI_RELAY_MAX_INFLIGHT', DEFAULT_MAX_INFLIGHT, 1)
  const minGapMs = envInt('ZAI_RELAY_MIN_GAP_MS', DEFAULT_MIN_GAP_MS, 0)
  if (gate.inFlight >= maxInFlight) {
    return busy(`${gate.inFlight} call(s) in flight`, Math.max(minGapMs, 1000))
  }
  const sinceLast = now - gate.lastStartAt
  if (sinceLast < minGapMs) {
    return busy(`last call ${sinceLast} ms ago`, minGapMs - sinceLast)
  }
  gate.inFlight++
  gate.lastStartAt = now
  try {
    let response: Response
    try {
      response = await deps.fetchImpl(upstream, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${key}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(RELAY_TIMEOUT_MS),
      })
    } catch (e) {
      return {
        status: 502,
        body: JSON.stringify({ error: `upstream unreachable: ${String(e)}` }),
      }
    }
    // Verbatim: whatever Z.AI said, including its 4xx, is the answer.
    return { status: response.status, body: await response.text() }
  } finally {
    // Every way out frees the slot, a throw while reading the body included.
    gate.inFlight--
  }
}
