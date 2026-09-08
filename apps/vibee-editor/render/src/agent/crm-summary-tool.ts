/**
 * THE OVERVIEW. One reading tool that says how the whole correspondence
 * stands: how many people the memory knows, how many wrote, who is waiting
 * for an answer, who is hot, how many per next step, stage and signal, the
 * touches in a window (and how many of them were the seller's own cards),
 * the first five to look at, whether a card hangs, whether Zep is on.
 *
 * The owner asked for it in three words: "сводную как-то надо сделать".
 *
 * Every number is derived the same way the list is: leadCandidates for the
 * next step, stageOf with the crm_leads input for the stage, so what /crm
 * counts is what `/sweep stage=X` selects. Nothing here sends anything.
 */

import type { AgentTool, ToolContext } from './tools'
import { requireOwner } from './telegram-tools'
import { leadCandidates, type LeadCandidate } from './chat-memory'
import {
  touchedSince,
  touchesByLead,
  touchesByKind,
  sellerSendsSince,
  TOUCH_KINDS,
  type TouchKind,
} from './crm-touches'
import { stageOf, waitingOn } from './crm-stages'
import { whoPaid } from './crm-tools'
import { displayOf } from './crm-offer-tool'
import { zepConfigured, zepFlavor } from './zep-memory'

export const NEXT_STEPS = ['reply', 'deliver', 'offer', 'talk', 'wait'] as const
export const STAGES = [
  'client',
  'refused',
  'later',
  'talking',
  'written',
  'winback',
  'new',
] as const
export const SIGNALS = [
  'price',
  'buy',
  'service',
  'urgency',
  'objection',
] as const

/**
 * "Hot": the person's own words were about a price or buying -- either the
 * next step already says offer/deliver, or the words came in the last week.
 * The same predicate the bot's `hot` preset applies, so the count on the
 * /crm button is the number of people the sweep will take.
 */
export function isHot(
  c: { next: string; signals: string[]; daysSinceInbound: number | null },
  recentDays = 7
): boolean {
  if (c.next === 'offer' || c.next === 'deliver') return true
  const asked = c.signals.includes('price') || c.signals.includes('buy')
  return (
    asked && c.daysSinceInbound !== null && c.daysSinceInbound <= recentDays
  )
}

type KindRow = {
  kind: TouchKind
  total: number
  recent: number
  last_at: string | null
}

export interface SummaryCore {
  people_with_messages: number
  messages: { total: number; inbound: number; outbound: number }
  last_inbound_at: string | null
  paid: number
  waiting_for_reply: number
  hot: number
  by_next: Record<string, number>
  by_stage: Record<string, number>
  by_signal: Record<string, number>
  touches_by_kind: Record<
    string,
    { total: number; recent: number; last_at: string | null }
  >
  waiting_by_touch: { ours: number; due: number; theirs: number }
  top: Array<{
    lead: string
    display: string | null
    next: string
    stage: string
    score: number
    days_since_their_last_word: number | null
    waiting_for_reply: boolean
  }>
}

const zeros = (keys: readonly string[]): Record<string, number> =>
  Object.fromEntries(keys.map(k => [k, 0]))

/** Pure: the buckets, from what the memory already computes. */
export function summarize(
  list: LeadCandidate[],
  history: Map<string, Array<{ kind: TouchKind; at: string }>>,
  kindRows: KindRow[],
  paid: Set<string>,
  now: number
): SummaryCore {
  const by_next = zeros(NEXT_STEPS)
  const by_stage = zeros(STAGES)
  const by_signal = zeros(SIGNALS)
  let inbound = 0
  let total = 0
  let waiting = 0
  let hot = 0
  let paidCount = 0
  let lastIn: Date | null = null
  const stages = new Map<string, string>()
  for (const c of list) {
    by_next[c.next] = (by_next[c.next] ?? 0) + 1
    const st = stageOf({
      paid: paid.has(c.lead),
      touches: (c.lastTouch ? [c.lastTouch] : []) as never,
      quietDays: c.daysSinceInbound ?? 999,
    }).stage
    stages.set(c.lead, st)
    by_stage[st] = (by_stage[st] ?? 0) + 1
    for (const s of c.signals) by_signal[s] = (by_signal[s] ?? 0) + 1
    total += c.total
    inbound += c.inbound
    if (c.unanswered) waiting += 1
    if (isHot(c)) hot += 1
    if (paid.has(c.lead)) paidCount += 1
    if (c.lastInboundAt && (!lastIn || c.lastInboundAt > lastIn))
      lastIn = c.lastInboundAt
  }
  const quiet = new Map(list.map(c => [c.lead, c.daysSinceInbound]))
  const waiting_by_touch = { ours: 0, due: 0, theirs: 0 }
  for (const [lead, touches] of history) {
    const w = waitingOn({
      paid: paid.has(lead),
      touches,
      quietDays: quiet.get(lead) ?? null,
      noAnswerAfterDays: 3,
      laterAfterDays: 14,
      now,
    })
    if (w) waiting_by_touch[w.waiting] += 1
  }
  const touches_by_kind: SummaryCore['touches_by_kind'] = {}
  for (const k of TOUCH_KINDS)
    touches_by_kind[k] = { total: 0, recent: 0, last_at: null }
  for (const row of kindRows) {
    touches_by_kind[row.kind] = {
      total: row.total,
      recent: row.recent,
      last_at: row.last_at,
    }
  }
  const top = list
    .filter(c => c.next !== 'wait')
    .slice(0, 5)
    .map(c => ({
      lead: c.lead,
      display: displayOf(c.name, c.username),
      next: c.next,
      stage: stages.get(c.lead) ?? 'new',
      score: c.score,
      days_since_their_last_word: c.daysSinceInbound,
      waiting_for_reply: c.unanswered,
    }))
  return {
    people_with_messages: list.length,
    messages: { total, inbound, outbound: total - inbound },
    last_inbound_at: lastIn ? lastIn.toISOString() : null,
    paid: paidCount,
    waiting_for_reply: waiting,
    hot,
    by_next,
    by_stage,
    by_signal,
    touches_by_kind,
    waiting_by_touch,
    top,
  }
}

const clampDays = (v: unknown): number => {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? Math.min(90, Math.floor(n)) : 7
}

export const CRM_SUMMARY_TOOLS: AgentTool[] = [
  {
    name: 'crm_summary',
    description:
      'Сводка по всей переписке владельца: сколько людей и сообщений в памяти, кто ждёт ответа, ' +
      'горячие, сколько по каждому шагу (reply/deliver/offer/talk/wait), этапам и сигналам, касания ' +
      'за окно (и сколько из них написал продавец), первые пять, висит ли карточка, подключён ли Zep. ' +
      'ЧИТАЮЩИЙ, ничего не отправляет. Начинай с неё, когда спрашивают «как дела с перепиской».',
    parameters: {
      type: 'object',
      properties: {
        days: {
          type: 'integer',
          minimum: 1,
          maximum: 90,
          description: 'окно в днях для «недавних» касаний (по умолчанию 7)',
        },
      },
      additionalProperties: false,
    },
    async handler(a: Record<string, any>, ctx?: ToolContext) {
      requireOwner(ctx)
      const owner = String(ctx?.telegramId)
      const pool = ctx?.pool as never
      const days = clampDays(a?.days)
      const touched = await touchedSince(pool, owner, 60).catch(
        () => new Map<string, { kind: TouchKind; at: string }>()
      )
      // The whole base, not a page: the buckets must count everybody.
      const list = await leadCandidates(pool, owner, {
        limit: 100_000,
        touched,
      })
      const [known, history, kinds, sellerSends, paid] = await Promise.all([
        (
          pool as {
            query: (q: string, p: unknown[]) => Promise<{ rows: any[] }>
          }
        )
          .query(
            `SELECT count(*)::int AS people_known, max(seen_at) AS last_ingest_at
               FROM crm_people WHERE owner_id = $1`,
            [owner]
          )
          .catch(() => ({ rows: [] as any[] })),
        touchesByLead(pool, owner),
        touchesByKind(pool, owner, days),
        sellerSendsSince(pool, owner, days),
        whoPaid().catch(() => new Set<string>()),
      ])
      const now = Date.now()
      const core = summarize(list, history, kinds, paid, now)
      const { pendingFor } = await import('./tg-proposals')
      const pend = pendingFor(owner)
      const lastIngest = known.rows?.[0]?.last_ingest_at
      return {
        window_days: days,
        people_known: Number(known.rows?.[0]?.people_known ?? 0),
        last_ingest_at: lastIngest ? new Date(lastIngest).toISOString() : null,
        ...core,
        seller_sends_recent: sellerSends,
        pending_card: pend
          ? {
              id: pend.id,
              action: pend.action,
              target: pend.target,
              age_minutes: Math.max(
                0,
                Math.round((now - pend.createdAt) / 60_000)
              ),
            }
          : null,
        zep: zepConfigured() ? zepFlavor() : 'не подключён',
        how_to_read:
          'waiting_for_reply — по сообщениям (его слово новее нашего); waiting_by_touch — по касаниям ' +
          '(ours: он ответил, мы молчим; due: просил позже, пора; theirs: мы написали, ответа нет 3 дня). ' +
          'hot — сам говорил о цене или покупке. last_ingest_at — когда память обходила диалоги; зеркало ' +
          'личных ответов его не двигает. seller_sends_recent — сколько из «написали» ушло из карточек ' +
          'продавца. offer/deliver только у тех, кто САМ спрашивал цену. Не предлагай оплату первым. ' +
          'Выборочно: crm_leads limit 50 и отбор по next/stage/signals/paid/days_since_their_last_word.',
      }
    },
  },
]
