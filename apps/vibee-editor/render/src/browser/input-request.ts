/**
 * THE AGENT ASKS FOR A PASSWORD, AND NEVER SEES IT.
 *
 * Owner, 2026-09-22: "the agent, knowing something has to be entered, should
 * help by showing the input it needs -- and do everything else once it has
 * the passwords". So the agent can stop at a sign-in field, point at it, and
 * ask. The person's app opens the typing sheet with the agent's words on it
 * (and Telegram carries a button there); the person types into their own
 * browser through their own door (person-type.ts); the agent learns only
 * THAT it was typed, how long it was and into what kind of field -- then goes
 * on with the task in the same turn.
 *
 * One request per person, in memory: it is a question on a screen for a few
 * minutes, not a record. A newer request replaces an older one.
 */

export type InputKind = 'password' | 'email' | 'code' | 'text'

export interface InputRequest {
  id: string
  kind: InputKind
  /** The agent's words to the person: what for, in their language. */
  why: string
  /** Where the field is, as person-type.ts read it; '' when unknown. */
  host: string
  label: string
  at: number
  /** Filled when the person typed: how long and into what -- never the text. */
  typed?: { chars: number; field: string; enter: boolean; at: number }
}

/** A request nobody answered is gone after this. */
export const INPUT_REQUEST_TTL_MS = 10 * 60_000

const requests = new Map<string, InputRequest>()

export function resetInputRequestsForTests(): void {
  requests.clear()
}

export function asKind(v: unknown): InputKind {
  return v === 'password' || v === 'email' || v === 'code' ? v : 'text'
}

export function askForInput(
  telegramId: string,
  req: Omit<InputRequest, 'at' | 'typed'>,
  now = Date.now()
): InputRequest {
  const r: InputRequest = { ...req, at: now }
  requests.set(telegramId, r)
  return r
}

/** The open request, if any: unanswered and not stale. */
export function pendingInput(
  telegramId: string,
  now = Date.now()
): InputRequest | null {
  const r = requests.get(telegramId)
  if (!r) return null
  if (r.typed || now - r.at > INPUT_REQUEST_TTL_MS) return null
  return r
}

/** The person typed (person-type.ts): answer the open request, if any. */
export function markTyped(
  telegramId: string,
  typed: { chars: number; field: string; enter: boolean },
  now = Date.now()
): void {
  const r = requests.get(telegramId)
  if (!r || r.typed || now - r.at > INPUT_REQUEST_TTL_MS) return
  r.typed = { ...typed, at: now }
}

/** Waits until request `id` is answered or the time is up. */
export async function waitForTyped(
  telegramId: string,
  id: string,
  timeoutMs: number,
  pollMs = 1000,
  sleep: (ms: number) => Promise<void> = ms =>
    new Promise(r => setTimeout(r, ms))
): Promise<InputRequest['typed'] | null> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const r = requests.get(telegramId)
    if (!r || r.id !== id) return null /* replaced or gone */
    if (r.typed) return r.typed
    if (Date.now() >= until) return null
    await sleep(pollMs)
  }
}

/** What the person's app is shown. Never more than the agent wrote. */
export function inputRequestView(r: InputRequest | null): {
  id: string
  kind: InputKind
  why: string
  host: string
  label: string
} | null {
  return r
    ? { id: r.id, kind: r.kind, why: r.why, host: r.host, label: r.label }
    : null
}
