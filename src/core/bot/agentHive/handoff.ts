/**
 * A2A OVER TELEGRAM: ONE AGENT HANDS A TASK TO A COLLEAGUE, BOT TO BOT.
 *
 * Telegram lets a bot send a private message to another bot by passing its
 * @username to sendMessage, when Bot-to-Bot Communication Mode is on in
 * @BotFather for both (owner, 2026-10-09: "I switched it on exactly for
 * A2A"). The rules -- who is heard, that an ask is one hop and an answer is
 * only carried, how many hand-offs one answer makes, how long an answer is
 * expected -- are the spec's (agent-hive-group.t27 v4, compiled into
 * rules.ts). This file is the wire format only:
 *
 *   #a2a <kind> <person id>
 *   <the task, or the colleague's answer>
 *
 * and the memory of which asks are still waiting for their answer.
 */
import * as SPEC from '@/spec/agent-hive-group.gen'

export interface Tagged {
  kind: number
  /** The person the hand-off is for: the turn runs in their name. */
  origin: number
  body: string
}

/** The message one agent sends another: the tag line, then the words. */
export const tagged = (kind: number, origin: number, body: string): string =>
  `${SPEC.DM_TAG} ${kind} ${origin}\n${body}`

/** The tag line of a private bot message, or null when it has none. */
const TAG_LINE = new RegExp(
  `^${SPEC.DM_TAG.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (\\d{1,3}) (\\d{1,20})\\n([\\s\\S]+)$`
)

export function readTagged(text: string): Tagged | null {
  const m = TAG_LINE.exec(text)
  if (!m) return null
  const origin = Number(m[2])
  if (!Number.isSafeInteger(origin) || origin <= 0) return null
  return { kind: Number(m[1]), origin, body: m[3].trim() }
}

/**
 * The hand-offs an agent's answer asks for: lines "@colleague_bot: the task"
 * naming one of its colleagues, in order, one per colleague.
 */
export function handoffsIn(
  reply: string,
  colleagues: readonly string[]
): { username: string; task: string }[] {
  const known = new Map(colleagues.map(u => [u.toLowerCase(), u]))
  const out: { username: string; task: string }[] = []
  for (const line of reply.split('\n')) {
    const m = /^\s*@([A-Za-z0-9_]{5,32})\s*:\s*(\S[\s\S]*)$/.exec(line)
    const username = m ? known.get(m[1].toLowerCase()) : undefined
    if (!m || !username || out.some(h => h.username === username)) continue
    out.push({ username, task: m[2].trim() })
  }
  return out
}

/** When each ask went out: asker bot -> colleague bot -> person. */
const asked = new Map<string, number>()
const MAX_REMEMBERED = 5_000 // t27-plumbing: a memory bound, as chain.ts keeps
const askKey = (askerId: number, colleagueId: number, origin: number) =>
  `${askerId}:${colleagueId}:${origin}`

export function noteAsk(
  askerId: number,
  colleagueId: number,
  origin: number,
  now = Date.now()
): void {
  asked.set(askKey(askerId, colleagueId, origin), now)
  if (asked.size > MAX_REMEMBERED) {
    const oldest = asked.keys().next().value
    if (oldest !== undefined) asked.delete(oldest)
  }
}

/** Milliseconds since this asker asked this colleague for this person; Infinity if never. */
export function sinceAsk(
  askerId: number,
  colleagueId: number,
  origin: number,
  now = Date.now()
): number {
  const at = asked.get(askKey(askerId, colleagueId, origin))
  return at === undefined ? Infinity : now - at
}

/** For tests. */
export function clearAsks(): void {
  asked.clear()
}
