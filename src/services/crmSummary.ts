/**
 * THE OVERVIEW, AS THE OWNER READS IT.
 *
 * crm_summary on the render counts; this lays the numbers out the way a
 * salesperson reads a morning brief: who is waiting, who is hot, what the
 * steps and stages look like, what happened in the window, the first five,
 * and whether a card or a scoped sweep is in flight. Every label from the
 * same Russian maps the list uses. Zeros are printed: a zero is information.
 */
import { callTool, NEXT_RU, STAGE_RU, SIGNAL_RU, day } from './modelSwitch'

export type Summary = Record<string, any>

export async function fetchSummary(
  telegramId: string,
  days = 7
): Promise<Summary> {
  return callTool(telegramId, 'crm_summary', { days })
}

/**
 * WHAT HAPPENS BETWEEN A CARD AND A PRESS.
 *
 * MEASURED 2026-09-16: the seller prepared 63 cards in five and a half days
 * and the CRM holds five `written` touches in total. Nobody saw that for five
 * days, and the reason is this screen: it says how many people are at each
 * stage and how many touches exist, and NOTHING about the cards in between.
 *
 * Competitors measured the same day (menus and headline copy, fetched with
 * curl -- their internals are not available to me): amoCRM and Kommo sell a
 * board, Salebot sells sales analytics, TextBack sells cascades. Every one of
 * them makes the funnel a screen. Ours is a screen too -- it just had a hole
 * exactly where this week's number lives.
 *
 * The counts come from the hive journal, which keeps sweeps forever, unlike
 * the Railway log that starts at the last deploy.
 */
export interface CardFlow {
  prepared: number
  dropped: number | null
  giftRefused: number
}

export async function fetchCardFlow(telegramId: string): Promise<CardFlow> {
  const r = await callTool(telegramId, 'hive_events', { limit: 200 })
  const events = Array.isArray((r as { events?: unknown[] })?.events)
    ? (r as { events: Array<Record<string, unknown>> }).events
    : []
  const count = (kind: string): number =>
    events.filter(e => String(e?.kind ?? '') === kind).length
  const dropped = count('card-dropped')
  return {
    prepared: count('sweep-card'),
    /*
     * NULL, NOT ZERO, until the journal can answer. A card that leaves unsent
     * started leaving a line only with the card-journal listener; before it,
     * "0 dropped" would mean "nothing was recorded", and a zero from an
     * unwired counter reads exactly like a zero from a healthy funnel.
     */
    dropped: dropped > 0 ? dropped : null,
    giftRefused: count('gift-refused'),
  }
}

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const when = (iso: unknown): string => {
  if (!iso) return '—'
  const s = String(iso)
  return s.length >= 16 ? s.slice(0, 10) + ' ' + s.slice(11, 16) : day(s)
}
const ago = (d: unknown): string =>
  d === null || d === undefined
    ? 'давно'
    : n(d) === 0
      ? 'сегодня'
      : `${n(d)} дн. назад`

const KIND_RU: Record<string, string> = {
  written: 'написали',
  replied: 'ответил',
  later: 'позже',
  refused: 'отказ',
  bought: 'купил',
}
const KIND_ORDER = ['written', 'replied', 'later', 'refused', 'bought']

/** The text. `scopeLine` is the running scoped sweep, or null. */
/** One line, so the Cyrillic stays inside a literal on a single row. */
function cardFlowLine(
  prepared: number,
  sent: number,
  dropped: number | null
): string {
  const died = dropped === null ? 'неизвестно' : String(dropped) // cyrillic-ok
  return `подготовлено ${prepared} · отправлено ${sent} · умерло ${died}` // cyrillic-ok
}

export function formatSummary(
  s: Summary,
  scopeLine: string | null = null,
  cards: CardFlow | null = null
): string {
  const by = (
    map: Record<string, string>,
    obj: unknown,
    order: string[]
  ): string =>
    order.map(k => `${map[k] ?? k} ${n((obj as any)?.[k])}`).join(' · ')
  const kinds = (s.touches_by_kind ?? {}) as Record<
    string,
    { total?: number; recent?: number }
  >
  const totalLine = KIND_ORDER.map(
    k => `${KIND_RU[k]} ${n(kinds[k]?.total)}`
  ).join(' · ')
  const recentLine = KIND_ORDER.map(k =>
    k === 'written'
      ? `написали ${n(kinds[k]?.recent)} (из продавца ${n(s.seller_sends_recent)})`
      : `${KIND_RU[k]} ${n(kinds[k]?.recent)}`
  ).join(' · ')
  const w = (s.waiting_by_touch ?? {}) as Record<string, number>
  const top = Array.isArray(s.top) ? s.top : []
  const days = n(s.window_days) || 7
  const lines = [
    `Сводка по переписке · окно ${days} дн.`,
    `Людей в памяти: ${n(s.people_known)} (с сообщениями ${n(s.people_with_messages)}) · платили ${n(s.paid)}`,
    `Сообщений: ${n(s.messages?.total)} (от них ${n(s.messages?.inbound)} · от меня ${n(s.messages?.outbound)})`,
    `Последнее входящее: ${day(s.last_inbound_at)} · память обходила диалоги: ${when(s.last_ingest_at)} · Zep: ${s.zep ?? '?'}`,
    '',
    `Ждут ответа (по сообщениям): ${n(s.waiting_for_reply)} · горячие: ${n(s.hot)}`,
    `Шаги: ${by(NEXT_RU, s.by_next, ['reply', 'deliver', 'offer', 'talk', 'wait'])}`,
    `Этапы: ${by(STAGE_RU, s.by_stage, ['client', 'talking', 'written', 'later', 'refused', 'winback', 'new'])}`,
    `Сигналы: ${by(SIGNAL_RU, s.by_signal, ['price', 'buy', 'service', 'urgency', 'objection'])}`,
    `Касания всего: ${totalLine}`,
    `За ${days} дн.: ${recentLine}`,
    `По касаниям ждём: мы ${n(w.ours)} · пора ${n(w.due)} · они ${n(w.theirs)}`,
  ]
  if (top.length) {
    lines.push('', 'Первые пять:')
    top.forEach((t: any, i: number) => {
      lines.push(
        `${i + 1}. ${t.display ?? 'id ' + t.lead} · ${t.lead} · ${NEXT_RU[String(t.next)] ?? t.next} · ${STAGE_RU[String(t.stage)] ?? t.stage} · ${ago(t.days_since_their_last_word)}`
      )
    })
  }
  if (cards) {
    const kinds = (s.touches_by_kind ?? {}) as Record<
      string,
      { total?: number }
    >
    const sent = n(kinds.written?.total)
    lines.push(
      '',
      'Карточки (в окне журнала):',
      cardFlowLine(cards.prepared, sent, cards.dropped)
    )
    if (cards.giftRefused) {
      lines.push(`подарок отказан ${cards.giftRefused} раз`)
    }
    if (cards.prepared > 0 && sent * 3 < cards.prepared) {
      lines.push(
        'Подготовлено втрое больше, чем отправлено — теряется между карточкой и нажатием.'
      )
    }
  }
  if (s.pending_card) {
    lines.push(
      '',
      `Карточка ждёт: ${s.pending_card.action} → ${s.pending_card.target}, ${n(s.pending_card.age_minutes)} мин.`
    )
  }
  if (scopeLine) lines.push('', scopeLine)
  lines.push(
    '',
    'Обход всех: /sweep · группа: /sweep ждут | горячие | разговор · фильтр: /sweep next=reply | stage=new | signal=price | days<=7 | paid=yes [limit=10] · один: /sweep @pilot_client · где: /sweep где · стоп: /sweep stop'
  )
  return lines.join('\n')
}
