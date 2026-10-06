/**
 * MEETINGS THE PERSON MAKES BY TALKING TO THE AGENT, AND THE REMINDERS.
 *
 * Owner, 2026-10-01: online and in-person meetings created through the agent,
 * with a proactive Telegram reminder for the person. The spec of record is
 * gHashTag/t27 specs/automation/meeting-reminders.t27; every number below comes
 * from its generated module, and src/spec/meeting-reminders.test.ts runs each
 * of its tests against this file.
 *
 * THE BOUNDARY. A meeting is the caller's own. `telegram_id` comes from the
 * confirmed context (ToolContext), never from arguments, and every read and
 * write -- including update, cancel and a tap by token -- is filtered by it.
 * The calendar file is reachable only through `ics_token`, a token of its own:
 * the tap token rides in callback data that the bot sees, the calendar token
 * rides in a URL that a phone's calendar app fetches, and neither opens the
 * other's door.
 *
 * THE PACE LIVES IN THE DATABASE. A reminder is a row with `fire_at`; the tick
 * (render-server.ts, every TICK_S) only asks which rows are due. A redeploy
 * neither loses a reminder nor sends one twice: the row is marked before the
 * send (MARK_BEFORE_SEND), so the failure mode is a missed reminder, never a
 * duplicate -- and a lost tick sends late, but never after the start.
 *
 * THE TELEGRAM FEATURES. The time is a `tg-time` entity (Bot API 9.5), so each
 * reader sees it in their OWN time zone and the card never has to name one.
 * Buttons carry `style` (success / primary / danger) and an online link gets a
 * `copy_text` button. Our own Bot API server may be older than 9.5; a card it
 * refuses to parse is sent again with the fallback text in place of the
 * entity, so an old host costs the local time, not the reminder.
 */

import { randomBytes } from 'node:crypto'

import type { AgentTool, ToolContext } from './tools'
import * as SPEC from '../spec/meeting-reminders.gen'
import { sendToTelegram } from '../auth/telegram-sender'

type Pool = ToolContext['pool']

export const MODES = ['online', 'offline'] as const
export type Mode = (typeof MODES)[number]
export type Lang = 'ru' | 'en'
export const ACTIONS = ['ok', 'later', 'cancel', 'done', 'missed'] as const
export type Action = (typeof ACTIONS)[number]
export type CardKind = 'created' | 'moved' | 'before' | 'followup'

export interface Meeting {
  id: number
  telegram_id: string
  title: string
  starts_at: Date
  ends_at: Date
  mode: Mode
  place: string | null
  url: string | null
  notes: string | null
  lang: Lang
  status: string
  tap_token: string
  ics_token: string
}

const MIN_MS = 60_000
const DAY_MS = 24 * 60 * MIN_MS
const OPEN = ['planned', 'confirmed']

// ---- The spec's laws, as the host runs them --------------------------------

export const offsetOk = (minutes: number): boolean =>
  Number.isInteger(minutes) &&
  minutes >= SPEC.REMIND_FLOOR_MIN &&
  minutes <= SPEC.REMIND_CEIL_MIN

export const schedules = (nowS: number, startsS: number, minutes: number) =>
  startsS > nowS + minutes * 60

export const firesBefore = (nowS: number, fireS: number, startsS: number) =>
  fireS <= nowS && nowS < startsS

export const snoozeAllowed = (nowS: number, startsS: number) =>
  nowS + SPEC.SNOOZE_MIN * 60 < startsS

/** A snooze is added only while none of its own still waits (spec v2). */
export const snoozeAdds = (pendingSnoozes: number) =>
  pendingSnoozes < SPEC.SNOOZES_PENDING_MAX

export const followsUp = (nowS: number, endsS: number, cancelled: boolean) =>
  !cancelled && nowS >= endsS + SPEC.FOLLOWUP_AFTER_END_MIN * 60

export const mayAnswer = (presserIsOwner: boolean, tokenMatches: boolean) =>
  presserIsOwner && tokenMatches

export function clampDuration(minutes: unknown): number {
  const n = Math.floor(Number(minutes) || 0)
  if (n <= 0) return SPEC.DURATION_DEFAULT_MIN
  return Math.min(SPEC.DURATION_MAX_MIN, Math.max(SPEC.DURATION_MIN_MIN, n))
}

/** The callback data of one button. Fits CALLBACK_MAX_BYTES by the spec's law. */
export const callbackData = (action: Action, token: string) =>
  `${SPEC.CALLBACK_PREFIX}${action}:${token}`

export const newToken = () =>
  randomBytes(SPEC.TOKEN_BYTES).toString('base64url')

/**
 * Which reminders to schedule. Asked-for offsets are kept only inside the
 * floor and the ceiling, at most MAX_REMINDERS, largest first; an offset whose
 * moment has already passed is dropped, not fired at once.
 */
export function reminderOffsets(
  nowMs: number,
  startsMs: number,
  asked?: unknown
): number[] {
  const wanted = Array.isArray(asked)
    ? asked.map(Number).filter(offsetOk)
    : [SPEC.REMIND_DAY_MIN, SPEC.REMIND_HOUR_MIN, SPEC.REMIND_SOON_MIN]
  const nowS = Math.floor(nowMs / 1000)
  const startsS = Math.floor(startsMs / 1000)
  return [...new Set(wanted)]
    .sort((a, b) => b - a)
    .filter(m => schedules(nowS, startsS, m))
    .slice(0, SPEC.MAX_REMINDERS)
}

// ---- Time: an offset is required, or a named zone ---------------------------

const ISO_RE =
  /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?(Z|[+-]\d{2}:?\d{2})?$/

/** How far the zone's wall clock is from UTC at this instant, in ms. */
function zoneOffsetMs(tz: string, atMs: number): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(atMs))
  const p = Object.fromEntries(parts.map(x => [x.type, x.value]))
  const wall = Date.UTC(
    +p.year,
    +p.month - 1,
    +p.day,
    +p.hour,
    +p.minute,
    +p.second
  )
  return wall - Math.floor(atMs / 1000) * 1000
}

/**
 * The instant a person meant. "15:00" means nothing without a place on Earth,
 * so a time with no offset needs `tz` (an IANA name such as Europe/Moscow);
 * with neither, this refuses rather than guess -- a reminder an hour off is
 * worse than a question.
 */
export function parseStart(
  raw: unknown,
  tz?: unknown
): { ms: number } | { error: string } {
  const s = String(raw ?? '').trim()
  const m = ISO_RE.exec(s)
  if (!m) {
    return {
      error:
        'starts_at must be ISO 8601, e.g. 2026-10-02T15:00 with tz, or 2026-10-02T15:00+03:00',
    }
  }
  if (m[7]) {
    const ms = Date.parse(s.replace(' ', 'T'))
    return Number.isFinite(ms)
      ? { ms }
      : { error: 'starts_at is not a real date' }
  }
  const zone = String(tz ?? '').trim()
  if (!zone) {
    return {
      error:
        'starts_at has no UTC offset and no tz was given. Ask the person which city or time zone they mean, then pass tz (e.g. Europe/Moscow).',
    }
  }
  const naive = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0))
  if (!Number.isFinite(naive)) return { error: 'starts_at is not a real date' }
  try {
    let guess = naive - zoneOffsetMs(zone, naive)
    guess = naive - zoneOffsetMs(zone, guess)
    return { ms: guess }
  } catch {
    return { error: `unknown time zone: ${zone.slice(0, 64)}` }
  }
}

// ---- Validation ----------------------------------------------------------------

const clean = (v: unknown, max: number): string =>
  String(v ?? '')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .trim()
    .slice(0, max)

/** A link a person may be sent to: https, no credentials in it. */
export function meetingUrl(v: unknown): string | null | { error: string } {
  const raw = String(v ?? '').trim()
  if (!raw) return null
  if (raw.length > SPEC.URL_MAX)
    return { error: `url is longer than ${SPEC.URL_MAX}` }
  try {
    const u = new URL(raw)
    if (u.protocol !== 'https:' || u.username || u.password)
      return { error: 'url must be https and carry no login' }
    return u.href
  } catch {
    return { error: 'url is not a link' }
  }
}

const langOf = (v: unknown): Lang =>
  String(v ?? '').toLowerCase() === 'en' ? 'en' : 'ru'

// ---- The store -----------------------------------------------------------------

const ready = new WeakMap<object, Promise<void>>()

/** Tables made on first use, like content_plan_* and user_soul. Once per pool. */
export function ensureMeetingTables(pool: Pool): Promise<void> {
  let p = ready.get(pool)
  if (!p) {
    p = (async () => {
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${SPEC.TABLE} (
           id          serial PRIMARY KEY,
           telegram_id text NOT NULL,
           title       text NOT NULL,
           starts_at   timestamptz NOT NULL,
           ends_at     timestamptz NOT NULL,
           mode        text NOT NULL DEFAULT 'online',
           place       text,
           url         text,
           notes       text,
           lang        text NOT NULL DEFAULT 'ru',
           status      text NOT NULL DEFAULT 'planned',
           tap_token   text NOT NULL UNIQUE,
           ics_token   text NOT NULL UNIQUE,
           created_at  timestamptz NOT NULL DEFAULT now(),
           updated_at  timestamptz NOT NULL DEFAULT now()
         )`
      )
      await pool.query(
        `CREATE INDEX IF NOT EXISTS ${SPEC.TABLE}_owner
           ON ${SPEC.TABLE} (telegram_id, starts_at)`
      )
      await pool.query(
        `CREATE TABLE IF NOT EXISTS ${SPEC.REMINDERS_TABLE} (
           id          serial PRIMARY KEY,
           meeting_id  integer NOT NULL REFERENCES ${SPEC.TABLE}(id) ON DELETE CASCADE,
           kind        text NOT NULL,
           offset_min  integer,
           fire_at     timestamptz NOT NULL,
           sent_at     timestamptz,
           outcome     text
         )`
      )
      // The sweep asks only "what unsent row is due"; nothing else is scanned.
      await pool.query(
        `CREATE INDEX IF NOT EXISTS ${SPEC.REMINDERS_TABLE}_due
           ON ${SPEC.REMINDERS_TABLE} (fire_at) WHERE sent_at IS NULL`
      )
    })()
    p.catch(() => ready.delete(pool))
    ready.set(pool, p)
  }
  return p
}

function rowToMeeting(r: any): Meeting {
  return {
    id: Number(r.id),
    telegram_id: String(r.telegram_id),
    title: String(r.title),
    starts_at: new Date(r.starts_at),
    ends_at: new Date(r.ends_at),
    mode: r.mode === 'offline' ? 'offline' : 'online',
    place: r.place ?? null,
    url: r.url ?? null,
    notes: r.notes ?? null,
    lang: langOf(r.lang),
    status: String(r.status),
    tap_token: String(r.tap_token),
    ics_token: String(r.ics_token),
  }
}

/** Replace every unsent reminder of a meeting with a fresh plan. */
async function planReminders(
  pool: Pool,
  m: Meeting,
  nowMs: number,
  asked?: unknown
): Promise<string[]> {
  await pool.query(
    `DELETE FROM ${SPEC.REMINDERS_TABLE} WHERE meeting_id = $1 AND sent_at IS NULL`,
    [m.id]
  )
  const startsMs = m.starts_at.getTime()
  const fires: string[] = []
  for (const minutes of reminderOffsets(nowMs, startsMs, asked)) {
    const at = new Date(startsMs - minutes * MIN_MS)
    await pool.query(
      `INSERT INTO ${SPEC.REMINDERS_TABLE} (meeting_id, kind, offset_min, fire_at)
       VALUES ($1, 'before', $2, $3)`,
      [m.id, minutes, at]
    )
    fires.push(at.toISOString())
  }
  await pool.query(
    `INSERT INTO ${SPEC.REMINDERS_TABLE} (meeting_id, kind, fire_at)
     VALUES ($1, 'followup', $2)`,
    [m.id, new Date(m.ends_at.getTime() + SPEC.FOLLOWUP_AFTER_END_MIN * MIN_MS)]
  )
  return fires
}

// ---- The card --------------------------------------------------------------------

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/* User-facing words, both languages in one place. */
const WORDS = {
  ru: {
    created: '✅ Встреча запланирована', // cyrillic-ok: user-facing
    moved: '🔁 Встреча перенесена', // cyrillic-ok: user-facing
    before: '⏰ Напоминаю о встрече', // cyrillic-ok: user-facing
    followup: '🤝 Как прошла встреча?', // cyrillic-ok: user-facing
    online: '💻 Онлайн', // cyrillic-ok: user-facing
    offline: '📍', // cyrillic-ok: user-facing
    coming: '✅ Буду', // cyrillic-ok: user-facing
    later: '⏰ Позже', // cyrillic-ok: user-facing
    cancel: '❌ Отменить', // cyrillic-ok: user-facing
    join: '🔗 Подключиться', // cyrillic-ok: user-facing
    copy: '📋 Скопировать ссылку', // cyrillic-ok: user-facing
    route: '🗺 Маршрут', // cyrillic-ok: user-facing
    calendar: '📅 В календарь', // cyrillic-ok: user-facing
    done: '✅ Состоялась', // cyrillic-ok: user-facing
    missed: '❌ Не состоялась', // cyrillic-ok: user-facing
    remind: 'Напомню', // cyrillic-ok: user-facing
    noRemind: 'Напоминаний не будет: до начала меньше пяти минут.', // cyrillic-ok: user-facing
    minutes: 'мин', // cyrillic-ok: user-facing
  },
  en: {
    created: '✅ Meeting scheduled',
    moved: '🔁 Meeting moved',
    before: '⏰ Meeting reminder',
    followup: '🤝 How did the meeting go?',
    online: '💻 Online',
    offline: '📍',
    coming: "✅ I'm coming",
    later: '⏰ Later',
    cancel: '❌ Cancel',
    join: '🔗 Join',
    copy: '📋 Copy link',
    route: '🗺 Directions',
    calendar: '📅 Add to calendar',
    done: '✅ It happened',
    missed: "❌ It didn't happen",
    remind: 'Reminders',
    noRemind: 'No reminders: it starts in less than five minutes.',
    minutes: 'min',
  },
} as const

/** Where the calendar file lives. Public, behind the meeting's own ics_token. */
export const icsUrl = (m: Pick<Meeting, 'ics_token'>) =>
  `${(process.env.PUBLIC_URL || 'https://vibee-render-production.up.railway.app').replace(/\/+$/, '')}${SPEC.ICS_PATH}?t=${encodeURIComponent(m.ics_token)}`

/** UTC as the words an old client shows in place of the time entity. */
const utcWords = (d: Date) =>
  `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`

/**
 * The message. User text is escaped; the only markup is ours. `withTime`
 * false is the same card for a host that cannot parse `tg-time`.
 */
export function cardText(
  m: Meeting,
  kind: CardKind,
  o: { withTime?: boolean; offsets?: number[] } = {}
): string {
  const w = WORDS[m.lang]
  const unix = Math.floor(m.starts_at.getTime() / 1000)
  const fallback = utcWords(m.starts_at)
  const when =
    o.withTime === false
      ? fallback
      : `<tg-time unix="${unix}" format="wDT">${fallback}</tg-time>` +
        (kind === 'followup'
          ? ''
          : ` · <tg-time unix="${unix}" format="r">${fallback}</tg-time>`)
  const lines = [
    `<b>${w[kind]}</b>`,
    '',
    `📅 <b>${escapeHtml(m.title)}</b>`,
    `🕒 ${when}`,
  ]
  if (m.mode === 'online') lines.push(w.online)
  else if (m.place) lines.push(`${w.offline} ${escapeHtml(m.place)}`)
  if (m.notes && kind !== 'before')
    lines.push('', `<i>${escapeHtml(m.notes)}</i>`)
  if (o.offsets) {
    lines.push(
      '',
      o.offsets.length
        ? `🔔 ${w.remind}: ${o.offsets.map(n => offsetWords(n, m.lang)).join(', ')}`
        : `🔔 ${w.noRemind}`
    )
  }
  return lines.join('\n')
}

export function offsetWords(minutes: number, lang: Lang): string {
  const ru = lang === 'ru'
  if (minutes % 1440 === 0) {
    const d = minutes / 1440
    return ru
      ? d === 1
        ? 'за день'
        : `за ${d} дн.`
      : d === 1
        ? '1 day before'
        : `${d} days before` // cyrillic-ok: user-facing
  }
  if (minutes % 60 === 0) {
    const h = minutes / 60
    return ru
      ? h === 1
        ? 'за час'
        : `за ${h} ч`
      : h === 1
        ? '1 hour before'
        : `${h} hours before` // cyrillic-ok: user-facing
  }
  return ru ? `за ${minutes} ${WORDS.ru.minutes}` : `${minutes} min before` // cyrillic-ok: user-facing
}

type Button = Record<string, unknown>

/** The link rows: join + copy for online, directions for a place, calendar always. */
function linkRows(m: Meeting): Button[][] {
  const w = WORDS[m.lang]
  const rows: Button[][] = []
  if (m.mode === 'online' && m.url) {
    rows.push([
      { text: w.join, url: m.url },
      { text: w.copy, copy_text: { text: m.url.slice(0, 256) } },
    ])
  }
  if (m.mode === 'offline' && m.place) {
    rows.push([
      {
        text: w.route,
        url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(m.place)}`,
      },
    ])
  }
  rows.push([{ text: w.calendar, url: icsUrl(m) }])
  return rows
}

/** The buttons under a card of this kind. */
export function cardMarkup(
  m: Meeting,
  kind: CardKind
): { inline_keyboard: Button[][] } {
  const w = WORDS[m.lang]
  const t = m.tap_token
  const first: Button[] =
    kind === 'followup'
      ? [
          {
            text: w.done,
            callback_data: callbackData('done', t),
            style: 'success',
          },
          {
            text: w.missed,
            callback_data: callbackData('missed', t),
            style: 'danger',
          },
        ]
      : [
          {
            text: w.coming,
            callback_data: callbackData('ok', t),
            style: 'success',
          },
          ...(kind === 'before'
            ? [
                {
                  text: w.later,
                  callback_data: callbackData('later', t),
                  style: 'primary',
                },
              ]
            : []),
          {
            text: w.cancel,
            callback_data: callbackData('cancel', t),
            style: 'danger',
          },
        ]
  return {
    inline_keyboard: [first, ...(kind === 'followup' ? [] : linkRows(m))],
  }
}

/**
 * The card after a press: the outcome as a disabled button, the links kept.
 * The disabled button repeats the press that settled it, so on a host older
 * than the flag a second press lands on the same idempotent answer.
 */
export function settledMarkup(m: Meeting, action: Action, outcome: string) {
  return {
    inline_keyboard: [
      [
        {
          text: outcome.slice(0, 40),
          callback_data: callbackData(action, m.tap_token),
          disabled: true,
        },
      ],
      ...(m.status === 'cancelled' || action === 'done' || action === 'missed'
        ? []
        : linkRows(m)),
    ],
  }
}

export type Send = (
  telegramId: string,
  text: string,
  markup: unknown,
  options: { parseMode: 'HTML' }
) => Promise<void>

const defaultSend: Send = (id, text, markup, options) =>
  sendToTelegram(id, text, markup, options)

/**
 * Send a card. A host that cannot parse the time entity gets the same card
 * with UTC words instead; any other refusal is the caller's to record.
 */
export async function sendCard(
  m: Meeting,
  kind: CardKind,
  o: { offsets?: number[]; send?: Send } = {}
): Promise<void> {
  const send = o.send ?? defaultSend
  const markup = cardMarkup(m, kind)
  try {
    await send(
      m.telegram_id,
      cardText(m, kind, { offsets: o.offsets }),
      markup,
      { parseMode: 'HTML' }
    )
  } catch (e) {
    if (!/pars|entit|tag/i.test(String(e))) throw e
    await send(
      m.telegram_id,
      cardText(m, kind, { offsets: o.offsets, withTime: false }),
      markup,
      { parseMode: 'HTML' }
    )
  }
}

// ---- The calendar file -------------------------------------------------------------

const icsText = (s: string) =>
  s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')

const icsTime = (d: Date) =>
  d
    .toISOString()
    .replace(/[-:]/g, '')
    .replace(/\.\d{3}/, '')

/** RFC 5545 folding: no line longer than 75 octets, continuation starts with a space. */
function fold(line: string): string {
  const out: string[] = []
  let cur = ''
  let bytes = 0
  for (const ch of line) {
    const n = Buffer.byteLength(ch)
    if (bytes + n > (out.length ? 74 : 75)) {
      out.push(cur)
      cur = ''
      bytes = 0
    }
    cur += ch
    bytes += n
  }
  out.push(cur)
  return out.join('\r\n ')
}

/** One VEVENT with one alarm at the soonest default reminder. */
export function icsFor(m: Meeting, now = new Date()): string {
  const where = m.mode === 'offline' ? (m.place ?? '') : (m.url ?? '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//t27.ai//meetings//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:meeting-${m.id}@t27.ai`,
    `DTSTAMP:${icsTime(now)}`,
    `DTSTART:${icsTime(m.starts_at)}`,
    `DTEND:${icsTime(m.ends_at)}`,
    `SUMMARY:${icsText(m.title)}`,
    ...(where ? [`LOCATION:${icsText(where)}`] : []),
    ...(m.url ? [`URL:${m.url}`] : []),
    ...(m.notes ? [`DESCRIPTION:${icsText(m.notes)}`] : []),
    `STATUS:${m.status === 'cancelled' ? 'CANCELLED' : 'CONFIRMED'}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    `DESCRIPTION:${icsText(m.title)}`,
    `TRIGGER:-PT${SPEC.REMIND_SOON_MIN}M`,
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return lines.map(fold).join('\r\n') + '\r\n'
}

/** The calendar file for a token, or null. No session: the token is the key. */
export async function icsByToken(
  pool: Pool,
  token: string
): Promise<string | null> {
  const t = String(token ?? '').trim()
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(t)) return null
  await ensureMeetingTables(pool)
  const r = await pool.query(
    `SELECT * FROM ${SPEC.TABLE} WHERE ics_token = $1`,
    [t]
  )
  return r.rows[0] ? icsFor(rowToMeeting(r.rows[0])) : null
}

// ---- The sweep -----------------------------------------------------------------------

export interface SweepResult {
  claimed: number
  sent: number
  skipped: number
  failed: number
}

/**
 * One tick: claim what is due, mark it, then send. A reminder for a meeting
 * that has begun is claimed and skipped, never sent; so is a follow-up for a
 * cancelled one. At most CLAIM_PER_TICK rows; the rest are due again next tick.
 */
export async function sweepMeetings(
  pool: Pool,
  o: { now?: Date; send?: Send } = {}
): Promise<SweepResult> {
  await ensureMeetingTables(pool)
  const now = o.now ?? new Date()
  const claimed = await pool.query(
    `UPDATE ${SPEC.REMINDERS_TABLE} r SET sent_at = $1
       WHERE r.id IN (
         SELECT r2.id FROM ${SPEC.REMINDERS_TABLE} r2
          WHERE r2.sent_at IS NULL AND r2.fire_at <= $1
          ORDER BY r2.fire_at
          LIMIT $2
          FOR UPDATE SKIP LOCKED)
     RETURNING r.id, r.meeting_id, r.kind, r.fire_at, r.offset_min`,
    [now, SPEC.CLAIM_PER_TICK]
  )
  const out: SweepResult = {
    claimed: claimed.rows.length,
    sent: 0,
    skipped: 0,
    failed: 0,
  }
  if (!claimed.rows.length) return out
  const ids = [...new Set(claimed.rows.map((r: any) => Number(r.meeting_id)))]
  const ms = await pool.query(
    `SELECT * FROM ${SPEC.TABLE} WHERE id = ANY($1::int[])`,
    [ids]
  )
  const byId = new Map(ms.rows.map((r: any) => [Number(r.id), rowToMeeting(r)]))
  const nowS = Math.floor(now.getTime() / 1000)
  for (const row of claimed.rows) {
    const m = byId.get(Number(row.meeting_id))
    const fireS = Math.floor(new Date(row.fire_at).getTime() / 1000)
    const kind: CardKind = row.kind === 'followup' ? 'followup' : 'before'
    const open = !!m && OPEN.includes(m.status)
    const due =
      !!m &&
      open &&
      (kind === 'followup'
        ? followsUp(nowS, Math.floor(m.ends_at.getTime() / 1000), false)
        : firesBefore(nowS, fireS, Math.floor(m.starts_at.getTime() / 1000)))
    let outcome = 'skipped'
    if (m && due) {
      try {
        await sendCard(m, kind, { send: o.send })
        outcome = 'sent'
      } catch (e) {
        outcome = `failed: ${String(e).slice(0, 120)}`
      }
    }
    if (outcome === 'sent') out.sent++
    else if (outcome === 'skipped') out.skipped++
    else out.failed++
    await pool
      .query(`UPDATE ${SPEC.REMINDERS_TABLE} SET outcome = $2 WHERE id = $1`, [
        row.id,
        outcome,
      ])
      .catch(() => undefined)
  }
  return out
}

// ---- The tap -------------------------------------------------------------------------

const SAID = {
  ru: {
    gone: 'Эта встреча не найдена — возможно, её уже удалили.', // cyrillic-ok: user-facing
    cancelledAlready: 'Эта встреча уже отменена.', // cyrillic-ok: user-facing
    ok: '✅ Отлично, отметил: вы будете.', // cyrillic-ok: user-facing
    okShort: '✅ Буду', // cyrillic-ok: user-facing
    later: `⏰ Напомню ещё раз через ${SPEC.SNOOZE_MIN} минут.`, // cyrillic-ok: user-facing
    laterShort: '⏰ Напомню позже', // cyrillic-ok: user-facing
    tooLate: '⏰ До начала меньше десяти минут — уже пора выходить.', // cyrillic-ok: user-facing
    cancel: '❌ Встреча отменена, напоминаний больше не будет.', // cyrillic-ok: user-facing
    cancelShort: '❌ Отменена', // cyrillic-ok: user-facing
    done: '✅ Отметил: встреча состоялась.', // cyrillic-ok: user-facing
    doneShort: '✅ Состоялась', // cyrillic-ok: user-facing
    missed: 'Отметил: не состоялась. Напишите агенту новое время — перенесу.', // cyrillic-ok: user-facing
    missedShort: '❌ Не состоялась', // cyrillic-ok: user-facing
  },
  en: {
    gone: 'This meeting was not found; it may have been deleted.',
    cancelledAlready: 'This meeting is already cancelled.',
    ok: "✅ Great, noted: you're coming.",
    okShort: "✅ I'm coming",
    later: `⏰ I'll remind you again in ${SPEC.SNOOZE_MIN} minutes.`,
    laterShort: "⏰ I'll remind you",
    tooLate: '⏰ It starts in less than ten minutes: time to go.',
    cancel: '❌ Meeting cancelled; no more reminders.',
    cancelShort: '❌ Cancelled',
    done: '✅ Noted: the meeting happened.',
    doneShort: '✅ It happened',
    missed:
      "Noted: it didn't happen. Tell the agent a new time and I'll move it.",
    missedShort: "❌ Didn't happen",
  },
} as const

export interface AnswerResult {
  said: string
  /** The card's buttons after the press, or absent to leave them. */
  markup?: unknown
}

/**
 * A tap on a card, relayed by the bot as the person who pressed it. The token
 * alone is not enough: the meeting must also be the presser's (OWNER_ONLY), so
 * a forwarded card pressed by someone else changes nothing.
 */
export async function answerTap(
  pool: Pool,
  presser: string,
  action: unknown,
  token: unknown,
  now = new Date()
): Promise<AnswerResult> {
  await ensureMeetingTables(pool)
  const t = String(token ?? '')
  const a = String(action ?? '') as Action
  const r = await pool.query(
    `SELECT * FROM ${SPEC.TABLE} WHERE tap_token = $1`,
    [t]
  )
  const row = r.rows[0]
  const m = row ? rowToMeeting(row) : null
  if (
    !m ||
    !ACTIONS.includes(a) ||
    !mayAnswer(m.telegram_id === String(presser), m.tap_token === t)
  ) {
    return { said: SAID[m?.lang ?? 'ru'].gone }
  }
  const s = SAID[m.lang]
  const nowS = Math.floor(now.getTime() / 1000)
  const startsS = Math.floor(m.starts_at.getTime() / 1000)
  if (m.status === 'cancelled' && a !== 'cancel') {
    return {
      said: s.cancelledAlready,
      markup: settledMarkup(m, 'cancel', s.cancelShort),
    }
  }
  const setStatus = async (status: string) => {
    await pool.query(
      `UPDATE ${SPEC.TABLE} SET status = $3, updated_at = now() WHERE id = $1 AND telegram_id = $2`,
      [m.id, m.telegram_id, status]
    )
    m.status = status
  }
  switch (a) {
    case 'ok':
      await setStatus('confirmed')
      return { said: s.ok, markup: settledMarkup(m, a, s.okShort) }
    case 'later':
      if (!snoozeAllowed(nowS, startsS))
        return { said: s.tooLate, markup: settledMarkup(m, a, s.tooLate) }
      {
        /*
         * IDEMPOTENT, so a relay that lost the answer may give the buttons
         * back. A snooze is the one 'before' row with no offset; while one
         * still waits, a second press adds none and answers the same -- true,
         * the first one will ring. Planned reminders carry an offset and do
         * not count.
         */
        const pending = await pool.query(
          `SELECT count(*)::int AS n FROM ${SPEC.REMINDERS_TABLE}
            WHERE meeting_id = $1 AND kind = 'before'
              AND offset_min IS NULL AND sent_at IS NULL`,
          [m.id]
        )
        if (snoozeAdds(Number(pending.rows?.[0]?.n ?? 0)))
          await pool.query(
            `INSERT INTO ${SPEC.REMINDERS_TABLE} (meeting_id, kind, fire_at) VALUES ($1, 'before', $2)`,
            [m.id, new Date(now.getTime() + SPEC.SNOOZE_MIN * MIN_MS)]
          )
      }
      return { said: s.later, markup: settledMarkup(m, a, s.laterShort) }
    case 'cancel':
      await setStatus('cancelled')
      await pool.query(
        `DELETE FROM ${SPEC.REMINDERS_TABLE} WHERE meeting_id = $1 AND sent_at IS NULL`,
        [m.id]
      )
      return { said: s.cancel, markup: settledMarkup(m, a, s.cancelShort) }
    case 'done':
      await setStatus('done')
      return { said: s.done, markup: settledMarkup(m, a, s.doneShort) }
    case 'missed':
      await setStatus('missed')
      return { said: s.missed, markup: settledMarkup(m, a, s.missedShort) }
  }
}

// ---- The tools ----------------------------------------------------------------------

function summary(m: Meeting) {
  return {
    id: m.id,
    title: m.title,
    starts_at: m.starts_at.toISOString(),
    ends_at: m.ends_at.toISOString(),
    mode: m.mode,
    place: m.place,
    url: m.url,
    notes: m.notes,
    status: m.status,
    calendar_url: icsUrl(m),
  }
}

/** Fields shared by create and update, checked once. */
function readFields(
  args: Record<string, any>,
  nowMs: number,
  base?: Meeting
):
  | { error: string }
  | {
      title: string
      startsMs: number
      endsMs: number
      mode: Mode
      place: string | null
      url: string | null
      notes: string | null
      lang: Lang
      timeChanged: boolean
    } {
  const title =
    args.title !== undefined
      ? clean(args.title, SPEC.TITLE_MAX)
      : (base?.title ?? '')
  if (!title) return { error: 'title is required' }
  let startsMs = base?.starts_at.getTime() ?? NaN
  let timeChanged = false
  if (args.starts_at !== undefined) {
    const parsed = parseStart(args.starts_at, args.tz)
    if ('error' in parsed) return parsed
    startsMs = parsed.ms
    timeChanged = true
  }
  if (!Number.isFinite(startsMs)) return { error: 'starts_at is required' }
  if (timeChanged && startsMs <= nowMs)
    return { error: 'starts_at is in the past' }
  if (startsMs > nowMs + SPEC.MAX_AHEAD_DAYS * DAY_MS)
    return { error: `starts_at is more than ${SPEC.MAX_AHEAD_DAYS} days ahead` }
  const duration =
    args.duration_min !== undefined
      ? clampDuration(args.duration_min)
      : base
        ? Math.round(
            (base.ends_at.getTime() - base.starts_at.getTime()) / MIN_MS
          )
        : SPEC.DURATION_DEFAULT_MIN
  if (args.duration_min !== undefined || args.starts_at !== undefined)
    timeChanged = true
  const mode: Mode =
    args.mode !== undefined
      ? args.mode === 'offline'
        ? 'offline'
        : 'online'
      : (base?.mode ?? 'online')
  const place =
    args.place !== undefined
      ? clean(args.place, SPEC.PLACE_MAX) || null
      : (base?.place ?? null)
  const urlRead =
    args.url !== undefined ? meetingUrl(args.url) : (base?.url ?? null)
  if (urlRead && typeof urlRead === 'object') return urlRead
  const notes =
    args.notes !== undefined
      ? clean(args.notes, SPEC.NOTES_MAX) || null
      : (base?.notes ?? null)
  if (mode === 'offline' && !place)
    return { error: 'an in-person meeting needs a place' }
  return {
    title,
    startsMs,
    endsMs: startsMs + duration * MIN_MS,
    mode,
    place,
    url: urlRead as string | null,
    notes,
    lang: args.lang !== undefined ? langOf(args.lang) : (base?.lang ?? 'ru'),
    timeChanged,
  }
}

const TIME_HELP =
  'ISO 8601. With a UTC offset (2026-10-02T15:00+03:00), or without one plus tz. If the person did not say their city or time zone and you do not know it, ASK -- never guess.'

const fieldSchema = {
  title: {
    type: 'string',
    description: `What the meeting is, up to ${SPEC.TITLE_MAX} chars.`,
  },
  starts_at: { type: 'string', description: TIME_HELP },
  tz: {
    type: 'string',
    description:
      'IANA time zone for a starts_at without offset, e.g. Europe/Moscow.',
  },
  duration_min: {
    type: 'integer',
    description: `Length in minutes, ${SPEC.DURATION_MIN_MIN}..${SPEC.DURATION_MAX_MIN}; default ${SPEC.DURATION_DEFAULT_MIN}.`,
  },
  mode: {
    type: 'string',
    enum: [...MODES],
    description: 'online (a call) or offline (in person).',
  },
  place: {
    type: 'string',
    description: 'Address or venue, required for offline.',
  },
  url: { type: 'string', description: 'https link to the call, for online.' },
  notes: { type: 'string', description: 'Agenda or anything to remember.' },
  lang: {
    type: 'string',
    enum: ['ru', 'en'],
    description: "Language of the person's cards; default ru.",
  },
}

export const MEETING_TOOLS: AgentTool[] = [
  {
    name: SPEC.TOOL_CREATE,
    description:
      'Create a meeting for THIS person (online call or in person) and remind them in Telegram before it ' +
      `(default ${SPEC.REMIND_DAY_MIN / 60} h, ${SPEC.REMIND_HOUR_MIN} min and ${SPEC.REMIND_SOON_MIN} min before), then ask afterwards how it went. ` +
      'Sends them a confirmation card at once, with buttons: I am coming / cancel, join or directions, add to calendar. ' +
      'The time renders in their own time zone. Ask for the time zone if starts_at has no offset and you do not know it.',
    parameters: {
      type: 'object',
      properties: {
        ...fieldSchema,
        remind_min: {
          type: 'array',
          items: { type: 'integer' },
          description: `Minutes before the start, each ${SPEC.REMIND_FLOOR_MIN}..${SPEC.REMIND_CEIL_MIN}, at most ${SPEC.MAX_REMINDERS}. Omit for the defaults; [] for none.`,
        },
      },
      required: ['title', 'starts_at'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const pool = ctx.pool
      await ensureMeetingTables(pool)
      const nowMs = Date.now()
      const f = readFields(args, nowMs)
      if ('error' in f) return { ok: false, error: f.error }
      const n = await pool.query(
        `SELECT count(*)::int AS n FROM ${SPEC.TABLE}
          WHERE telegram_id = $1 AND status = ANY($2) AND ends_at > now()`,
        [ctx.telegramId, OPEN]
      )
      if ((n.rows[0]?.n ?? 0) >= SPEC.MAX_UPCOMING)
        return {
          ok: false,
          error: `already ${SPEC.MAX_UPCOMING} upcoming meetings; cancel some first`,
        }
      const ins = await pool.query(
        `INSERT INTO ${SPEC.TABLE}
           (telegram_id, title, starts_at, ends_at, mode, place, url, notes, lang, tap_token, ics_token)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *`,
        [
          ctx.telegramId,
          f.title,
          new Date(f.startsMs),
          new Date(f.endsMs),
          f.mode,
          f.place,
          f.url,
          f.notes,
          f.lang,
          newToken(),
          newToken(),
        ]
      )
      const m = rowToMeeting(ins.rows[0])
      const fires = await planReminders(pool, m, nowMs, args.remind_min)
      const offsets = reminderOffsets(
        nowMs,
        m.starts_at.getTime(),
        args.remind_min
      )
      let card_sent = false
      let card_error: string | undefined
      if (!ctx.probe) {
        try {
          await sendCard(m, 'created', { offsets })
          card_sent = true
        } catch (e) {
          card_error = String(e).slice(0, 200)
        }
      }
      return {
        ok: true,
        meeting: summary(m),
        reminders: fires,
        card_sent,
        ...(card_error ? { card_error } : {}),
      }
    },
  },
  {
    name: SPEC.TOOL_LIST,
    description:
      "This person's meetings that have not ended yet, soonest first (with past ones if include_past).",
    parameters: {
      type: 'object',
      properties: { include_past: { type: 'boolean' } },
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      await ensureMeetingTables(ctx.pool)
      const r = await ctx.pool.query(
        `SELECT * FROM ${SPEC.TABLE}
          WHERE telegram_id = $1 AND ($2::boolean OR (ends_at > now() AND status <> 'cancelled'))
          ORDER BY starts_at ${args.include_past ? 'DESC' : 'ASC'} LIMIT 50`,
        [ctx.telegramId, !!args.include_past]
      )
      return { meetings: r.rows.map(rowToMeeting).map(summary) }
    },
  },
  {
    name: SPEC.TOOL_UPDATE,
    description:
      "Change one of this person's meetings by id. A new time replans the reminders and sends them the moved card.",
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'integer' },
        ...fieldSchema,
        remind_min: { type: 'array', items: { type: 'integer' } },
      },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      const pool = ctx.pool
      await ensureMeetingTables(pool)
      const r = await pool.query(
        `SELECT * FROM ${SPEC.TABLE} WHERE id = $1 AND telegram_id = $2`,
        [Number(args.id) || 0, ctx.telegramId]
      )
      if (!r.rows[0]) return { ok: false, error: 'no such meeting of yours' }
      const base = rowToMeeting(r.rows[0])
      if (base.status === 'cancelled')
        return {
          ok: false,
          error: 'this meeting is cancelled; create a new one',
        }
      const nowMs = Date.now()
      const f = readFields(args, nowMs, base)
      if ('error' in f) return { ok: false, error: f.error }
      const up = await pool.query(
        `UPDATE ${SPEC.TABLE}
            SET title=$3, starts_at=$4, ends_at=$5, mode=$6, place=$7, url=$8, notes=$9, lang=$10,
                status = CASE WHEN $11 THEN 'planned' ELSE status END, updated_at=now()
          WHERE id=$1 AND telegram_id=$2 RETURNING *`,
        [
          base.id,
          ctx.telegramId,
          f.title,
          new Date(f.startsMs),
          new Date(f.endsMs),
          f.mode,
          f.place,
          f.url,
          f.notes,
          f.lang,
          f.timeChanged,
        ]
      )
      const m = rowToMeeting(up.rows[0])
      let fires: string[] | undefined
      let card_sent = false
      if (f.timeChanged || args.remind_min !== undefined) {
        fires = await planReminders(pool, m, nowMs, args.remind_min)
      }
      if (f.timeChanged && !ctx.probe) {
        try {
          await sendCard(m, 'moved', {
            offsets: reminderOffsets(
              nowMs,
              m.starts_at.getTime(),
              args.remind_min
            ),
          })
          card_sent = true
        } catch {
          card_sent = false
        }
      }
      return {
        ok: true,
        meeting: summary(m),
        ...(fires ? { reminders: fires } : {}),
        card_sent,
      }
    },
  },
  {
    name: SPEC.TOOL_CANCEL,
    description:
      "Cancel one of this person's meetings by id. Unsent reminders are dropped.",
    parameters: {
      type: 'object',
      properties: { id: { type: 'integer' } },
      required: ['id'],
      additionalProperties: false,
    },
    handler: async (args, ctx) => {
      await ensureMeetingTables(ctx.pool)
      const r = await ctx.pool.query(
        `UPDATE ${SPEC.TABLE} SET status='cancelled', updated_at=now()
          WHERE id=$1 AND telegram_id=$2 RETURNING id`,
        [Number(args.id) || 0, ctx.telegramId]
      )
      if (!r.rows[0]) return { ok: false, error: 'no such meeting of yours' }
      await ctx.pool.query(
        `DELETE FROM ${SPEC.REMINDERS_TABLE} WHERE meeting_id = $1 AND sent_at IS NULL`,
        [r.rows[0].id]
      )
      return { ok: true, id: r.rows[0].id, status: 'cancelled' }
    },
  },
  {
    name: SPEC.TOOL_ANSWER,
    description:
      'The bot relays a tap on a meeting card (I am coming / later / cancel / happened / did not). Not for the model: it needs the card token.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS] },
        token: { type: 'string' },
      },
      required: ['action', 'token'],
      additionalProperties: false,
    },
    handler: async (args, ctx) =>
      answerTap(ctx.pool, ctx.telegramId, args.action, args.token),
  },
]
