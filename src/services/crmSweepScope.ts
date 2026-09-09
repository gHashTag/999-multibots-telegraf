/**
 * THE SELLER, POINTED AT SOMEBODY.
 *
 * Owner: make it selective -- one client or a group -- and teach it. A
 * sweep can be aimed: at one person, at a list, at
 * a group defined by the memory's own fields (next step, stage, signal,
 * recency, money) or by a preset (waiting / hot / talk, with Russian aliases). Because only
 * ONE draft can wait for the owner at a time, a group is a queue: one card,
 * the owner's button, the next person.
 *
 * This module is pure: the parser, the row filters, the per-person brief.
 * The queue itself lives in crmProactive.ts. Everything that reaches the
 * agent's prompt is either regex-validated (@username, numeric id) or the
 * render's one-lined display name -- nothing typed by a third party is
 * interpolated unbounded.
 */

/** The three pieces of the generic brief; the scoped brief reuses RULES. */
export const SWEEP_HEAD =
  'Проактивный обход продавца (никто не спрашивал — ты работаешь сам). ' +
  'Шаги: 1) crm_leads с limit 5. 2) Возьми первого, у кого next не wait; ' +
  'по нему crm_lead_context — и продолжай ИМЕННО ЭТУ переписку, по её истории ' +
  'и памяти, а не начинай заново. 3) Ровно ОДНО действие: '
export const SWEEP_RULES =
  'next=reply — короткий ответ по сути его последних слов через tg_send; ' +
  'next=talk — короткое продолжение разговора по контексту через tg_send, без цены ' +
  'и без счёта; next=deliver и есть токены — crm_deliver_photo по его просьбе; ' +
  'next=offer — crm_offer, и только если человек САМ спрашивал цену или хотел купить. ' +
  'НЕ ПРЕДЛАГАЙ ОПЛАТУ ПЕРВЫМ: клиент должен захотеть сам. '
export const SWEEP_TAIL =
  '4) Если кандидатов нет или у первого next=wait — ответь одним словом «тихо» и ' +
  'ничего не готовь. Шаг 1 (crm_leads) обязателен всегда, даже для «тихо»: ответ ' +
  'без вызова инструментов не засчитывается. НИЧЕГО НЕ ОТПРАВЛЯЙ САМ: только ' +
  'подготовь; владелец нажмёт кнопку. Ответ — одна строка: кому и что подготовлено.'

export const NEXT_VALUES = [
  'reply',
  'deliver',
  'offer',
  'talk',
  'wait',
] as const
export const STAGE_VALUES = [
  'client',
  'refused',
  'later',
  'talking',
  'written',
  'winback',
  'new',
] as const
export const SIGNAL_VALUES = [
  'price',
  'buy',
  'service',
  'urgency',
  'objection',
] as const
export const PRESET_VALUES = [
  'waiting',
  'hot',
  'talk',
  'due',
  'ours',
  'winback',
] as const
/** Presets that may only be worked as a reviewed batch, never as a queue. */
export const BATCH_PRESETS = ['warm'] as const
/** How many people one press of a preset queues, unless limit= says otherwise. */
export const PRESET_CAPS: Record<Preset, number> = {
  waiting: 20,
  hot: 10,
  talk: 5,
  due: 5,
  ours: 5,
  winback: 3,
}
export type Preset = (typeof PRESET_VALUES)[number]

/** Russian words the owner types, mapped to the presets. */
export const PRESET_ALIASES: Record<string, Preset> = Object.fromEntries([
  ['waiting', 'waiting'],
  ['hot', 'hot'],
  ['talk', 'talk'],
  ['due', 'due'],
  ['ours', 'ours'],
  ['winback', 'winback'],
  ['ждут', 'waiting'],
  ['ждет', 'waiting'],
  ['горячие', 'hot'],
  ['разговор', 'talk'],
  ['пора', 'due'],
  ['молчим', 'ours'],
  ['вернуть', 'winback'],
]) as Record<string, Preset>
/** Words that name the batch-only segment; a queue refuses them out loud. */
const BATCH_WORDS = ['warm', 'прогрев']

export const SYNTAX =
  'Обход: /sweep — всех по очереди; /sweep @username или id — один человек; ' +
  'несколько через пробел — список; фильтр: next=reply | stage=new | signal=price | ' +
  'days<=7 | days>=7 | paid=yes [limit=10]; пресеты: ждут | горячие | разговор | ' +
  'пора | молчим | вернуть; где: /sweep где; остановить: /sweep stop'

export type Predicate =
  | { field: 'next' | 'stage' | 'signal' | 'paid'; value: string }
  | { field: 'days'; op: '<=' | '>='; value: number }
  | { field: 'preset'; value: Preset }

export type ScopeSpec =
  | { kind: 'generic' }
  | { kind: 'status' }
  | { kind: 'stop' }
  | { kind: 'list'; chats: string[]; label: string }
  | {
      kind: 'filter'
      predicates: Predicate[]
      limit: number
      /** true when the owner typed limit=; a preset then keeps its own cap. */
      limitGiven: boolean
      label: string
    }
  | { kind: 'error'; message: string }

const USERNAME_RE = /^@[A-Za-z0-9_]{5,32}$/
const ID_RE = /^\d{5,15}$/
const DEFAULT_LIMIT = 10
const MAX_LIMIT = 50
const MAX_LIST = 50

export function parseSweepArgs(rawArgs: string[]): ScopeSpec {
  const args = rawArgs.map(a => a.trim()).filter(Boolean)
  if (!args.length) return { kind: 'generic' }
  const first = args[0].toLowerCase()
  if (args.length === 1 && (first === 'где' || first === 'status'))
    return { kind: 'status' }
  if (args.length === 1 && (first === 'стоп' || first === 'stop'))
    return { kind: 'stop' }

  const chats: string[] = []
  const predicates: Predicate[] = []
  let limit = DEFAULT_LIMIT
  let limitGiven = false
  const labelParts: string[] = []
  for (const arg of args) {
    if (USERNAME_RE.test(arg) || ID_RE.test(arg)) {
      chats.push(arg)
      labelParts.push(arg)
      continue
    }
    const low = arg.toLowerCase()
    if (BATCH_WORDS.includes(low))
      return {
        kind: 'error',
        message: 'прогрев — только пакетом, не обходом: /batch прогрев',
      }
    const preset = PRESET_ALIASES[low]
    if (preset) {
      predicates.push({ field: 'preset', value: preset })
      labelParts.push(preset)
      continue
    }
    const days = /^days(<=|>=|=)(\d{1,4})$/.exec(low)
    if (days) {
      const op = days[1] === '>=' ? '>=' : '<='
      predicates.push({ field: 'days', op, value: Number(days[2]) })
      labelParts.push(`days${op}${days[2]}`)
      continue
    }
    const kv = /^(next|stage|signal|paid|limit)=([a-z0-9]+)$/.exec(low)
    if (!kv) {
      return {
        kind: 'error',
        message:
          (arg.startsWith('@') || /^\d+$/.test(arg)
            ? `«${arg}»: @username от 5 знаков или числовой id. `
            : `«${arg}» не понял. `) + SYNTAX,
      }
    }
    const [, key, value] = kv
    if (key === 'limit') {
      const n = Number(value)
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT)
        return { kind: 'error', message: `limit: от 1 до ${MAX_LIMIT}` }
      limit = n
      limitGiven = true
      labelParts.push(`limit=${n}`)
      continue
    }
    const allowed: readonly string[] =
      key === 'next'
        ? NEXT_VALUES
        : key === 'stage'
          ? STAGE_VALUES
          : key === 'signal'
            ? SIGNAL_VALUES
            : ['yes', 'no']
    if (!allowed.includes(value))
      return { kind: 'error', message: `${key}: ${allowed.join(', ')}` }
    predicates.push({
      field: key as 'next' | 'stage' | 'signal' | 'paid',
      value,
    })
    labelParts.push(`${key}=${value}`)
  }
  if (chats.length && predicates.length)
    return {
      kind: 'error',
      message: 'Либо люди, либо фильтр — не вместе. ' + SYNTAX,
    }
  if (chats.length) {
    if (chats.length > MAX_LIST)
      return {
        kind: 'error',
        message: `Список: не больше ${MAX_LIST} человек за раз`,
      }
    return { kind: 'list', chats, label: labelParts.join(' ') }
  }
  return {
    kind: 'filter',
    predicates,
    limit,
    limitGiven,
    label: labelParts.join(' '),
  }
}

/** A crm_leads row, as the render returns it. */
export interface LeadRowLike {
  lead?: unknown
  display?: unknown
  username?: unknown
  next?: unknown
  stage?: unknown
  paid?: unknown
  signals?: unknown
  waiting_for_reply?: unknown
  days_since_their_last_word?: unknown
  days_since_our_last_word?: unknown
  segment?: unknown
  last_touch?: unknown
}

/** The single preset a filter names, when it names exactly one and nothing else. */
export function presetOf(predicates: Predicate[]): Preset | null {
  if (predicates.length !== 1) return null
  const p = predicates[0]
  return p.field === 'preset' ? p.value : null
}

const signalsOf = (r: LeadRowLike): string[] =>
  Array.isArray(r.signals) ? r.signals.map(String) : []
const daysOf = (r: LeadRowLike): number | null => {
  const d = r.days_since_their_last_word
  return d === null || d === undefined || !Number.isFinite(Number(d))
    ? null
    : Number(d)
}

/** The same predicate crm_summary counts as hot. */
export function isHotRow(r: LeadRowLike): boolean {
  const next = String(r.next ?? '')
  if (next === 'offer' || next === 'deliver') return true
  const s = signalsOf(r)
  const asked = s.includes('price') || s.includes('buy')
  const d = daysOf(r)
  return asked && d !== null && d <= 7
}

export function matchRow(r: LeadRowLike, p: Predicate): boolean {
  switch (p.field) {
    case 'next':
      return String(r.next ?? '') === p.value
    case 'stage':
      return String(r.stage ?? '') === p.value
    case 'signal':
      return signalsOf(r).includes(p.value)
    case 'paid':
      return Boolean(r.paid) === (p.value === 'yes')
    case 'days': {
      const d = daysOf(r)
      if (d === null) return false
      return p.op === '<=' ? d <= p.value : d >= p.value
    }
    case 'preset': {
      // The render assigns one segment per person; when the row carries it,
      // the queue takes the same people the plan counted.
      if (typeof r.segment === 'string') return r.segment === p.value
      const touch = (r.last_touch ?? null) as {
        kind?: string
        at?: string
      } | null
      const touchAge =
        touch?.at && Number.isFinite(Date.parse(String(touch.at)))
          ? Math.floor((Date.now() - Date.parse(String(touch.at))) / 86400_000)
          : null
      const d = daysOf(r)
      if (p.value === 'waiting')
        return Boolean(r.waiting_for_reply) || String(r.next) === 'reply'
      if (p.value === 'hot') return isHotRow(r)
      if (p.value === 'talk') return String(r.next ?? '') === 'talk'
      if (p.value === 'due')
        return touch?.kind === 'later' && touchAge !== null && touchAge >= 14
      if (p.value === 'ours') return touch?.kind === 'replied' && !r.paid
      return (
        Boolean(r.paid) && d !== null && d >= 30 && touch?.kind !== 'refused'
      )
    }
  }
}

export function filterRows(
  rows: LeadRowLike[],
  predicates: Predicate[],
  limit: number
): LeadRowLike[] {
  return rows
    .filter(r => predicates.every(p => matchRow(r, p)))
    .slice(0, Math.max(1, limit))
}

export interface ScopeItem {
  /** @username or numeric id, exactly as validated. */
  chat: string
  display: string | null
  next: string | null
  /** A preset's own line for the brief; render-side text, never a third party's. */
  note?: string
}

const cleanDisplay = (v: unknown): string | null => {
  const s = String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40)
  return s || null
}

export function itemsFromRows(
  rows: LeadRowLike[],
  o: { nextOverride?: string; note?: string } = {}
): ScopeItem[] {
  return rows
    .filter(r => ID_RE.test(String(r.lead ?? '')))
    .map(r => ({
      chat: String(r.lead),
      display: cleanDisplay(r.display),
      next: o.nextOverride ?? (r.next ? String(r.next) : null),
      ...(o.note ? { note: o.note } : {}),
    }))
}

/** What a preset's items are told beyond the generic rules. */
export const PRESET_NOTES: Partial<Record<Preset, string>> = {
  due: 'Он просил вернуться позже, и две недели прошли: продолжи разговор по-человечески, без цены и счёта.',
  ours: 'Он ответил на наше касание, и мы молчим: ответь по сути его последних слов, без продажи.',
  winback:
    'Он платил раньше и месяц молчит: лично, тепло, спроси как дела и что было полезно; без счёта.',
}

/** Explicit chats, in the order given; display and next from the rows when they match. */
export function itemsFromChats(
  chats: string[],
  rows: LeadRowLike[]
): ScopeItem[] {
  return chats.map(chat => {
    const key = chat.replace(/^@/, '').toLowerCase()
    const row = rows.find(
      r =>
        String(r.lead ?? '') === chat ||
        String(r.username ?? '').toLowerCase() === key
    )
    return {
      chat,
      display: row ? cleanDisplay(row.display) : null,
      next: row?.next ? String(row.next) : null,
    }
  })
}

/** The brief for ONE person: the generic rules, aimed. */
export function scopedPrompt(item: ScopeItem): string {
  return (
    'Обход продавца по выбору владельца: ОДИН человек — ' +
    item.chat +
    (item.display ? ' (' + item.display + ')' : '') +
    '. Только он: crm_leads НЕ вызывай, других людей не трогай; что было в предыдущих ' +
    'ходах — про других. ' +
    (item.next ? 'По памяти его шаг: next=' + item.next + '. ' : '') +
    (item.note ? item.note + ' ' : '') +
    'Шаги: 1) crm_lead_context с chat=' +
    item.chat +
    ' — и продолжай ИМЕННО ЭТУ переписку, по её истории и памяти, а не начинай заново. ' +
    '2) Ровно ОДНО действие: ' +
    SWEEP_RULES +
    '3) Если писать нечего (отказ за 30 дней, просил позже, мы писали меньше двух дней ' +
    'назад и он молчит) — ответь одним словом «тихо» и ничего не готовь. ' +
    'НИЧЕГО НЕ ОТПРАВЛЯЙ САМ: только подготовь; владелец нажмёт кнопку. Ответ — одна ' +
    'строка: кому и что подготовлено.'
  )
}

/** The user-turn marker written to the shared transcript for a scoped item. */
export function itemMarker(item: ScopeItem): string {
  return '[обход по выбору владельца: ' + item.chat + ']'
}

const NEXT_RU: Record<string, string> = {
  reply: 'ответить',
  deliver: 'сделать и отправить',
  offer: 'предложить счёт',
  talk: 'поговорить',
  wait: 'не трогать',
}

export function progressLine(
  index: number,
  total: number,
  item: ScopeItem
): string {
  const who = item.display ? `${item.display} · ${item.chat}` : item.chat
  const step = item.next ? ` · ${NEXT_RU[item.next] ?? item.next}` : ''
  return `${index + 1} из ${total} · ${who}${step}`
}
