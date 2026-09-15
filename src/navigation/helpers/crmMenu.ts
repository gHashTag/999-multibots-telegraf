/**
 * THE MENU UNDER EVERY OWNER MESSAGE.
 *
 * Owner: send a menu with every message, so something can be done with the
 * information right there. A list of leads, a person's brief, a
 * sweep outcome, a notification about a client's DM -- each carries the
 * buttons that act on it, and no owner message is a dead end.
 *
 * The grammar is deliberately small and ASCII-only, so bytes equal chars
 * and Telegram's 64-byte callback limit is never in doubt:
 *
 *   crm:<verb>                       menu | leads | summary | sweep | model | ingest
 *   crm:<verb>[!]:<numeric id>       lead | prep | later | refuse | refuse! | back | mute
 *   crm:scope:<preset>               waiting | hot | talk | stop | status
 *
 * The argument is ALWAYS a numeric telegram id: never a @username (they
 * change and need the owner's session), never a secret, never free text.
 * A label never decides anything -- only the callback does -- so a
 * third-party display name in a button is index-prefixed and cut short.
 * The `!` suffix is the deliberate second press for a costly verb; today
 * only `refuse!` (a 30-day silence) carries it.
 *
 * Nothing here sends anything to a client. A `prep` press PREPARES a draft
 * through the agent; the send is still the tgp: card's own button.
 */

import { Markup } from 'telegraf'
import type { InlineKeyboardButton } from 'telegraf/types'

export const CRM_PREFIX = 'crm:'
export const LEAD_ID_RE = /^\d{5,15}$/
export const ROOT_VERBS = [
  'menu',
  'leads',
  'summary',
  'sweep',
  'model',
  'ingest',
  'plan',
] as const
export const LEAD_VERBS = [
  'lead',
  'prep',
  'later',
  'refuse',
  'refuse!',
  'back',
  'mute',
] as const
export const SCOPE_VERBS = [
  'waiting',
  'hot',
  'talk',
  'due',
  'ours',
  'winback',
  'stop',
  'status',
] as const

export const CRM_ROOT_RE = /^crm:(menu|leads|summary|sweep|model|ingest|plan)$/
export const CRM_LEAD_RE =
  /^crm:(lead|prep|later|refuse!?|back|mute):(\d{5,15})$/
export const CRM_SCOPE_RE =
  /^crm:scope:(waiting|hot|talk|due|ours|winback|stop|status)$/

export type RootVerb = (typeof ROOT_VERBS)[number]
export type LeadVerb = (typeof LEAD_VERBS)[number]
export type ScopeVerb = (typeof SCOPE_VERBS)[number]

/** Build a callback; throws on anything the dispatcher would not match. */
export function crmCallback(verb: string, id?: string): string {
  let data: string
  if (id !== undefined) {
    if (!(LEAD_VERBS as readonly string[]).includes(verb))
      throw new Error(`crm menu: unknown lead verb ${verb}`)
    if (!LEAD_ID_RE.test(id))
      throw new Error(`crm menu: not a numeric id: ${id}`)
    data = `${CRM_PREFIX}${verb}:${id}`
  } else if ((ROOT_VERBS as readonly string[]).includes(verb)) {
    data = `${CRM_PREFIX}${verb}`
  } else if ((SCOPE_VERBS as readonly string[]).includes(verb)) {
    data = `${CRM_PREFIX}scope:${verb}`
  } else {
    throw new Error(`crm menu: unknown verb ${verb}`)
  }
  if (Buffer.byteLength(data) > 64)
    throw new Error(`crm menu: callback over 64 bytes: ${data}`)
  return data
}

export type ParsedCrm =
  | { kind: 'root'; verb: RootVerb }
  | { kind: 'lead'; verb: LeadVerb; bang: boolean; id: string }
  | { kind: 'scope'; verb: ScopeVerb }

export function parseCrmCallback(data: string): ParsedCrm | null {
  const root = CRM_ROOT_RE.exec(data)
  if (root) return { kind: 'root', verb: root[1] as RootVerb }
  const scope = CRM_SCOPE_RE.exec(data)
  if (scope) return { kind: 'scope', verb: scope[1] as ScopeVerb }
  const lead = CRM_LEAD_RE.exec(data)
  if (lead) {
    return {
      kind: 'lead',
      verb: lead[1] as LeadVerb,
      bang: lead[1].endsWith('!'),
      id: lead[2],
    }
  }
  return null
}

const btn = (text: string, data: string): InlineKeyboardButton =>
  Markup.button.callback(text, data)

/** The three places to go from anywhere: the list, the overview, a sweep. */
export function hubRow(): InlineKeyboardButton[] {
  return [
    btn('👥 Кому писать', crmCallback('leads')),
    btn('📊 Сводка', crmCallback('summary')),
    btn('🔄 Обход', crmCallback('sweep')),
  ]
}

export function rootMenu() {
  return Markup.inlineKeyboard([
    hubRow(),
    [
      btn('🗓 План', crmCallback('plan')),
      btn('🧠 Модель', crmCallback('model')),
      btn('📥 Загрузить переписку', crmCallback('ingest')),
    ],
  ])
}

/** '(7)' when the press takes everybody, '(20 из 306)' when it takes the cap. */
export function takeLabel(n: number, cap?: number): string {
  return cap !== undefined && n > cap ? `(${cap} из ${n})` : `(${n})`
}

/** The next step as the render forecasts it, worded as a button. */
export const PREP_LABEL: Record<string, string> = {
  reply: '✍️ Ответить',
  talk: '💬 Продолжить',
  deliver: '🖼 Фото',
  offer: '🧾 Счёт',
}
export function prepLabel(next?: string | null): string {
  return PREP_LABEL[String(next ?? '')] ?? '✍️ Подготовить'
}

/**
 * A person's name on a button: index first, so a name like "Отправить"
 * cannot read as a control; whitespace collapsed; cut to twenty.
 */
export function nameLabel(
  index: number,
  display: string | null | undefined,
  lead: string
): string {
  const raw = String(display ?? '')
    .replace(/\s+/g, ' ')
    .trim()
  const name = (raw || `id ${lead}`).slice(0, 20)
  return `👤 ${index}. ${name}`
}

export interface LeadRow {
  lead: string
  display?: string | null
  next?: string | null
}

/** Under the list: one row per person (up to six), then the hub. */
export function leadsKeyboard(rows: LeadRow[]) {
  const lines: InlineKeyboardButton[][] = []
  rows
    .filter(r => LEAD_ID_RE.test(String(r.lead)))
    .slice(0, 6)
    .forEach((r, i) => {
      const row = [
        btn(nameLabel(i + 1, r.display, r.lead), crmCallback('lead', r.lead)),
      ]
      if (r.next && r.next !== 'wait')
        row.push(btn(prepLabel(r.next), crmCallback('prep', r.lead)))
      lines.push(row)
    })
  lines.push(hubRow())
  return Markup.inlineKeyboard(lines)
}

export function emptyLeadsKeyboard() {
  return Markup.inlineKeyboard([
    [btn('📥 Загрузить переписку', crmCallback('ingest'))],
    hubRow(),
  ])
}

/** Under a person's brief. */
export function leadMenu(
  lead: string,
  o: { next?: string | null; confirmRefuse?: boolean } = {}
) {
  const second = o.confirmRefuse
    ? [
        btn('🚫 Да, отказ на 30 дней', crmCallback('refuse!', lead)),
        btn('↩️ Нет', crmCallback('back', lead)),
      ]
    : [
        btn('⏰ Позже', crmCallback('later', lead)),
        btn('🚫 Отказ', crmCallback('refuse', lead)),
      ]
  return Markup.inlineKeyboard([
    [btn(`${prepLabel(o.next)}`, crmCallback('prep', lead))],
    second,
    [
      btn('👥 Кому писать', crmCallback('leads')),
      btn('🏠 Меню', crmCallback('menu')),
    ],
  ])
}

/** Under the owner's notification about a client's DM. */
export function dmLeadMenu(chatId: string | number) {
  const id = String(chatId)
  if (!LEAD_ID_RE.test(id)) return undefined
  return Markup.inlineKeyboard([
    [
      btn('👤 Кто это', crmCallback('lead', id)),
      btn('🤫 Отвечу сам', crmCallback('mute', id)),
    ],
    [btn('✍️ Подготовить ответ', crmCallback('prep', id))],
    [
      btn('⏰ Позже', crmCallback('later', id)),
      btn('🚫 Отказ', crmCallback('refuse', id)),
    ],
  ])
}

/** The extra row under a proposal card: read the person before approving. */
export function cardMenuRows(
  lead: string | null | undefined
): InlineKeyboardButton[][] {
  const id = String(lead ?? '')
  if (!LEAD_ID_RE.test(id)) return []
  return [[btn('👤 История', crmCallback('lead', id))]]
}

export function afterSentKeyboard(lead?: string | null) {
  const id = String(lead ?? '')
  const rows: InlineKeyboardButton[][] = []
  if (LEAD_ID_RE.test(id)) {
    rows.push([
      Markup.button.url('💬 Открыть чат', `tg://user?id=${id}`),
      btn('👤 История', crmCallback('lead', id)),
    ])
  }
  rows.push(hubRow())
  return Markup.inlineKeyboard(rows)
}

export function afterCancelKeyboard(lead?: string | null) {
  const id = String(lead ?? '')
  const rows: InlineKeyboardButton[][] = []
  if (LEAD_ID_RE.test(id)) {
    rows.push([btn('✍️ Подготовить заново', crmCallback('prep', id))])
    rows.push([
      btn('⏰ Позже', crmCallback('later', id)),
      btn('🚫 Отказ', crmCallback('refuse', id)),
    ])
  }
  rows.push(hubRow())
  return Markup.inlineKeyboard(rows)
}

/** After a prepare turn that ended without a card, or beside a card. */
export function afterTurnKeyboard(lead?: string | null) {
  const id = String(lead ?? '')
  const rows: InlineKeyboardButton[][] = []
  if (LEAD_ID_RE.test(id)) {
    rows.push([
      btn('👤 Кто это', crmCallback('lead', id)),
      btn('⏰ Позже', crmCallback('later', id)),
    ])
  }
  rows.push(hubRow())
  return Markup.inlineKeyboard(rows)
}

/** Every failure carries a way forward: retry, the model when it did not look, the hub. */
export function failKeyboard(retry?: string | null, modelHint = false) {
  const rows: InlineKeyboardButton[][] = []
  const first: InlineKeyboardButton[] = []
  if (retry && parseCrmCallback(retry)) first.push(btn('🔄 Ещё раз', retry))
  if (modelHint) first.push(btn('🧠 Модель', crmCallback('model')))
  if (first.length) rows.push(first)
  rows.push(hubRow())
  return Markup.inlineKeyboard(rows)
}

/** Under the overview: refresh, the list, and a scoped sweep per bucket that has people. */
export function summaryKeyboard(
  s: {
    by_next?: Record<string, number>
    hot?: number
    segments?: Record<string, number>
    caps?: Record<string, number>
  },
  scopeActive: boolean
) {
  const rows: InlineKeyboardButton[][] = [
    [
      btn('🔄 Обновить', crmCallback('summary')),
      btn('🗓 План', crmCallback('plan')),
      btn('👥 Кому писать', crmCallback('leads')),
    ],
  ]
  const seg = (k: string, fallback: number) =>
    Number(s.segments?.[k] ?? fallback)
  const cap = (k: string) =>
    s.caps?.[k] !== undefined ? Number(s.caps[k]) : undefined
  const reply = seg('waiting', Number(s.by_next?.reply ?? 0))
  const hot = seg('hot', Number(s.hot ?? 0))
  const talk = seg('talk', Number(s.by_next?.talk ?? 0))
  const due = seg('due', 0)
  const ours = seg('ours', 0)
  const winback = seg('winback', 0)
  const second: InlineKeyboardButton[] = []
  if (reply > 0)
    second.push(
      btn(
        `✉️ Ответить ждущим ${takeLabel(reply, cap('waiting'))}`,
        crmCallback('waiting')
      )
    )
  if (hot > 0)
    second.push(
      btn(`🔥 Горячие ${takeLabel(hot, cap('hot'))}`, crmCallback('hot'))
    )
  if (second.length) rows.push(second)
  const third: InlineKeyboardButton[] = []
  if (talk > 0)
    third.push(
      btn(`💬 Поговорить ${takeLabel(talk, cap('talk'))}`, crmCallback('talk'))
    )
  if (due > 0)
    third.push(btn(`⏰ Пора ${takeLabel(due, cap('due'))}`, crmCallback('due')))
  if (ours > 0)
    third.push(
      btn(`🤝 Мы молчим ${takeLabel(ours, cap('ours'))}`, crmCallback('ours'))
    )
  if (third.length) rows.push(third)
  if (winback > 0)
    rows.push([
      btn(
        `💎 Вернуть ${takeLabel(winback, cap('winback'))}`,
        crmCallback('winback')
      ),
    ])
  if (scopeActive)
    rows.push([
      btn('⏹ Стоп обход', crmCallback('stop')),
      btn('📍 Где обход', crmCallback('status')),
    ])
  rows.push([
    btn('🔄 Обход', crmCallback('sweep')),
    btn('🧠 Модель', crmCallback('model')),
  ])
  return Markup.inlineKeyboard(rows)
}

/** The render's own rule, mirrored, for a brief that arrives without `next`. */
export function nextOf(o: { waiting?: boolean; signals?: string[] }): string {
  if (o.waiting) return 'reply'
  const s = o.signals ?? []
  const asked = s.includes('price') || s.includes('buy')
  if (s.includes('service') && asked) return 'deliver'
  if (asked) return 'offer'
  return 'talk'
}

/** For tests and ratchets: every callback a markup renders. */
export function allCallbacks(
  markup:
    | { reply_markup?: { inline_keyboard?: InlineKeyboardButton[][] } }
    | undefined
): string[] {
  const rows = markup?.reply_markup?.inline_keyboard ?? []
  return rows
    .flat()
    .map(b => ('callback_data' in b ? String(b.callback_data) : ''))
    .filter(Boolean)
}

/**
 * A spent card must still say how it ended.
 *
 * Until 2026-09-15 a press removed the WHOLE keyboard, so by evening the
 * owner's DM held a column of identical texts with no buttons: no way to see
 * which of them went out and which he killed. It also took away the card's
 * own "История" row, and that row is the only path from a twelve-hour-old
 * draft back to the person -- the id/lead map the follow-up keyboard is built
 * from expires in fifteen minutes.
 *
 * So instead of removing the keyboard we redraw it: the card's own buttons
 * collapse into one disabled button carrying the verdict, and every other row
 * is left exactly as it was. Reading the CURRENT markup rather than rebuilding
 * it is deliberate -- this helper does not need to know how the card was put
 * together, and cannot drift when that changes.
 *
 * `disabled` is Bot API 10.3 (24 Aug 2026), and it carries NOTHING beside it:
 * the reference says "exactly one of the fields other than text,
 * icon_custom_emoji_id and style must be used to specify the type of the
 * button", and `disabled` is one of those type fields. A verdict button that
 * also kept a callback_data would name two types at once and be refused on
 * every single press -- and since the caller falls back to clearing the
 * keyboard, that refusal would look exactly like the old behaviour and this
 * whole thing would quietly do nothing.
 */

/** A button belonging to the card itself, as opposed to the rows under it. */
function isCardButton(b: unknown): boolean {
  const cell = b as { callback_data?: unknown; disabled?: unknown } | null
  const data = String(cell?.callback_data ?? '')
  if (data.startsWith('tgp:ok:') || data.startsWith('tgp:no:')) return true
  // A verdict we drew earlier, so a second pass can relabel it.
  return cell?.disabled != null
}

/**
 * The card's keyboard after the press, or null when there is nothing of ours
 * in it -- the caller falls back to clearing the keyboard, which is what this
 * code did before, so a surprise can never leave a live button behind.
 */
export function settledKeyboard(
  markup: { inline_keyboard?: unknown[][] } | null | undefined,
  verdict: string
): InlineKeyboardButton[][] | null {
  const rows = markup?.inline_keyboard
  if (!Array.isArray(rows) || !rows.length) return null
  const spent: InlineKeyboardButton[] = [
    // Bot API 10.3: DisabledButton "currently holds no information", and it
    // is the button's ONE type field -- see the note above.
    { text: verdict, disabled: {} } as unknown as InlineKeyboardButton,
  ]
  let found = false
  const out: InlineKeyboardButton[][] = []
  for (const row of rows) {
    const cells = Array.isArray(row) ? row : []
    const ours = cells.filter(c => isCardButton(c))
    if (!ours.length) {
      out.push(cells as InlineKeyboardButton[])
      continue
    }
    // The verdict stands where the card's own row stood; anything sharing
    // that row (there is nothing today) keeps its place beside it.
    const others = cells.filter(c => !isCardButton(c)) as InlineKeyboardButton[]
    if (!found) out.push([...spent, ...others])
    else if (others.length) out.push(others)
    found = true
  }
  return found ? out : null
}
