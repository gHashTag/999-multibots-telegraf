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
import { cardMenuRows, hubRow } from '@/navigation/helpers/crmMenu'
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
import { fetchLeadRows } from './modelSwitch'
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

let running = false
let lastPushAt = 0

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
 * broadcast twice an hour. Recovery is logged once, with the count.
 */
let failStreak = 0
export function reportSweepOutcome(r: SweepOutcome): 'error' | 'warn' | 'info' {
  if (r.did === 'failed') {
    failStreak += 1
    const level = failStreak === 1 || failStreak % 6 === 0 ? 'error' : 'warn'
    logger[level]('[crm-proactive] sweep FAILED', {
      did: r.did,
      why: r.why,
      consecutive: failStreak,
    })
    return level
  }
  if (failStreak) {
    logger.info('[crm-proactive] sweep recovered', {
      afterFailures: failStreak,
    })
    failStreak = 0
  }
  logger.info('[crm-proactive] sweep', { did: r.did, why: r.why })
  return 'info'
}

/**
 * A press on the card -- either button -- frees the next sweep, and moves a
 * scoped sweep to its next person when the pressed card was the one it
 * waited for (a press on some other, older card frees the hold but does not
 * skip anybody).
 */
export function noteResolved(owner?: string, cardId?: string): void {
  lastPushAt = 0
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
  running = false
  lastPushAt = 0
  failStreak = 0
}

export async function sweepOnce(
  ownerId: string,
  deps: SweepDeps,
  opts: SweepOpts = {}
): Promise<SweepOutcome> {
  if (running) return { did: 'busy', why: 'предыдущий обход ещё идёт' }
  running = true
  try {
    const now = deps.now?.() ?? Date.now()
    const holdMs = opts.holdMs ?? HOLD_MS_DEFAULT
    if (lastPushAt && now - lastPushAt < holdMs) {
      return { did: 'held', why: 'карточка ещё ждёт нажатия владельца' }
    }
    try {
      if (opts.ingest !== false) await deps.ingest(ownerId)
    } catch (e) {
      // Memory refresh is best-effort: a FLOOD_WAIT on ingest must not
      // silence a person who has been waiting since yesterday.
      logger.warn('[crm-proactive] ingest failed, sweeping on stale memory', {
        error: e instanceof Error ? e.message : String(e),
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
    let looked: Array<Record<string, unknown>> | null = null
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
    let answer = await deps.ask(ownerId, brief)
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
      answer = await deps.ask(
        ownerId,
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
      await deps.push(ownerId, answer.proposal)
      lastPushAt = now
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
    return { did: 'failed', why: e instanceof Error ? e.message : String(e) }
  } finally {
    running = false
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
  opts: {
    extraRows?: Parameters<typeof proposalCard>[2] extends infer O
      ? O extends { extraRows?: infer R }
        ? R
        : never
      : never
  } = {}
): Promise<void> {
  const card = proposalCard(draft, true, { extraRows: opts.extraRows })
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
        // The owner reads the person's history before approving the words.
        extraRows: ADMIN_IDS_ARRAY.includes(Number(owner))
          ? cardMenuRows(cardLeadOf(draft as never))
          : [],
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

export function startCrmProactive(
  bot: Telegraf<MyContext>,
  opts: {
    ownerId: string
    everyMs: number
    holdMs?: number
    firstDelayMs?: number
    /** The daily plan: at this local hour, in this zone. Absent = no plan. */
    plan?: PlanOpts
  }
): () => void {
  const deps = liveDeps(bot)
  const run = async () => {
    // The plan first, and never deferred: a queue or a card in flight is
    // exactly what the owner wants to see in it.
    if (opts.plan) {
      await maybeSendDailyPlan(bot, String(opts.ownerId), opts.plan).catch(e =>
        logger.warn('[crm-plan] failed', {
          error: e instanceof Error ? e.message : String(e),
        })
      )
    }
    const active = scopes.get(String(opts.ownerId))
    if (active) {
      const holdMs = opts.holdMs ?? HOLD_MS_DEFAULT
      if (!active.inFlight && Date.now() - active.lastActivityAt > holdMs) {
        dropScope(
          String(opts.ownerId),
          'карточка не нажата два часа — обход остановлен'
        )
      } else {
        logger.info('[crm-proactive] paused: scoped sweep active', {
          label: active.label,
          cursor: active.cursor,
        })
        return
      }
    }
    const r = await sweepOnce(opts.ownerId, deps, { holdMs: opts.holdMs })
    // The diary entry, too: every run that ran is visible in the hive
    // (hiveNote.ts) -- quiet ones included, which the alert channel never was.
    void noteSweepToHive(String(opts.ownerId), r)
    /*
     * A FAILED SWEEP IS AN ERROR, NOT A DIARY ENTRY.
     *
     * Every outcome was logged at info, and info does not reach the owner's
     * alert channel. So a model producing junk every thirty minutes looked
     * exactly like a quiet afternoon. The other extreme -- the same failure
     * as a fresh alert twice an hour -- is handled in reportSweepOutcome.
     */
    reportSweepOutcome(r)
  }
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
const BUSY_RETRY_MAX = 10
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
    bot.telegram.sendMessage(owner, text, Markup.inlineKeyboard([hubRow()]))
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
