import { logger } from '@/utils/logger'
import type { Telegraf } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { спроситьАгента, recordTurns, type ОтветАгента } from './trinityAgent' // cyrillic-ok: pre-existing identifiers
import { proposalCard, rememberCard, cardLeadOf } from './telegramProposals'
import {
  SWEEP_HEAD,
  SWEEP_RULES,
  SWEEP_TAIL,
  SYNTAX,
  parseSweepArgs,
  filterRows,
  itemsFromRows,
  itemsFromChats,
  scopedPrompt,
  itemMarker,
  progressLine,
  presetOf,
  PRESET_CAPS,
  PRESET_NOTES,
  type ScopeItem,
} from './crmSweepScope'
import { cardMenuRows, hubRows } from '@/navigation/helpers/crmMenu'
import {
  buildPlanText,
  planKeyboard,
  planDue,
  planFingerprint,
  planMarker,
  localDayKey,
  isStale,
  PLAN_MARKER_PREFIX,
} from './crmPlan'
import { ADMIN_IDS_ARRAY } from '@/config'
import { fetchLeadRows, callTool } from './modelSwitch'
import { noteSweepToHive } from './hiveNote'
import { Markup } from 'telegraf'

/**
 * THE SELLER THAT WORKS WITHOUT BEING ASKED.
 *
 * Every N minutes the bot runs one agent turn for the owner with a fixed
 * brief: refresh the correspondence memory, look at who is waiting or
 * warm, and prepare AT MOST ONE thing -- a reply, an offer, or a delivered
 * service. Whatever it prepares arrives in the owner's private chat as the
 * same card the owner would get by asking, with the same two buttons, from
 * the same bot -- so a press goes through the same confirm path. The agent
 * never sends anything itself; that rule does not change because nobody
 * was watching.
 *
 * Lives in the bot, not the render service, for one reason found the hard
 * way: the render service's bot token is not one of the farm's tokens, so
 * a card pushed from there would come from a bot whose buttons nobody
 * handles.
 */
export type Draft = NonNullable<ОтветАгента['proposal']> // cyrillic-ok: pre-existing identifiers

export interface SweepDeps {
  ask: (telegramId: string, text: string) => Promise<ОтветАгента> // cyrillic-ok: pre-existing identifiers
  ingest: (telegramId: string) => Promise<unknown>
  push: (telegramId: string, draft: Draft) => Promise<void>
  record?: (
    telegramId: string,
    turns: Array<{ role: 'user' | 'assistant'; content: string }>
  ) => Promise<unknown>
  /**
   * The crm_leads rows, fetched by the sweep itself (see LOOK FIRST in
   * sweepOnce). Absent: the model is asked to look, as before.
   */
  leads?: (telegramId: string) => Promise<Array<Record<string, unknown>>>
  now?: () => number
}

export type SweepOutcome =
  | { did: 'idle'; why: string }
  | { did: 'held'; why: string }
  | { did: 'card'; why: string; id: string }
  | { did: 'busy'; why: string }
  | { did: 'failed'; why: string }

/** The brief. One proposal at most, nothing sent, memory first. */
export const SWEEP_PROMPT = SWEEP_HEAD + SWEEP_RULES + SWEEP_TAIL

/** How long a pushed card keeps the next sweep from evicting it. */
export const HOLD_MS_DEFAULT = 120 * 60_000
/**
 * A card made by a PRESS is held only as long as the render keeps the draft
 * alive (ten minutes): the owner is at the keyboard and a stale hold would
 * answer "held" to somebody who just asked. The timer keeps the long hold.
 */
export const MENU_HOLD_MS = 10 * 60_000

export interface SweepOpts {
  holdMs?: number
  /** The brief; the generic one when absent. */
  prompt?: string
  /** false: skip the memory refresh (a scoped item after the first). */
  ingest?: boolean
  /** The user-turn marker written to the transcript. */
  label?: string
}
/** The render's ingest tool may walk dozens of dialogs; it is not quick. */
const INGEST_TIMEOUT_MS = 170_000

/*
 * ONE HOLD PER SELLER, NOT ONE FOR EVERYBODY.
 *
 * These were three module-level variables, and ADMIN_IDS names more than one
 * person. `runProactiveTickAll` walks every connected seller inside a single
 * tick, so the FIRST of them to get a card set `lastPushAt` -- and every other
 * seller was answered `held` for the next two hours, about a card they cannot
 * see and cannot press. `running` did the same for `busy`.
 *
 * Production, 2026-09-16 07:02:19, two lines in one second:
 *
 *   [crm-proactive] sweep {"did":"card"}
 *   [crm-proactive] sweep {"did":"held","why":"карточка ещё ждёт нажатия"}
 *
 * That is two sellers in one tick: one served, one refused on the other's
 * card. main has already keyed the FAILURE streak by owner (#2448); this is
 * the same correction for the state that decides whether a sweep runs at all.
 */
interface SweepState {
  running: boolean
  runningSince: number
  lastPushAt: number
  ingestFailStreak: number
  /** Cards pushed to this owner that no press has answered. */
  unpressed: number
}

// owner-scope: the key IS the owner
const sweepState = new Map<string, SweepState>()

function stateOf(owner: string): SweepState {
  const key = String(owner)
  let st = sweepState.get(key)
  if (!st) {
    st = {
      running: false,
      runningSince: 0,
      lastPushAt: 0,
      ingestFailStreak: 0,
      unpressed: 0,
    }
    sweepState.set(key, st)
  }
  return st
}

/*
 * A CARD NOBODY PRESSES COSTS MONEY, SO ASK LESS OFTEN.
 *
 * Measured in the hive journal on 2026-09-16: forty-one photo drafts in five
 * days carried the line "the picture was made, but not sent" -- two cards in
 * three were images the provider had already billed us for, replaced unseen.
 * Preparing them at the same rate into the same silence is the expensive half
 * of that.
 *
 * So the hold grows once an owner has left three in a row unanswered: two
 * hours, then four, eight, sixteen, capped at a day. A single press resets it
 * -- the backoff is about silence, not about punishment, and an owner who
 * comes back gets the next card at the next tick.
 */
export const UNPRESSED_BEFORE_BACKOFF = 3
export const BACKOFF_CAP_MS = 24 * 60 * 60_000

export function holdFor(unpressed: number, base = HOLD_MS_DEFAULT): number {
  const over = Math.max(
    0,
    Math.trunc(unpressed) - (UNPRESSED_BEFORE_BACKOFF - 1)
  )
  if (over === 0) return base
  return Math.min(base * 2 ** over, BACKOFF_CAP_MS)
}
/*
 * A SWEEP THAT NEVER CAME BACK IS NOT "BUSY" (CRM audit 2026-09-12, P1 #3).
 *
 * The `running` flag was cleared only by `finally`; a history fetch that
 * hangs without a FIN kept it set forever, and every later tick answered
 * `busy` -- logged as info, skipped by the hive note. So anything older than
 * the longest HONEST sweep is a hang: the flag is released with an error in
 * the log and the tick proceeds.
 *
 * THE ARITHMETIC, RECOMPUTED 2026-09-16. This comment used to read "ingest
 * (170 s) plus two model calls (2 x 180 s)" = 530 s, and the ten-minute
 * ceiling was set from it. That sum went stale twice over:
 *
 *   ingest           INGEST_TIMEOUT_MS      170 s  (crm_ingest_chats)
 *   crm_leads        TOOL_TIMEOUT_MS        170 s  (modelSwitch, added later)
 *   model turn       agent turn ceiling     180 s  (trinityAgent)
 *   transport retry  agent turn ceiling     180 s  (once per sweep, below)
 *   no-tools retry   agent turn ceiling     180 s
 *                                          ------
 *                                           880 s = 14 min 40 s
 *
 * An honest but slow sweep therefore tripped a ten-minute check, which pages
 * ("sweep stuck, releasing the flag") and then FALLS THROUGH to start a
 * second concurrent sweep -- a false alarm that also doubles the work. Fifteen
 * minutes clears the real worst case with room for the push.
 */
export const STUCK_SWEEP_MS = 15 * 60_000
/*
 * MEMORY THAT STOPPED REFRESHING IS A FAILURE, NOT A WARNING (P1 #4).
 *
 * A revoked MTProto session is a permanent state, not a FLOOD_WAIT: the
 * render throws every time, the bot used to warn every time and sweep on
 * memory frozen at the moment the session died -- for months, silently.
 * The first two failures still sweep on stale memory (a hiccup must not
 * silence a person who waited since yesterday); the third in a row and
 * every one after it is reported as `failed`, which reaches the owner
 * through the alert channel and the hive journal with the reconnect hint.
 */
export const INGEST_FAILURES_BEFORE_FAILED = 3

/**
 * `[[Подпись|tg_send]]` -- the whole answer is one button marker whose id is
 * a tool's name (or a word from the brief). Seen in production 2026-09-08,
 * -09 and -10 with crm_leads, no_one_available, reply, can and tg_send.
 * Returns the name, or null when the answer is anything else.
 */
export function namedToolInsteadOfCalling(text: string): string | null {
  const m = new RegExp('^\\[\\[[^\\]|]*\\|([\\w:-]+)\\]\\]$').exec(text.trim())
  return m ? m[1] : null
}

/** Appended to the brief for the one retry after a no-tools answer. */
export const SWEEP_RETRY_NOTE =
  ' ВНИМАНИЕ: предыдущий ответ отклонён — ты не вызвал ни одного инструмента. ' +
  'Шаг 1 (crm_leads) обязателен ВСЕГДА, даже чтобы ответить «тихо»: без него ' +
  'ответ не засчитывается. Маркеры вида [[Подпись|...]] здесь не работают — ' +
  'не пиши их. Сначала вызови crm_leads, потом ответь одной строкой.'

/** The retry note when the sweep already fetched the candidates itself. */
export const SWEEP_RETRY_NOTE_LOOKED =
  ' ВНИМАНИЕ: предыдущий ответ отклонён — ты не вызвал ни одного инструмента. ' +
  'Кандидаты уже даны выше, crm_leads вызывать не нужно. Возьми первого с next не wait, ' +
  'вызови по нему crm_lead_context и подготовь ровно одно действие. ' +
  'Маркеры вида [[Подпись|...]] здесь не работают — не пиши их.'

/** How many rows the sweep hands to the model; the brief says "limit 5". */
export const LOOK_LIMIT = 5

/** A row that is worth a turn: somebody whose forecast step is not "wait". */
export const isDue = (c: Record<string, unknown>): boolean =>
  typeof c.next === 'string' && c.next !== '' && c.next !== 'wait'

/**
 * The candidates, appended to the brief so step 1 is already done. One line
 * per row, the fields the brief reasons about; nothing else from the row.
 */
export function leadsNote(rows: Array<Record<string, unknown>>): string {
  const lines = rows.slice(0, LOOK_LIMIT).map(c => {
    const who = c.display
      ? `${String(c.display)} (${String(c.lead ?? '')})`
      : String(c.lead ?? '')
    return `- ${who}: next=${String(c.next ?? '')}`
  })
  return (
    ' ШАГ 1 УЖЕ ВЫПОЛНЕН: crm_leads вернул ' +
    `${rows.length} кандидат(ов), первые ${lines.length}:\n` +
    lines.join('\n') +
    '\nНачинай с шага 2 (crm_lead_context по первому, у кого next не wait).'
  )
}

// The field holding the tool names has a Russian identifier on the existing
// type. Read through a string key: a literal is allowed where an identifier
// is not, and it keeps the callers free of a suppression marker that prettier
// would move off its line.
function toolsOf(answer: ОтветАгента): string[] {
  // cyrillic-ok: pre-existing identifiers
  return (
    (answer as unknown as Record<string, string[] | undefined>)[
      'инструменты'
    ] ?? []
  )
}

/**
 * Consecutive failed sweeps, for the alert channel. The first failure and
 * every sixth after it (three hours at the default cadence) go out as errors;
 * the ones between are warnings, so a stuck model is reported, not
 * broadcast twice an hour. Recovery is logged once, with the count. THAT RULE
 * IS UNCHANGED -- it is the part of this function that works.
 *
 * WHAT THE COUNT MEANT BEFORE, AND WHY IT WAS A LIE (production 2026-09-16).
 *
 * The owner's phone showed
 *
 *   09:00:29 [ERROR] sweep FAILED {"why":"terminated","consecutive":1}
 *   09:01:15 [WARN]  sweep FAILED {"why":"terminated","consecutive":2}
 *
 * and read as "it failed, then failed again". It was not: `runProactiveTickAll`
 * sweeps the sellers of ONE tick in turn (the owner, then @playom), and a
 * single module-level counter shared by all of them turned two people failing
 * once each into one person failing twice. The count is now kept PER SELLER,
 * so it answers the question the owner is actually asking -- how long has THIS
 * account been broken.
 *
 * Two smaller lies went with it:
 *   - `held` and `busy` reset the streak. Nothing was attempted in either:
 *     a card is still waiting, or a run overlapped. Clearing a week-long
 *     outage because a card sat unpressed -- and printing "sweep recovered"
 *     to say so -- is a false all-clear. They no longer touch the streak.
 *   - the counter is process memory, so the first failure after any deploy is
 *     always `consecutive: 1` at ERROR. That cannot be fixed here, so the
 *     alert now says `sinceProcessStart: true` rather than implying history it
 *     does not have.
 */
const failStreaks = new Map<string, number>()
/** The key used when a caller does not name the seller. */
const NO_OWNER = '-'
export function reportSweepOutcome(
  r: SweepOutcome,
  owner?: string
): 'error' | 'warn' | 'info' {
  const key = owner ? String(owner) : NO_OWNER
  if (r.did === 'failed') {
    const streak = (failStreaks.get(key) ?? 0) + 1
    failStreaks.set(key, streak)
    const level = streak === 1 || streak % 6 === 0 ? 'error' : 'warn'
    logger[level]('[crm-proactive] sweep FAILED', {
      did: r.did,
      why: r.why,
      owner: key,
      consecutive: streak,
      sinceProcessStart: true,
    })
    return level
  }
  // Nothing was attempted: not a recovery, not a failure, not evidence.
  if (r.did === 'held' || r.did === 'busy') {
    logger.info('[crm-proactive] sweep', { did: r.did, why: r.why, owner: key })
    return 'info'
  }
  const had = failStreaks.get(key) ?? 0
  if (had) {
    logger.info('[crm-proactive] sweep recovered', {
      owner: key,
      afterFailures: had,
    })
    failStreaks.delete(key)
  }
  logger.info('[crm-proactive] sweep', { did: r.did, why: r.why, owner: key })
  return 'info'
}

/**
 * A press on the card -- either button -- frees the next sweep, and moves a
 * scoped sweep to its next person when the pressed card was the one it
 * waited for (a press on some other, older card frees the hold but does not
 * skip anybody).
 */
export function noteResolved(owner?: string, cardId?: string): void {
  // Whose hold to free is known from the press: a callback always carries the
  // person who pressed. Without one nothing is freed -- clearing every owner's
  // hold on an anonymous press is exactly the shared behaviour this replaces.
  if (owner) {
    const st = stateOf(String(owner))
    st.lastPushAt = 0
    st.unpressed = 0
  }
  const s = owner ? scopes.get(String(owner)) : undefined
  if (!s || !s.waiting || s.inFlight) return
  if (s.waiting.kind === 'card') {
    if (cardId && cardId !== s.waiting.id) return
    s.cursor += 1
  }
  s.waiting = null
  s.lastActivityAt = Date.now()
  void advanceScope(String(owner))
}

/** For tests. */
export function resetProactiveForTests(): void {
  sweepState.clear()
  failStreaks.clear()
}

/** For tests: pretend THIS owner's sweep has been running since `since`. */
export function markRunningForTests(since: number, owner: string): void {
  const st = stateOf(owner)
  st.running = true
  st.runningSince = since
}

/**
 * A DEAD WIRE IS NOT A BAD ANSWER (production 2026-09-16).
 *
 * The owner's phone received one word, twice in two minutes: `terminated`.
 * Nothing in this repository ever writes that word -- it is undici's message
 * for one specific event, and the catch-all at the bottom of `sweepOnce`
 * copied it into `why` verbatim. Reproduced on node v22.22.0, which is what
 * the deploy runs:
 *
 *   socket dies mid-body      -> TypeError "terminated"
 *                                (cause "other side closed", UND_ERR_SOCKET)
 *   socket dies before headers-> TypeError "fetch failed"
 *   our own AbortController   -> DOMException "This operation was aborted"
 *
 * So `terminated` proves the render answered 200, began the NDJSON agent
 * stream, and then dropped the connection half-way through the body. The
 * sweep did NOT time out at the model (that is the third message) and the
 * model did not refuse. Told apart from "the model produced junk" because the
 * two deserve different words in the owner's alert, and because only this one
 * is worth a second attempt: when the wire dies nothing has been delivered to
 * anybody, so re-asking cannot double-send.
 */
export function isTransportDeath(e: unknown): boolean {
  const cause = (e as { cause?: { code?: unknown } } | null | undefined)?.cause
  const code = typeof cause?.code === 'string' ? cause.code : ''
  if (code.startsWith('UND_ERR_') || code === 'ECONNRESET' || code === 'EPIPE')
    return true
  const message = e instanceof Error ? e.message : String(e ?? '')
  // trinityAgent re-throws the raw undici failure wrapped in a sentence that
  // names the upstream and the call, so the bare `cause` no longer survives.
  // Match that sentence too, or the wrapper would make the retry unreachable.
  if (message.startsWith('the agent stream broke')) return true
  return (
    message === 'terminated' ||
    message === 'fetch failed' ||
    message === 'socket hang up'
  )
}

/**
 * Who the tick already knew was waiting, for the alert. The no-tools branch
 * has said this since 2026-09-13; the catch-all said nothing at all, so a
 * transport death reached the owner without naming the customer it stranded.
 */
function waitingClause(looked: Array<Record<string, unknown>> | null): string {
  const due = looked?.find(isDue)
  return due
    ? `ждёт ${String(due.display ?? due.lead ?? '?')} (next=${String(due.next)}), `
    : ''
}

export async function sweepOnce(
  ownerId: string,
  deps: SweepDeps,
  opts: SweepOpts = {}
): Promise<SweepOutcome> {
  const startedAt = deps.now?.() ?? Date.now()
  // WHOSE sweep. Everything below reads and writes THIS seller's state.
  const st = stateOf(ownerId)
  if (st.running) {
    if (st.runningSince && startedAt - st.runningSince > STUCK_SWEEP_MS) {
      logger.error('[crm-proactive] sweep stuck, releasing the flag', {
        owner: String(ownerId),
        stuckForMs: startedAt - st.runningSince,
      })
    } else {
      return { did: 'busy', why: 'предыдущий обход ещё идёт' }
    }
  }
  st.running = true
  st.runningSince = startedAt
  /*
   * Hoisted out of the `try` ON PURPOSE: the catch-all at the bottom needs
   * them to say who was left waiting and where the sweep died. Before
   * 2026-09-16 both were inside, so the alert was a bare error message.
   */
  let looked: Array<Record<string, unknown>> | null = null
  let stage = 'подготовка'
  let transportRetried = false
  /*
   * ONE RETRY, AND ONLY FOR A DEAD WIRE.
   *
   * A stream that died mid-body delivered nothing: no card was pushed, no
   * message was sent, the owner saw nothing. Re-asking is therefore the one
   * retry in this file that cannot double-send -- and it turns a thirty-minute
   * hole for a waiting customer into a few extra seconds. The budget is ONE
   * PER SWEEP, shared by the main turn and the no-tools retry: a second dead
   * wire is not a hiccup, it is an outage, and it must reach the owner as
   * `failed` rather than be retried into silence. The recovery itself is a
   * warning, not an alert -- the alert is for the failure it prevented.
   */
  const ask = async (text: string): ReturnType<SweepDeps['ask']> => {
    try {
      return await deps.ask(ownerId, text)
    } catch (e) {
      if (transportRetried || !isTransportDeath(e)) throw e
      transportRetried = true
      logger.warn(
        '[crm-proactive] agent stream died mid-body, asking once more',
        {
          owner: ownerId,
          upstream: BASE,
          stage,
          error: e instanceof Error ? e.message : String(e),
        }
      )
      return await deps.ask(ownerId, text)
    }
  }
  try {
    const now = startedAt
    // A scoped run passes its own short hold; otherwise the wait grows with
    // the silence, because a card nobody presses was drawn at a real cost.
    const holdMs = opts.holdMs ?? holdFor(st.unpressed)
    if (st.lastPushAt && now - st.lastPushAt < holdMs) {
      return { did: 'held', why: 'карточка ещё ждёт нажатия владельца' }
    }
    stage = 'обновление памяти'
    try {
      if (opts.ingest !== false) {
        await deps.ingest(ownerId)
        st.ingestFailStreak = 0
      }
    } catch (e) {
      st.ingestFailStreak += 1
      const error = e instanceof Error ? e.message : String(e)
      if (st.ingestFailStreak >= INGEST_FAILURES_BEFORE_FAILED) {
        return {
          did: 'failed',
          why: `память не обновляется ${st.ingestFailStreak} обхода подряд: ${error}. Если сессия Telegram истекла — переподключи её в профиле`,
        }
      }
      // Memory refresh is best-effort: a FLOOD_WAIT on ingest must not
      // silence a person who has been waiting since yesterday.
      logger.warn('[crm-proactive] ingest failed, sweeping on stale memory', {
        error,
        consecutive: st.ingestFailStreak,
      })
    }
    /*
     * LOOK FIRST, THEN ASK.
     *
     * Production 2026-09-09 22:14, after the retry above had been shipped:
     * both turns came back as `[[Подпись|crm_leads]]` -- the model wrote the
     * name of the tool instead of calling it, twice, and the sweep was filed
     * as failed with nobody knowing whether anyone was waiting. Step 1 of the
     * brief is a plain MCP call the bot can make itself. So it does: the rows
     * are fetched here, an empty or all-`wait` list is a real idle without a
     * model turn at all, and a non-empty list goes into the brief so the
     * model starts at step 2. Whether somebody is waiting is no longer a
     * question the model can answer wrongly by not asking it.
     *
     * The generic brief only: a scoped item (opts.prompt) chooses its own
     * candidate and does not read crm_leads. A failing fetch falls back to
     * the old path -- the model looks -- and says so in the log.
     */
    stage = 'crm_leads'
    if (deps.leads && !opts.prompt) {
      try {
        looked = await deps.leads(ownerId)
      } catch (e) {
        logger.warn(
          '[crm-proactive] crm_leads failed, the model looks itself',
          {
            error: e instanceof Error ? e.message : String(e),
          }
        )
      }
    }
    if (looked && !looked.some(isDue)) {
      return {
        did: 'idle',
        why: looked.length
          ? `crm_leads: ${looked.length} кандидат(ов), все next=wait`
          : 'crm_leads: кандидатов нет',
      }
    }
    const brief =
      opts.prompt ?? (looked ? SWEEP_PROMPT + leadsNote(looked) : SWEEP_PROMPT)
    stage = 'ход модели'
    let answer = await ask(brief)
    /*
     * ONE SECOND CHANCE, WITH THE RULE SPELLED OUT.
     *
     * Production 2026-09-09, every thirty minutes from 11:54 to 15:04: the
     * model answered `[[Подпись|no_one_available]]` (or `|reply`) with zero
     * tool calls, and each sweep was filed as failed. The marker is the
     * button syntax the customer-facing prompt teaches; the model took step 4
     * of the brief ("nobody -> say quiet") as permission to skip step 1. A
     * second turn that names the missing call and disowns the marker is
     * cheap; a third would just be the same model in the same mood.
     */
    if (!toolsOf(answer).length && !answer.proposal) {
      stage = 'повторный ход модели'
      answer = await ask(
        brief + (looked ? SWEEP_RETRY_NOTE_LOOKED : SWEEP_RETRY_NOTE)
      )
    }
    // Only a turn that looked is worth remembering: a no-tools answer left
    // in the transcript teaches the next sweep to answer the same way.
    if (toolsOf(answer).length || answer.proposal) {
      void deps.record?.(ownerId, [
        { role: 'user', content: opts.label ?? '[проактивный обход продавца]' },
        { role: 'assistant', content: (answer.текст ?? '').slice(0, 2000) }, // cyrillic-ok: pre-existing identifiers
      ])
    }
    if (answer.proposal) {
      stage = 'карточка владельцу'
      await deps.push(ownerId, answer.proposal)
      st.lastPushAt = now
      // Counted here, cleared by a press in noteResolved: the number IS the
      // run of cards this owner has left unanswered.
      st.unpressed += 1
      return {
        did: 'card',
        why: (answer.текст ?? '').slice(0, 200), // cyrillic-ok: pre-existing identifiers
        id: String(answer.proposal.id),
      }
    }
    /*
     * A SWEEP THAT CALLED NOTHING DID NOT LOOK.
     *
     * Step 1 of the brief is `crm_leads`. A turn that used no tools cannot
     * know whether anybody is waiting, so filing it as 'idle' states as a
     * decision something nobody checked -- the same shape as an empty search
     * reported as "nothing found".
     *
     * Measured in production on 2026-09-08: the model returned fifteen
     * characters, `[[Подпись|can]]`, with zero tool calls, and the sweep
     * recorded `did: idle, why: [[Подпись|can]]`. Read from the outside that
     * is "the seller looked and decided to wait". Nobody looked.
     *
     * The narrow half matters: a turn that DID call tools and then chose to
     * stay quiet is a real idle, and the brief asks for exactly that. Only the
     * no-tools case is a non-answer.
     */
    const toolNames = toolsOf(answer)
    if (!toolNames.length) {
      // With the rows in hand the failure is different in kind: somebody IS
      // waiting (the list had a due row) and nothing was prepared for them.
      const due = looked?.find(isDue)
      const text =
        (answer as unknown as Record<string, string | undefined>)['текст'] ||
        '(пусто)'
      // The model wrote a tool's name where a marker goes -- it named the
      // call instead of making it. Say that, and say WHICH model did it.
      const named = namedToolInsteadOfCalling(text)
      const who = answer.provider ? ` [модель ${answer.provider}]` : ''
      return {
        did: 'failed',
        why:
          (due
            ? `ждёт ${String(due.display ?? due.lead ?? '?')} (next=${String(due.next)}), `
            : '') +
          (named
            ? `модель написала имя инструмента ${named} вместо вызова${who}: `
            : due
              ? `модель ничего не подготовила и не вызвала инструментов${who}: `
              : `модель ответила, не вызвав ни одного инструмента — она не смотрела${who}: `) +
          text.slice(0, 160),
      }
    }

    return { did: 'idle', why: (answer.текст ?? 'тихо').slice(0, 200) } // cyrillic-ok: pre-existing identifiers
  } catch (e) {
    /*
     * THE ALERT MUST NAME SOMETHING (production 2026-09-16).
     *
     * This used to be `why: e.message`, and on the live deploy that produced a
     * push notification whose entire content was the word `terminated`: no
     * upstream, no stage, no customer. Meanwhile the no-tools branch twenty
     * lines above builds a sentence a human can act on. Same treatment here --
     * who was waiting, which step died, and, for a dropped connection, the
     * address that dropped it, because the fix for that one lives in another
     * service and the owner needs to know which.
     */
    const raw = e instanceof Error ? e.message : String(e)
    const dead = isTransportDeath(e)
    return {
      did: 'failed',
      why:
        waitingClause(looked) +
        (dead
          ? `связь с агентом оборвалась на шаге «${stage}» — ${BASE} ответил и закрыл поток на полпути` +
            (transportRetried ? ' (и после повтора тоже)' : '') +
            `: ${raw}`
          : `обход упал на шаге «${stage}»: ${raw}`),
    }
  } finally {
    st.running = false
  }
}

/** The card, drawn by the bot into the owner's private chat. */
export async function pushCard(
  telegram: {
    sendMessage: (
      chatId: string,
      text: string,
      extra?: unknown
    ) => Promise<unknown>
    sendPhoto: (
      chatId: string,
      photo: string,
      extra?: unknown
    ) => Promise<unknown>
  },
  ownerId: string,
  draft: Draft,
  opts: Parameters<typeof proposalCard>[2] = {}
): Promise<void> {
  const card = proposalCard(draft, true, opts)
  // The press will want to know who this was for.
  rememberCard(draft as never)
  if (card.photo) {
    try {
      await telegram.sendPhoto(ownerId, card.photo, {
        caption: card.text,
        reply_markup: card.markup.reply_markup,
      })
      return
    } catch (e) {
      logger.warn('[crm-proactive] photo card failed, sending the link', {
        error: e instanceof Error ? e.message : String(e),
      })
      await telegram.sendMessage(
        ownerId,
        `${card.text}\n\n${card.photo}`,
        card.markup
      )
      return
    }
  }
  await telegram.sendMessage(ownerId, card.text, card.markup)
}

const BASE = 'https://vibee-render-production.up.railway.app'

/** The render's ingest tool, called as the owner over the server key. */
async function ingestViaRender(telegramId: string): Promise<unknown> {
  const key = process.env.RENDER_API_KEY || ''
  if (!key) throw new Error('RENDER_API_KEY не задан')
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), INGEST_TIMEOUT_MS)
  try {
    const r = await fetch(
      `${BASE}/mcp?telegram_id=${encodeURIComponent(telegramId)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Api-Key': key },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'tools/call',
          params: {
            name: 'crm_ingest_chats',
            arguments: { limit: 30, depth: 50 },
          },
        }),
        signal: ac.signal,
      }
    )
    if (!r.ok) throw new Error(`ingest HTTP ${r.status}`)
    return await r.json()
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Wire the sweep to a bot. Returns a stop function. The first run waits two
 * minutes so a redeploy does not fire a turn before the bot is up.
 */
/** The real wiring: the agent, the render's ingest, the bot's own chat. */
export function liveDeps(bot: Telegraf<MyContext>): SweepDeps {
  return {
    // toolsOnly: a model that only talks cannot do step 2 or 3, and its
    // answer would be filed as a failure anyway -- better an honest one.
    ask: (owner, text) => спроситьАгента(owner, text, { toolsOnly: true }), // cyrillic-ok: pre-existing identifiers
    ingest: ingestViaRender,
    push: (owner, draft) =>
      pushCard(bot.telegram as never, owner, draft, {
        // The owner reads the person's history before approving the words,
        // and can send the draft back to be written differently.
        extraRows: ADMIN_IDS_ARRAY.includes(Number(owner))
          ? cardMenuRows(cardLeadOf(draft as never))
          : [],
        rewrite: ADMIN_IDS_ARRAY.includes(Number(owner)),
      }),
    record: recordTurns,
    leads: owner => fetchLeadRows(owner, LOOK_LIMIT),
  }
}

/** One sweep, now, because the owner asked (/sweep). Same guards as the timer. */
export function runSweepNow(
  bot: Telegraf<MyContext>,
  ownerId: string,
  opts: SweepOpts = {}
): Promise<SweepOutcome> {
  return sweepOnce(ownerId, liveDeps(bot), opts)
}

export interface PlanOpts {
  hour: number
  tz: string
}

export interface TickOpts {
  /** The platform owner: always swept, and the identity the sellers list is asked as. */
  ownerId: string
  /**
   * Every seller to sweep, when the environment names them
   * (CRM_PROACTIVE_OWNERS). Absent: asked of the render's `crm_sellers`
   * on each tick, so a person who connects their account today is swept
   * on the next run without a redeploy. Spec: t27 crm-sellers.t27.
   */
  ownerIds?: string[]
  holdMs?: number
  /** The daily plan: at this local hour, in this zone. Absent = no plan. */
  plan?: PlanOpts
}

/** CRM_PROACTIVE_OWNERS as a list: comma or space separated, ids only. */
export function parseOwnerIds(raw: string | undefined): string[] {
  return String(raw ?? '')
    .split(/[\s,;]+/)
    .map(s => s.trim())
    .filter(s => /^\d{5,15}$/.test(s))
}

/**
 * WHO IS SWEPT. The owner first, then every other connected account, each
 * once. Until 2026-09-13 this was one id: @playom had connected on
 * 2026-09-09 and nothing ever swept for them. The list comes from the
 * environment when set, else from the render (asked as the owner, who is
 * the only caller `crm_sellers` admits); when the render is down the
 * owner alone is swept, as before -- a sweep must not stop because a list
 * could not be read.
 */
export async function resolveSellers(
  opts: TickOpts,
  ask: (owner: string) => Promise<string[]> = async owner => {
    const r = await callTool(owner, 'crm_sellers', {}, { timeoutMs: 15_000 })
    const rows = Array.isArray(r?.sellers) ? r.sellers : []
    return rows
      .map((s: { telegram_id?: unknown }) => String(s?.telegram_id ?? ''))
      .filter(Boolean)
  }
): Promise<string[]> {
  const owner = String(opts.ownerId)
  const out = [owner]
  const add = (id: string) => {
    if (id && !out.includes(id)) out.push(id)
  }
  if (opts.ownerIds && opts.ownerIds.length) {
    opts.ownerIds.forEach(add)
    return out
  }
  try {
    ;(await ask(owner)).forEach(add)
  } catch (e) {
    logger.warn('[crm-proactive] sellers list unavailable; owner only', {
      error: e instanceof Error ? e.message : String(e),
    })
  }
  return out
}

export type TickOutcome = SweepOutcome | { did: 'paused'; why: string }

/**
 * ONE TICK FOR EVERY SELLER, in turn. Sequential on purpose: each sweep
 * opens the seller's own Telegram session on the render, and one MTProto
 * connection at a time is the discipline there. A seller whose sweep
 * throws does not stop the next one; the failure is in their row.
 */
export async function runProactiveTickAll(
  bot: Telegraf<MyContext>,
  opts: TickOpts
): Promise<{
  sellers: string[]
  outcomes: Array<{
    owner: string
    outcome: TickOutcome | { did: 'failed'; why: string }
  }>
}> {
  const sellers = await resolveSellers(opts)
  const outcomes: Array<{
    owner: string
    outcome: TickOutcome | { did: 'failed'; why: string }
  }> = []
  for (const owner of sellers) {
    try {
      const outcome = await runProactiveTick(bot, { ...opts, ownerId: owner })
      outcomes.push({ owner, outcome })
    } catch (e) {
      const why = e instanceof Error ? e.message : String(e)
      logger.error('[crm-proactive] tick failed for seller', { owner, why })
      outcomes.push({ owner, outcome: { did: 'failed', why } })
    }
  }
  return { sellers, outcomes }
}

/**
 * ONE TICK OF THE SELLER. The unit both drivers run: the in-process timer
 * (startCrmProactive) and the Inngest cron (functions/crm/crmProactiveSweep).
 * Plan first, then the scoped-queue check, then one sweep, then the hive
 * diary and the alert channel. Returns what happened so the Inngest run
 * trace shows it -- a timer could only log.
 */
export async function runProactiveTick(
  bot: Telegraf<MyContext>,
  opts: TickOpts
): Promise<TickOutcome> {
  const deps = liveDeps(bot)
  const owner = String(opts.ownerId)
  // The plan first, and never deferred: a queue or a card in flight is
  // exactly what the owner wants to see in it.
  if (opts.plan) {
    await maybeSendDailyPlan(bot, owner, opts.plan).catch(e =>
      logger.warn('[crm-plan] failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    )
  }
  const active = scopes.get(owner)
  if (active) {
    const holdMs = opts.holdMs ?? HOLD_MS_DEFAULT
    if (!active.inFlight && Date.now() - active.lastActivityAt > holdMs) {
      dropScope(owner, 'карточка не нажата два часа — обход остановлен')
    } else {
      logger.info('[crm-proactive] paused: scoped sweep active', {
        label: active.label,
        cursor: active.cursor,
      })
      return { did: 'paused', why: `scoped sweep active: ${active.label}` }
    }
  }
  const r = await sweepOnce(owner, deps, { holdMs: opts.holdMs })
  // The diary entry, too: every run that ran is visible in the hive
  // (hiveNote.ts) -- quiet ones included, which the alert channel never was.
  void noteSweepToHive(owner, r)
  /*
   * A FAILED SWEEP IS AN ERROR, NOT A DIARY ENTRY.
   *
   * Every outcome was logged at info, and info does not reach the owner's
   * alert channel. So a model producing junk every thirty minutes looked
   * exactly like a quiet afternoon. The other extreme -- the same failure
   * as a fresh alert twice an hour -- is handled in reportSweepOutcome.
   */
  // Named: one tick sweeps several sellers in turn, and an unattributed
  // alert made two sellers failing once each look like one failing twice.
  reportSweepOutcome(r, owner)
  return r
}

/*
 * THE CARRIER REGISTRY -- how the Inngest cron finds the bot.
 *
 * An Inngest function is a module-level constant; the Telegraf instances are
 * built at startup. The entry point registers the carrier and the owner once
 * the bots are up (index.ts), and the cron reads it on every run. Absent
 * carrier = the bots are not up yet = the run reports 'paused', not an error.
 */
let carrier: { bot: Telegraf<MyContext>; opts: TickOpts } | null = null

export function setCrmCarrier(bot: Telegraf<MyContext>, opts: TickOpts): void {
  carrier = { bot, opts }
  logger.info('[crm-proactive] carrier registered', {
    owner: opts.ownerId,
    bot: bot.botInfo?.username ?? null,
    plan: opts.plan ?? null,
  })
}

export function crmCarrier(): {
  bot: Telegraf<MyContext>
  opts: TickOpts
} | null {
  return carrier
}

export function resetCarrierForTests(): void {
  carrier = null
}

/** Which clock drives the seller: `inngest` (cron function, default) or `timer` (setInterval in-process). */
export type SweepDriver = 'inngest' | 'timer'

export function sweepDriver(env: NodeJS.ProcessEnv = process.env): SweepDriver {
  const v = String(env.CRM_SWEEP_DRIVER ?? 'inngest')
    .trim()
    .toLowerCase()
  return v === 'timer' ? 'timer' : 'inngest'
}

export function startCrmProactive(
  bot: Telegraf<MyContext>,
  opts: TickOpts & { everyMs: number; firstDelayMs?: number }
): () => void {
  const run = () =>
    runProactiveTickAll(bot, opts).catch(e =>
      logger.error('[crm-proactive] tick failed', {
        error: e instanceof Error ? e.message : String(e),
      })
    )
  const first = setTimeout(run, opts.firstDelayMs ?? 120_000)
  const timer = setInterval(run, opts.everyMs)
  logger.info('[crm-proactive] started', {
    owner: opts.ownerId,
    everyMinutes: Math.round(opts.everyMs / 60_000),
    bot: bot.botInfo?.username ?? null,
  })
  return () => {
    clearTimeout(first)
    clearInterval(timer)
  }
}

/*
 * THE SELLER, POINTED AT SOMEBODY -- THE QUEUE.
 *
 * Only one draft can wait for the owner at a time, so a group is worked as a
 * queue: one person, one card, the owner's button, the next person. Idle and
 * failed items move on by themselves; three failures in a row stop the walk;
 * a card that nobody presses for two hours stops it too (the timer checks).
 * State is process memory: a redeploy mid-queue forgets it, and the owner
 * re-issues /sweep -- better than a queue nobody can see.
 */
interface Scope {
  owner: string
  label: string
  items: ScopeItem[]
  cursor: number
  inFlight: boolean
  waiting:
    | null
    | { kind: 'card'; id: string; since: number }
    | { kind: 'foreign' }
  failedInARow: number
  busyAttempts: number
  tally: { card: number; idle: number; failed: number }
  lastActivityAt: number
  deps: SweepDeps
  say: (text: string) => Promise<unknown>
}
const scopes = new Map<string, Scope>()
const BUSY_RETRY_MS = 30_000
// A timer sweep may honestly last as long as STUCK_SWEEP_MS (see the
// arithmetic there: 880 s, after the crm_leads fetch and the one transport
// retry were added). Ten retries of 30 s dropped a scoped sweep that merely
// waited its turn (CRM audit 2026-09-12, P2 #10); thirty covers the ceiling.
const BUSY_RETRY_MAX = 30
const FAILED_IN_A_ROW_MAX = 3

export function activeScope(
  owner: string
): { label: string; cursor: number; total: number } | null {
  const s = scopes.get(String(owner))
  return s ? { label: s.label, cursor: s.cursor, total: s.items.length } : null
}

/** One line for the owner: where the scoped sweep stands, or null. */
export function scopeLine(owner: string): string | null {
  const s = scopes.get(String(owner))
  if (!s) return null
  const at = `${Math.min(s.cursor + 1, s.items.length)} из ${s.items.length}`
  const who = s.items[s.cursor]
  const name = who ? (who.display ? `${who.display}` : who.chat) : ''
  if (s.inFlight) return `Обход «${s.label}»: ${at} · думает по ${name}`
  if (s.waiting?.kind === 'card')
    return `Обход «${s.label}»: ${at} · жду кнопку по ${name} ${Math.round((Date.now() - s.waiting.since) / 60_000)} мин.`
  if (s.waiting?.kind === 'foreign')
    return `Обход «${s.label}»: ${at} · жду прошлую карточку`
  if (s.busyAttempts)
    return `Обход «${s.label}»: ${at} · жду, пока освободится (попытка ${s.busyAttempts} из ${BUSY_RETRY_MAX})`
  return `Обход «${s.label}»: ${at}`
}

export function stopScope(owner: string): string {
  const s = scopes.get(String(owner))
  if (!s) return 'Обхода нет.'
  scopes.delete(String(owner))
  return `Обход «${s.label}» остановлен на ${Math.min(s.cursor + 1, s.items.length)} из ${s.items.length}.`
}

function dropScope(owner: string, why: string): void {
  const s = scopes.get(owner)
  if (!s) return
  scopes.delete(owner)
  void s.say(`Обход «${s.label}»: ${why}`).catch(() => undefined)
}

export function resetScopesForTests(): void {
  scopes.clear()
}

/** Start a scope for this owner; a previous one is replaced and said so. */
export async function startScope(
  owner: string,
  label: string,
  items: ScopeItem[],
  deps: SweepDeps,
  say: (text: string) => Promise<unknown>
): Promise<string> {
  const key = String(owner)
  const old = scopes.get(key)
  if (old) {
    scopes.delete(key)
    await say(
      `Прошлый обход «${old.label}» (${Math.min(old.cursor + 1, old.items.length)} из ${old.items.length}) остановлен.`
    ).catch(() => undefined)
  }
  if (!items.length) return 'Никого не выбрано.'
  const s: Scope = {
    owner: key,
    label,
    items,
    cursor: 0,
    inFlight: false,
    waiting: null,
    failedInARow: 0,
    busyAttempts: 0,
    tally: { card: 0, idle: 0, failed: 0 },
    lastActivityAt: Date.now(),
    deps,
    say,
  }
  scopes.set(key, s)
  void advanceScope(key)
  return (
    `Обход «${label}»: ${items.length} чел. По одному: карточка → твоя кнопка → следующий. ` +
    'Где: /sweep где · остановить: /sweep stop'
  )
}

async function advanceScope(owner: string): Promise<void> {
  const s = scopes.get(owner)
  if (!s || s.inFlight || s.waiting) return
  if (s.cursor >= s.items.length) {
    scopes.delete(owner)
    await s
      .say(
        `Обход «${s.label}» завершён: карточек ${s.tally.card}, тихо ${s.tally.idle}, не вышло ${s.tally.failed}.`
      )
      .catch(() => undefined)
    return
  }
  const item = s.items[s.cursor]
  s.inFlight = true
  s.lastActivityAt = Date.now()
  try {
    await s
      .say(progressLine(s.cursor, s.items.length, item))
      .catch(() => undefined)
    const r = await sweepOnce(owner, s.deps, {
      prompt: scopedPrompt(item),
      ingest: s.cursor === 0,
      label: itemMarker(item),
      holdMs: MENU_HOLD_MS,
    })
    if (!scopes.has(owner)) return
    s.inFlight = false
    s.lastActivityAt = Date.now()
    void noteSweepToHive(owner, r, { label: itemMarker(item) })
    switch (r.did) {
      case 'card':
        s.tally.card += 1
        s.failedInARow = 0
        s.busyAttempts = 0
        s.waiting = { kind: 'card', id: r.id, since: Date.now() }
        return
      case 'idle':
        s.tally.idle += 1
        s.failedInARow = 0
        s.busyAttempts = 0
        await s.say(`тихо: ${r.why}`).catch(() => undefined)
        s.cursor += 1
        return advanceScope(owner)
      case 'failed':
        s.tally.failed += 1
        s.failedInARow += 1
        s.busyAttempts = 0
        await s.say(`не вышло: ${r.why}`).catch(() => undefined)
        if (s.failedInARow >= FAILED_IN_A_ROW_MAX) {
          dropScope(
            owner,
            `три раза подряд не вышло — обход остановлен на ${s.cursor + 1} из ${s.items.length}`
          )
          return
        }
        s.cursor += 1
        return advanceScope(owner)
      case 'held':
        s.waiting = { kind: 'foreign' }
        await s
          .say(
            'карточка ещё ждёт нажатия — нажми на ней «Отправить» или «Отмена», и я продолжу'
          )
          .catch(() => undefined)
        return
      case 'busy':
        s.busyAttempts += 1
        if (s.busyAttempts > BUSY_RETRY_MAX) {
          dropScope(
            owner,
            'обход уже идёт слишком долго — остановил; повтори /sweep позже'
          )
          return
        }
        if (s.busyAttempts === 1)
          await s
            .say('Обход уже идёт, подожду и продолжу сам.')
            .catch(() => undefined)
        setTimeout(() => void advanceScope(owner), BUSY_RETRY_MS)
        return
    }
  } catch (e) {
    s.inFlight = false
    dropScope(owner, `ошибка: ${e instanceof Error ? e.message : String(e)}`)
  }
}

/**
 * /sweep with arguments, and the summary's scope buttons: parse, select,
 * start. Returns the line the owner reads. The generic sweep (no arguments)
 * is not handled here -- the command runs it directly.
 */
export async function startScopedSweep(
  bot: Telegraf<MyContext>,
  owner: string,
  args: string[]
): Promise<string> {
  const spec = parseSweepArgs(args)
  if (spec.kind === 'generic') return SYNTAX
  if (spec.kind === 'error') return spec.message
  if (spec.kind === 'status') return scopeLine(owner) ?? 'Обхода нет.'
  if (spec.kind === 'stop') return stopScope(owner)
  const { fetchLeadRows } = await import('./modelSwitch')
  /*
   * A single preset is a SEGMENT: the render selects it over the whole base,
   * so a quiet warm-up or a client to win back is reachable past the
   * hundreds of unanswered at the top; and one press takes the segment's
   * cap, not ten, unless the owner typed limit=.
   */
  const preset = spec.kind === 'filter' ? presetOf(spec.predicates) : null
  const rows = await fetchLeadRows(
    owner,
    50,
    preset ? { segment: preset } : {}
  ).catch(() => [])
  const limit =
    spec.kind === 'filter' && preset && !spec.limitGiven
      ? PRESET_CAPS[preset]
      : spec.kind === 'filter'
        ? spec.limit
        : 50
  const items =
    spec.kind === 'list'
      ? itemsFromChats(spec.chats, rows as never)
      : itemsFromRows(filterRows(rows as never, spec.predicates, limit), {
          ...(preset === 'due' || preset === 'winback'
            ? { nextOverride: 'talk' }
            : {}),
          ...(preset && PRESET_NOTES[preset]
            ? { note: PRESET_NOTES[preset] }
            : {}),
        })
  if (!items.length) return `Никого не подходит под «${spec.label}».`
  const say = (text: string) =>
    bot.telegram.sendMessage(owner, text, Markup.inlineKeyboard(hubRows()))
  const line = await startScope(owner, spec.label, items, liveDeps(bot), say)
  return rows.length >= 50 && spec.kind === 'filter'
    ? line + ' (смотрю верхние 50 по баллу)'
    : line
}

/*
 * THE DAILY PLAN.
 *
 * Built from crm_summary(days=1) by plain code, pushed once per local day
 * from the timer tick inside the window [hour, hour+11), or on /plan at any
 * time. Dedupe: process memory first; after a redeploy the marker written
 * to the shared transcript says whether today's plan already went out.
 */
const planSentOn = new Map<string, { day: string; fingerprint: string }>()

export function resetPlanForTests(): void {
  planSentOn.clear()
}

export async function buildPlan(
  owner: string,
  now = Date.now(),
  tz = 'Europe/Moscow'
): Promise<{
  text: string
  keyboard: ReturnType<typeof planKeyboard>
  fingerprint: string
}> {
  const { fetchSummary } = await import('./crmSummary')
  const s = await fetchSummary(owner, 1)
  const text = buildPlanText(s, scopeLine(owner), now, tz)
  const keyboard = planKeyboard(s, {
    scopeActive: Boolean(activeScope(owner)),
    stale: isStale(s, now),
  })
  return { text, keyboard, fingerprint: planFingerprint(s) }
}

async function alreadyPlannedToday(
  owner: string,
  dayKey: string
): Promise<boolean> {
  const mem = planSentOn.get(owner)
  if (mem?.day === dayKey) return true
  try {
    const { fetchHistory } = await import('./trinityAgent')
    const turns = await fetchHistory(owner)
    return turns.some(
      t =>
        t.role === 'user' &&
        String(t.content ?? '').startsWith(planMarker(dayKey))
    )
  } catch {
    return false
  }
}

/** Send the plan now, whatever the clock says (/plan and the plan button). */
export async function sendPlanNow(
  bot: Telegraf<MyContext>,
  owner: string,
  o: { why: 'timer' | 'command'; now?: number; tz?: string } = {
    why: 'command',
  }
): Promise<{ text: string; keyboard: ReturnType<typeof planKeyboard> }> {
  const now = o.now ?? Date.now()
  const tz = o.tz ?? 'Europe/Moscow'
  const plan = await buildPlan(owner, now, tz)
  const dayKey = localDayKey(now, tz)
  await bot.telegram.sendMessage(owner, plan.text, plan.keyboard)
  planSentOn.set(owner, { day: dayKey, fingerprint: plan.fingerprint })
  void recordTurns(owner, [
    { role: 'user', content: `${planMarker(dayKey)} ${o.why}` },
    { role: 'assistant', content: plan.text.slice(0, 2000) },
  ]).catch(() => undefined)
  logger.info('[crm-plan] sent', { owner, why: o.why, day: dayKey })
  return plan
}

export async function maybeSendDailyPlan(
  bot: Telegraf<MyContext>,
  owner: string,
  plan: PlanOpts,
  now = Date.now()
): Promise<'sent' | 'not-due' | 'already'> {
  const dayKey = localDayKey(now, plan.tz)
  const mem = planSentOn.get(owner)
  if (
    !planDue({ now, tz: plan.tz, hour: plan.hour, sentDay: mem?.day ?? null })
  )
    return 'not-due'
  if (await alreadyPlannedToday(owner, dayKey)) {
    planSentOn.set(owner, { day: dayKey, fingerprint: mem?.fingerprint ?? '' })
    return 'already'
  }
  await sendPlanNow(bot, owner, { why: 'timer', now, tz: plan.tz })
  return 'sent'
}

export { PLAN_MARKER_PREFIX }
