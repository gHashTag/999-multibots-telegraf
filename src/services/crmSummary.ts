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
export function formatSummary(
  s: Summary,
  scopeLine: string | null = null
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
  if (s.pending_card) {
    lines.push(
      '',
      `Карточка ждёт: ${s.pending_card.action} → ${s.pending_card.target}, ${n(s.pending_card.age_minutes)} мин.`
    )
  }
  if (scopeLine) lines.push('', scopeLine)
  lines.push(
    '',
    'Обход всех: /sweep · группа: /sweep ждут | горячие | разговор · фильтр: /sweep next=reply | stage=new | signal=price | days<=7 | paid=yes [limit=10] · один: /sweep @playom · где: /sweep где · стоп: /sweep stop'
  )
  return lines.join('\n')
}
