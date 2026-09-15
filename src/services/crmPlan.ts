/**
 * THE SELLER'S PLAN FOR THE DAY -- BY DATA, WITH BUTTONS.
 *
 * Owner: the agent must propose actions by itself -- auto-warming and sales,
 * personally or in bulk. So once a day the bot writes the plan from the
 * memory's own counts (crm_summary with segments), without a model: how many
 * are hot, waiting, due, silent on our side, warming, worth winning back;
 * the first people to look at; what already went out today against the
 * caps. Every line has a button that starts the existing queue for that
 * segment -- one card, the owner's press, the next person -- or opens a
 * person. Nothing is drafted, issued or sent by the plan itself.
 */
import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'
import {
  crmCallback,
  hubRow,
  nameLabel,
  prepLabel,
  takeLabel,
  LEAD_ID_RE,
} from '@/navigation/helpers/crmMenu'
import { NEXT_RU, STAGE_RU, day } from './modelSwitch'

export type PlanSummary = Record<string, any>

/** The calendar day in the owner's zone, e.g. 2026-09-09. Falls back to UTC. */
export function localDayKey(now: number, tz: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: tz,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(now))
  } catch {
    return new Date(now).toISOString().slice(0, 10)
  }
}

export function localHour(now: number, tz: string): number {
  try {
    const h = new Intl.DateTimeFormat('en-GB', {
      timeZone: tz,
      hour: '2-digit',
      hour12: false,
    }).format(new Date(now))
    return Number(h) % 24
  } catch {
    return new Date(now).getUTCHours()
  }
}

const MONTHS_RU = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
]
function dateLineRu(now: number, tz: string): string {
  const key = localDayKey(now, tz)
  const [, m, d] = key.split('-').map(Number)
  return `${d} ${MONTHS_RU[(m || 1) - 1]}`
}

const n = (v: unknown): number => (Number.isFinite(Number(v)) ? Number(v) : 0)
const ago = (d: unknown): string =>
  d === null || d === undefined
    ? 'давно'
    : n(d) === 0
      ? 'сегодня'
      : `${n(d)} дн. назад`

export interface SegmentLine {
  key: string
  icon: string
  title: string
  why: string
}
/** The eight segments with a button, in plan order; quiet is the footer line. */
export const SEGMENT_LINES: SegmentLine[] = [
  {
    key: 'hot',
    icon: '🔥',
    title: 'Горячие',
    why: 'сами спрашивали цену или хотели купить; счёт или фото только им, по одному',
  },
  {
    key: 'objection',
    icon: '🤔',
    title: 'Сомневаются',
    why: 'возражение на неделе; только вручную, по одному',
  },
  {
    key: 'waiting',
    icon: '✉️',
    title: 'Ждут ответа',
    why: 'по одному: карточка → кнопка',
  },
  {
    key: 'talk',
    icon: '💬',
    title: 'Разговор',
    why: 'продолжить по контексту, без цены и счёта',
  },
  {
    key: 'due',
    icon: '⏰',
    title: 'Пора',
    why: 'просили позже, две недели прошли',
  },
  { key: 'ours', icon: '🤝', title: 'Мы молчим', why: 'они ответили, наш ход' },
  {
    key: 'warm',
    icon: '📣',
    title: 'Прогрев',
    // promise-checked: the warm window in crm-segments.ts is 14..60 days --
    // said as two weeks to two months, because 60 days is 8.5 weeks and
    // "2-8" quietly understated the tail by half a week.
    why: 'тихо от двух недель до двух месяцев, без отказа; пакетом, когда он включён',
  },
  {
    key: 'winback',
    icon: '💎',
    title: 'Вернуть',
    why: 'платили, молчат месяц+; лично, по одному',
  },
]

/** A short hash of the counts, so an unchanged day is not re-sent after a restart. */
export function planFingerprint(s: PlanSummary): string {
  const seg = (s.segments ?? {}) as Record<string, number>
  return (
    SEGMENT_LINES.map(l => n(seg[l.key])).join('-') +
    ':' +
    n(s.seller_sends_recent)
  )
}

export function buildPlanText(
  s: PlanSummary,
  scopeLine: string | null,
  now: number,
  tz: string
): string {
  const seg = (s.segments ?? {}) as Record<string, number>
  const caps = (s.caps ?? {}) as Record<string, number>
  const lines: string[] = [
    `🗓 План продавца · ${dateLineRu(now, tz)}`,
    `Память: ${n(s.people_with_messages)} чел. с перепиской · платили ${n(s.paid)} · диалоги обходил ${day(s.last_ingest_at)} · Zep: ${s.zep ?? '?'}`,
    '',
    'Сегментами (каждый человек — в одном):',
  ]
  SEGMENT_LINES.forEach((l, i) => {
    const count = n(seg[l.key])
    const cap = caps[l.key]
    const take =
      cap !== undefined && count > cap ? ` в очередь первые ${cap}` : ''
    lines.push(`${i + 1}. ${l.icon} ${l.title}: ${count} — ${l.why}${take}`)
  })
  lines.push(
    `Не трогаю: ${n(seg.quiet)} — отказ за месяц, «позже» недавно, мы написали и ждём`
  )
  lines.push('')
  const capLine = SEGMENT_LINES.filter(l => caps[l.key] !== undefined)
    .map(l => `${l.title.toLowerCase()} ${n(caps[l.key])}`)
    .join(' · ')
  lines.push(
    `Сегодня ушло: ${n(s.seller_sends_recent)} из ${n(caps.day) || 30}.` +
      (capLine ? ` Лимит на день: ${capLine}.` : '')
  )
  if (s.pending_card) {
    lines.push(
      `Карточка ждёт: ${s.pending_card.action} → ${s.pending_card.target}, ${n(s.pending_card.age_minutes)} мин.`
    )
  }
  if (scopeLine) lines.push(scopeLine)
  const top = Array.isArray(s.top) ? s.top : []
  const objections = Array.isArray(s.objections) ? s.objections : []
  if (top.length || objections.length) {
    lines.push('', 'Персонально (первые по баллу):')
    top.forEach((t: any, i: number) => {
      lines.push(
        `${i + 1}. ${t.display ?? 'id ' + t.lead} · ${t.lead} · ${NEXT_RU[String(t.next)] ?? t.next} · ${STAGE_RU[String(t.stage)] ?? t.stage} · ${ago(t.days_since_their_last_word)}`
      )
    })
    objections
      .filter((o: any) => !top.some((t: any) => t.lead === o.lead))
      .slice(0, 2)
      .forEach((o: any, i: number) => {
        lines.push(
          `🤔 ${top.length + i + 1}. ${o.display ?? 'id ' + o.lead} · ${o.lead} · ${NEXT_RU[String(o.next)] ?? o.next} · возражение · ${ago(o.days_since_their_last_word)}`
        )
      })
  }
  lines.push(
    '',
    'Ничего не уйдёт без твоей кнопки. Ждущим — по одному, карточками. Обновить: /plan · сводка: /crm · очередь: /sweep где'
  )
  return lines.join('\n')
}

const btn = (text: string, data: string): InlineKeyboardButton =>
  Markup.button.callback(text, data)

export function planKeyboard(
  s: PlanSummary,
  o: { scopeActive?: boolean; stale?: boolean } = {}
) {
  const seg = (s.segments ?? {}) as Record<string, number>
  const caps = (s.caps ?? {}) as Record<string, number>
  const rows: InlineKeyboardButton[][] = []
  const top = Array.isArray(s.top) ? s.top : []
  const objections = Array.isArray(s.objections) ? s.objections : []
  const people = [
    ...top.map((t: any) => ({ ...t, icon: '👤' })),
    ...objections
      .filter((x: any) => !top.some((t: any) => t.lead === x.lead))
      .slice(0, 2)
      .map((x: any) => ({ ...x, icon: '🤔' })),
  ]
  people.forEach((p: any, i: number) => {
    const id = String(p.lead ?? '')
    if (!LEAD_ID_RE.test(id)) return
    const row = [
      btn(
        nameLabel(i + 1, p.display, id).replace('👤', p.icon),
        crmCallback('lead', id)
      ),
    ]
    if (p.next && p.next !== 'wait')
      row.push(btn(prepLabel(p.next), crmCallback('prep', id)))
    rows.push(row)
  })
  const scopeBtn = (key: string, label: string) => {
    const count = n(seg[key])
    return count > 0
      ? btn(`${label} ${takeLabel(count, caps[key])}`, crmCallback(key))
      : null
  }
  const pack = (...items: Array<InlineKeyboardButton | null>) => {
    const row = items.filter((b): b is InlineKeyboardButton => b !== null)
    if (row.length) rows.push(row)
  }
  pack(scopeBtn('hot', '🔥 Горячие'), scopeBtn('waiting', '✉️ Ответить ждущим'))
  pack(
    scopeBtn('talk', '💬 Поговорить'),
    scopeBtn('due', '⏰ Пора'),
    scopeBtn('ours', '🤝 Мы молчим')
  )
  pack(scopeBtn('winback', '💎 Вернуть'))
  if (o.scopeActive)
    rows.push([
      btn('⏹ Стоп обход', crmCallback('stop')),
      btn('📍 Где обход', crmCallback('status')),
    ])
  if (o.stale) rows.push([btn('📥 Загрузить переписку', crmCallback('ingest'))])
  rows.push(hubRow())
  return Markup.inlineKeyboard(rows)
}

/** The memory is stale when the ingest has not walked the dialogs for two days. */
export function isStale(s: PlanSummary, now: number): boolean {
  const t = Date.parse(String(s.last_ingest_at ?? ''))
  return !Number.isFinite(t) || now - t > 48 * 3600_000
}

/** Whether the daily plan is due now: inside the window, not yet sent today. */
export function planDue(o: {
  now: number
  tz: string
  hour: number
  sentDay: string | null
  windowHours?: number
}): boolean {
  const key = localDayKey(o.now, o.tz)
  if (o.sentDay === key) return false
  const h = localHour(o.now, o.tz)
  return h >= o.hour && h < o.hour + (o.windowHours ?? 11)
}

export const PLAN_MARKER_PREFIX = '[план продавца '
export function planMarker(dayKey: string): string {
  return `${PLAN_MARKER_PREFIX}${dayKey}]`
}
