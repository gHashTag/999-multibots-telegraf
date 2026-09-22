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

/*
 * password | email | code | text -- the person TYPES it (the typing sheet).
 * choice -- the person PICKS one of the agent's options (Skip / Save).
 * action -- the person DOES something only they can (a captcha, a push to
 *           confirm on their phone, a QR code) and says Done or Cannot.
 */
export type InputKind =
  | 'password'
  | 'email'
  | 'code'
  | 'text'
  | 'choice'
  | 'action'

/** What "action" offers when the agent gives no words of its own. */
export const ACTION_OPTIONS = ['done', 'cannot'] as const
export const MAX_OPTIONS = 4

export interface InputRequest {
  id: string
  kind: InputKind
  /** The agent's words to the person: what for, in their language. */
  why: string
  /** Where the field is, as person-type.ts read it; '' when unknown. */
  host: string
  label: string
  /** The buttons, for choice and action; empty for typing. */
  options: string[]
  at: number
  /** Filled when the person typed: how long and into what -- never the text. */
  typed?: { chars: number; field: string; enter: boolean; at: number }
  /** Filled when the person pressed one of the options. */
  chosen?: { option: string; at: number }
}

/** A request nobody answered is gone after this. */
export const INPUT_REQUEST_TTL_MS = 10 * 60_000

const requests = new Map<string, InputRequest>()

export function resetInputRequestsForTests(): void {
  requests.clear()
}

export function asKind(v: unknown): InputKind {
  return v === 'password' ||
    v === 'email' ||
    v === 'code' ||
    v === 'choice' ||
    v === 'action'
    ? v
    : 'text'
}

/** The buttons a request carries. Pure. Choice needs two; action has its own. */
export function optionsFor(kind: InputKind, raw: unknown): string[] {
  if (kind === 'action') return [...ACTION_OPTIONS]
  if (kind !== 'choice') return []
  const list = Array.isArray(raw) ? raw : []
  const clean = [
    ...new Set(
      list
        .map(o => (typeof o === 'string' ? o.trim().slice(0, 40) : ''))
        .filter(Boolean)
    ),
  ].slice(0, MAX_OPTIONS)
  if (clean.length < 2) throw new Error('a choice needs at least two options')
  return clean
}

/** The person pressed an option: only one the agent offered, only once. */
export function markChosen(
  telegramId: string,
  id: string,
  option: string,
  now = Date.now()
): boolean {
  const r = requests.get(telegramId)
  if (!r || r.id !== id || r.typed || r.chosen) return false
  if (now - r.at > INPUT_REQUEST_TTL_MS) return false
  if (!r.options.includes(option)) return false
  r.chosen = { option, at: now }
  return true
}

export function askForInput(
  telegramId: string,
  req: Omit<InputRequest, 'at' | 'typed' | 'chosen' | 'options'> & {
    options?: string[]
  },
  now = Date.now()
): InputRequest {
  const r: InputRequest = { ...req, options: req.options ?? [], at: now }
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
  if (r.typed || r.chosen || now - r.at > INPUT_REQUEST_TTL_MS) return null
  return r
}

/** The person typed (person-type.ts): answer the open request, if any. */
export function markTyped(
  telegramId: string,
  typed: { chars: number; field: string; enter: boolean },
  now = Date.now()
): void {
  const r = requests.get(telegramId)
  if (!r || r.typed || r.chosen || now - r.at > INPUT_REQUEST_TTL_MS) return
  /* Only a request for typing is answered by typing. */
  if (r.kind === 'choice' || r.kind === 'action') return
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
  const got = await waitForAnswer(telegramId, id, timeoutMs, pollMs, sleep)
  return got?.typed ?? null
}

/** Waits for any answer: typed, or an option pressed. */
export async function waitForAnswer(
  telegramId: string,
  id: string,
  timeoutMs: number,
  pollMs = 1000,
  sleep: (ms: number) => Promise<void> = ms =>
    new Promise(r => setTimeout(r, ms))
): Promise<Pick<InputRequest, 'typed' | 'chosen'> | null> {
  const until = Date.now() + timeoutMs
  for (;;) {
    const r = requests.get(telegramId)
    if (!r || r.id !== id) return null /* replaced or gone */
    if (r.typed || r.chosen) return { typed: r.typed, chosen: r.chosen }
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
  options: string[]
} | null {
  return r
    ? {
        id: r.id,
        kind: r.kind,
        why: r.why,
        host: r.host,
        label: r.label,
        options: r.options,
      }
    : null
}
