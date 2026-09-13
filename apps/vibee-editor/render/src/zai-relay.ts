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
 */
import { createHash, timingSafeEqual } from 'node:crypto'

export const ZAI_RELAY_UPSTREAM =
  'https://api.z.ai/api/coding/paas/v4/chat/completions'

const RELAY_TIMEOUT_MS = 120_000

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
  /** Render's own GLM_API_KEY; absent means the relay is off. */
  apiKey: () => string | undefined
  fetchImpl: typeof fetch
  /** Overridable so tests never leave the machine. */
  upstream?: string
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
): Promise<{ status: number; body: string }> {
  if (req.method !== 'POST') {
    return { status: 405, body: JSON.stringify({ error: 'POST only' }) }
  }
  const key = deps.apiKey()
  if (!key) {
    // Fail closed: without our own key there is nothing honest to forward.
    return {
      status: 503,
      body: JSON.stringify({ error: 'GLM_API_KEY is not set' }),
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
}
