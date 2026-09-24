/**
 * EVERY MARKETPLACE AGENT IS CHECKED EVERY DAY, AND A FAILURE IS SAID ALOUD.
 *
 * Owner, 2026-09-24, choosing all three next steps: "a daily acceptance run;
 * if an agent fails, its card says so and one line reaches the owner". The
 * competitor practice is the same (continuous evaluation: scheduled evals on
 * production, an alert on a regression) -- a check run only when somebody
 * remembers to run it finds a broken agent from a client, not from us.
 *
 * The run happens INSIDE the render service: no second deploy target, no
 * key leaving its environment, and the same agent turn a person gets
 * (runAgent, with the specialist's own voice). The table of canaries is the
 * one `tri agents` uses (acceptance-canaries.json).
 *
 * Three rules keep it honest:
 * 1. A canary only asks for drafts and readings; a turn that reaches a tool
 *    that publishes, sends or spends is a FAIL (ACTING), whatever it said.
 * 2. Nothing is recorded in the owner's conversation: a canary is a probe,
 *    not something the owner said.
 * 3. The owner hears about FAILURES and RECOVERIES only. A daily "all fine"
 *    would teach them to ignore the line that one day is not fine.
 */
import { createHash } from 'node:crypto'
import TABLE from './acceptance-canaries.json'
import type { FailCode, LatestVerdict, Verdict } from './agent-acceptance'

/**
 * What the ANSWER must show, beyond "a tool was called and a word said".
 * Calibrated on the 2026-09-24 07:14 run: Google Scout passed while its
 * answer began "I have not opened a single source yet" (its search was
 * down, HTTP 402) -- a tool call is not the job done.
 */
export interface AnswerRule {
  /** Counted over the whole answer; the `g` flag is always added. */
  pattern: string
  flags?: string
  min: number
  /** Said to the owner when the rule is not met. */
  why: string
}

export interface Canary {
  id: string
  canary: string
  expect: string[]
  answer?: AnswerRule[]
}

export const CANARIES: readonly Canary[] = TABLE.agents as Canary[]

/**
 * The rules an answer misses, as the owner's words. The same counting as
 * scripts/agents-acceptance.cjs answerMisses. Pure.
 */
export function answerMisses(
  rules: readonly AnswerRule[] | undefined,
  text: string
): string[] {
  const misses: string[] = []
  for (const r of rules ?? []) {
    const flags = (r.flags ?? '').includes('g')
      ? (r.flags ?? '')
      : `${r.flags ?? ''}g`
    const found = String(text ?? '').match(new RegExp(r.pattern, flags))
    if ((found?.length ?? 0) < r.min) misses.push(r.why)
  }
  return misses
}
export const ACTING: readonly string[] = TABLE.acting

/**
 * The fingerprint of the canary table. `tri agents` computes the same over
 * the same file (scripts/agents-acceptance.cjs canariesHash).
 */
export function canariesHash(table: unknown = TABLE): string {
  return createHash('sha256')
    .update(JSON.stringify(table))
    .digest('hex')
    .slice(0, 12)
}
export const CANARIES_HASH = canariesHash()

/** What one turn showed, read from the agent's own events. */
export interface TurnSeen {
  tools: string[]
  text: string
  error: string | null
}

/**
 * The events runAgent yields are the lines the chat route streams; this reads
 * them exactly as scripts/agents-acceptance.cjs readStream reads the stream.
 * Pure.
 */
export function seenOf(
  events: ReadonlyArray<Record<string, unknown>>
): TurnSeen {
  const tools: string[] = []
  let text = ''
  let error: string | null = null
  for (const e of events) {
    const kind = e['тип'] // cyrillic-ok: the agent's event key
    if (kind === 'инструмент')
      tools.push(String(e['имя'] ?? '')) // cyrillic-ok: event names
    else if (kind === 'текст')
      text += String(e['текст'] ?? e['text'] ?? '') // cyrillic-ok: event names
    else if (kind === 'ошибка')
      error = String(e['текст'] ?? e['error'] ?? 'error') // cyrillic-ok: event names
    else if (kind === 'готово' && e['обрыв']) error = `cut: ${e['обрыв']}` // cyrillic-ok: event names
  }
  return { tools, text, error }
}

/**
 * Pass or fail, as codes. The same rule as the script's verdict(); a
 * contract test runs both over the same cases. Pure.
 */
export function verdictFor(c: Canary, seen: TurnSeen, ok = true): Verdict {
  const codes: FailCode[] = []
  if (!ok) codes.push('http')
  if (seen.error) codes.push('error')
  if (!seen.text.trim()) codes.push('no_answer')
  if (seen.tools.some(t => ACTING.includes(t))) codes.push('acted')
  if (c.expect.length && !seen.tools.some(t => c.expect.includes(t)))
    codes.push('expected_tool_missing')
  if (seen.text.trim() && answerMisses(c.answer, seen.text).length)
    codes.push('answer_shape')
  return { agent: c.id, pass: codes.length === 0, tools: seen.tools, codes }
}

/** One day between runs, unless ACCEPTANCE_EVERY_H says otherwise. */
export function everyMs(env: NodeJS.ProcessEnv = process.env): number {
  const h = Number(env.ACCEPTANCE_EVERY_H)
  return (Number.isFinite(h) && h >= 1 ? h : 24) * 3_600_000
}

/**
 * WHICH AGENTS ARE DUE, EACH ON ITS OWN. An agent is due when it was never
 * checked, its newest verdict is older than the period, or that verdict was
 * made under another canary table (a stricter rule makes it stale).
 *
 * Per agent, not per run, because a run is five turns long and main is
 * busy: a deploy in the middle of a run used to lose every verdict of it,
 * and a run that restarts from the top after each deploy may never finish.
 * Now each verdict is recorded as it is made, and the next start picks up
 * only the agents still due. Pure.
 */
export function dueCanaries(
  latest: readonly LatestVerdict[],
  nowMs: number,
  periodMs: number,
  hash?: string,
  canaries: readonly Canary[] = CANARIES
): Canary[] {
  const byAgent = new Map(latest.map(v => [v.agent, v]))
  return canaries.filter(c => {
    const v = byAgent.get(c.id)
    if (!v) return true
    if (hash && v.canaries !== hash) return true
    return nowMs - (Date.parse(v.at) || 0) >= periodMs
  })
}

/** The words for each code, for the owner. */
const WHY: Record<FailCode, string> = {
  http: 'сервис не ответил', // cyrillic-ok: told to the owner
  error: 'ход оборвался с ошибкой', // cyrillic-ok
  no_answer: 'не ответил ни слова', // cyrillic-ok
  acted: 'полез публиковать или отправлять', // cyrillic-ok
  expected_tool_missing: 'не взял свой инструмент', // cyrillic-ok
  answer_shape: 'ответ не тот, что просили', // cyrillic-ok
}

/**
 * The one line the owner gets, or null when there is nothing to say: only a
 * failure, or an agent that failed last time and passes now. Pure.
 */
export function alertText(
  now: readonly Verdict[],
  before: readonly LatestVerdict[],
  /** Per agent, the answer rules it missed (answerMisses), for the owner. */
  misses: Readonly<Record<string, string[]>> = {}
): string | null {
  const wasFailing = new Set(before.filter(v => !v.pass).map(v => v.agent))
  const failed = now.filter(v => !v.pass)
  const recovered = now.filter(v => v.pass && wasFailing.has(v.agent))
  if (!failed.length && !recovered.length) return null
  const lines = [
    `🧪 Ежедневная проверка агентов: ${now.length - failed.length}/${now.length} прошли.`, // cyrillic-ok: told to the owner
  ]
  for (const v of failed) {
    const detail = misses[v.agent]?.length
      ? ` (${misses[v.agent].join('; ')})`
      : ''
    lines.push(`✗ ${v.agent}: ${v.codes.map(c => WHY[c]).join(', ')}${detail}`)
  }
  for (const v of recovered) lines.push(`✓ ${v.agent}: снова работает`) // cyrillic-ok
  lines.push('Карточки на /agents уже показывают это.') // cyrillic-ok
  return lines.join('\n')
}

export interface RunDeps {
  /** One agent turn with the specialist's voice; yields its events. */
  turn: (c: Canary) => AsyncIterable<Record<string, unknown>>
  previous: () => Promise<LatestVerdict[]>
  record: (verdicts: Verdict[]) => Promise<void>
  tell: (text: string) => Promise<void>
}

/**
 * Every canary, one after another (a turn is expensive; there is no hurry
 * in a daily check). A canary that throws is a failed verdict, never a
 * crashed run. Returns the verdicts.
 */
export async function runAcceptance(
  d: RunDeps,
  canaries: readonly Canary[] = CANARIES
): Promise<Verdict[]> {
  const before = await d.previous().catch(() => [] as LatestVerdict[])
  const verdicts: Verdict[] = []
  const misses: Record<string, string[]> = {}
  for (const c of canaries) {
    const events: Array<Record<string, unknown>> = []
    try {
      for await (const ev of d.turn(c)) events.push(ev)
    } catch (e) {
      /* A turn that threw is an `error` verdict; there was no HTTP here. */
      events.push({ ['тип']: 'ошибка', ['текст']: String(e).slice(0, 120) }) // cyrillic-ok: event names
    }
    const seen = seenOf(events)
    const verdict = verdictFor(c, seen)
    verdicts.push(verdict)
    /* Kept at once: a deploy during the next turn must not lose this one. */
    await d.record([verdict]).catch(() => {})
    const missed = seen.text.trim() ? answerMisses(c.answer, seen.text) : []
    if (missed.length) misses[c.id] = missed
  }
  if (!verdicts.length) return verdicts
  const said = alertText(verdicts, before, misses)
  if (said) await d.tell(said).catch(() => {})
  return verdicts
}
