import { logger } from '@/utils/logger'
import type { Telegraf } from 'telegraf'
import type { MyContext } from '@/interfaces'
import { спроситьАгента, recordTurns, type ОтветАгента } from './trinityAgent' // cyrillic-ok: pre-existing identifiers
import { proposalCard } from './telegramProposals'

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
  now?: () => number
}

export type SweepOutcome =
  | { did: 'card'; why: string }
  | { did: 'idle'; why: string }
  | { did: 'held'; why: string }
  | { did: 'busy'; why: string }
  | { did: 'failed'; why: string }

/** The brief. One proposal at most, nothing sent, memory first. */
export const SWEEP_PROMPT =
  'Проактивный обход продавца (никто не спрашивал — ты работаешь сам). ' +
  'Шаги: 1) crm_leads с limit 5. 2) Возьми первого, у кого next не wait; ' +
  'по нему crm_lead_context. 3) Ровно ОДНО действие: next=reply — короткий ' +
  'ответ по сути его последних слов через tg_send; next=deliver и есть токены — ' +
  'crm_deliver_photo по его просьбе; next=offer — crm_offer. 4) Если кандидатов ' +
  'нет или у первого next=wait — ответь одним словом «тихо» и ничего не готовь. ' +
  'НИЧЕГО НЕ ОТПРАВЛЯЙ САМ: только подготовь; владелец нажмёт кнопку. Ответ — ' +
  'одна строка: кому и что подготовлено.'

/** How long a pushed card keeps the next sweep from evicting it. */
export const HOLD_MS_DEFAULT = 120 * 60_000
/** The render's ingest tool may walk dozens of dialogs; it is not quick. */
const INGEST_TIMEOUT_MS = 170_000

let running = false
let lastPushAt = 0

/** A press on the card -- either button -- frees the next sweep. */
export function noteResolved(): void {
  lastPushAt = 0
}

/** For tests. */
export function resetProactiveForTests(): void {
  running = false
  lastPushAt = 0
}

export async function sweepOnce(
  ownerId: string,
  deps: SweepDeps,
  opts: { holdMs?: number } = {}
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
      await deps.ingest(ownerId)
    } catch (e) {
      // Memory refresh is best-effort: a FLOOD_WAIT on ingest must not
      // silence a person who has been waiting since yesterday.
      logger.warn('[crm-proactive] ingest failed, sweeping on stale memory', {
        error: e instanceof Error ? e.message : String(e),
      })
    }
    const answer = await deps.ask(ownerId, SWEEP_PROMPT)
    void deps.record?.(ownerId, [
      { role: 'user', content: '[проактивный обход продавца]' },
      { role: 'assistant', content: (answer.текст ?? '').slice(0, 2000) }, // cyrillic-ok: pre-existing identifiers
    ])
    if (answer.proposal) {
      await deps.push(ownerId, answer.proposal)
      lastPushAt = now
      return { did: 'card', why: (answer.текст ?? '').slice(0, 200) } // cyrillic-ok: pre-existing identifiers
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
    // The field holding the tool names has a Russian identifier on the
    // existing type. Read through a string key: a literal is allowed where an
    // identifier is not, and it keeps this block free of a suppression marker
    // that prettier would move off its line.
    const toolNames =
      (answer as unknown as Record<string, string[] | undefined>)[
        'инструменты'
      ] ?? []
    if (!toolNames.length) {
      return {
        did: 'failed',
        why:
          'модель ответила, не вызвав ни одного инструмента — она не смотрела: ' +
          (
            (answer as unknown as Record<string, string | undefined>)[
              'текст'
            ] || '(пусто)'
          ).slice(0, 160),
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
  draft: Draft
): Promise<void> {
  const card = proposalCard(draft, true)
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
    ask: спроситьАгента, // cyrillic-ok: pre-existing identifiers
    ingest: ingestViaRender,
    push: (owner, draft) => pushCard(bot.telegram as never, owner, draft),
    record: recordTurns,
  }
}

/** One sweep, now, because the owner asked (/sweep). Same guards as the timer. */
export function runSweepNow(
  bot: Telegraf<MyContext>,
  ownerId: string
): Promise<SweepOutcome> {
  return sweepOnce(ownerId, liveDeps(bot))
}

export function startCrmProactive(
  bot: Telegraf<MyContext>,
  opts: {
    ownerId: string
    everyMs: number
    holdMs?: number
    firstDelayMs?: number
  }
): () => void {
  const deps = liveDeps(bot)
  const run = async () => {
    const r = await sweepOnce(opts.ownerId, deps, { holdMs: opts.holdMs })
    /*
     * A FAILED SWEEP IS AN ERROR, NOT A DIARY ENTRY.
     *
     * Every outcome was logged at info, and info does not reach the owner's
     * alert channel. So a model producing junk every thirty minutes looked
     * exactly like a quiet afternoon.
     */
    if (r.did === 'failed')
      logger.error('[crm-proactive] sweep FAILED', { did: r.did, why: r.why })
    else logger.info('[crm-proactive] sweep', { did: r.did, why: r.why })
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
