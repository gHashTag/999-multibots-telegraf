/**
 * THE QUEEN'S REPORT -- "WHAT CHANGED SINCE LAST TIME".
 *
 * Owner, 2026-09-07: "she keeps sending me understandable reports as the
 * project evolves", "so I can react in time".
 *
 * WHY "SINCE LAST TIME" AND NOT "FOR THE LAST 24 HOURS"
 *
 * A fixed-window report repeats itself: the same event arrives in the morning
 * digest and again in the evening one. A person quickly stops reading -- and
 * along with the repeats they stop seeing the single new line.
 *
 * Hence a cursor: the report covers only events the owner has not seen yet, and
 * it advances ONLY after a successful send. An undelivered report must not
 * silently eat a day of events.
 *
 * WHY THE FIRST RUN DOES NOT DUMP THE WHOLE HISTORY
 *
 * There is no cursor yet, and the temptation to "show everything accumulated"
 * would end in a thousand-line wall on day one. The first run plants the cursor
 * at the current moment and sends nothing. The owner gets their first report
 * when something happens, and that report is about what happened.
 *
 * SILENCE IS ALSO AN ANSWER, BUT NOT A MESSAGE
 *
 * If nothing happened, no report is sent. "Nothing happened today" every day
 * turns the channel into noise, and noise gets skimmed right up to the day
 * something important is in it.
 */

import {
  feed,
  ensureJournalTable,
  type JournalPool,
  type JournalRow,
} from './journal'
import { keepers } from './roles'

/** The cursor lives in the database: a Railway container does not survive a deploy. */
async function ensureCursorTable(pool: JournalPool): Promise<void> {
  await pool.query(
    `CREATE TABLE IF NOT EXISTS hive_report_cursor (
       who text PRIMARY KEY,
       last_id bigint NOT NULL,
       updated_at timestamptz NOT NULL DEFAULT now()
     )`
  )
}

async function readCursor(
  pool: JournalPool,
  who: string
): Promise<{ lastId: number; updatedAt: number } | null> {
  await ensureCursorTable(pool)
  const r = await pool.query(
    `SELECT last_id, updated_at FROM hive_report_cursor WHERE who = $1`,
    [who]
  )
  const row = r.rows?.[0]
  if (!row || row.last_id === undefined || row.last_id === null) return null
  const t = new Date(row.updated_at).getTime()
  return {
    lastId: Number(row.last_id),
    // An unreadable date means "long ago", not "just now": otherwise a parsing
    // failure would silently switch reports off forever.
    updatedAt: Number.isFinite(t) ? t : 0,
  }
}

async function writeCursor(
  pool: JournalPool,
  who: string,
  upTo: number
): Promise<void> {
  await ensureCursorTable(pool)
  await pool.query(
    `INSERT INTO hive_report_cursor (who, last_id) VALUES ($1, $2)
     ON CONFLICT (who) DO UPDATE SET last_id = EXCLUDED.last_id, updated_at = now()`,
    [who, upTo]
  )
}

/** The largest id in the journal. Needed to plant the cursor on the first run. */
async function newestId(pool: JournalPool): Promise<number> {
  await ensureJournalTable(pool)
  const r = await pool.query(
    `SELECT COALESCE(MAX(id), 0) AS newest FROM hive_events`
  )
  return Number(r.rows?.[0]?.newest ?? 0)
}

/**
 * The human name of an event.
 *
 * The report is read by a person, not parsed by a program. `code-refused` in a
 * message looks like a fragment of a log; "the sign-in code did not match"
 * looks like news. The owner reads Russian, so the message is Russian -- these
 * are string literals, which is the one place the bilingual bot keeps Russian.
 */
const NAMES: Record<string, string> = {
  'sign-in': 'вошли в приложение',
  'sign-in-refused': 'не смогли войти',
  'code-issued': 'запросили код для второго устройства',
  'code-claimed': 'вошли по коду с другого устройства',
  'code-refused': 'не подошёл код входа',
  'sign-out': 'вышли из приложения',
  'telegram-connected': 'подключили Telegram',
  'telegram-disconnected': 'отключили Telegram',
  payment: 'оплатили',
  invoice: 'выписан счёт, оплаты пока нет',
  'payment-failed': 'оплата сорвалась',
  'payment-cancelled': 'закрыли кассу, не заплатив',
  'payment-lost': 'платёж пришёл, а получателя не нашли',
  'payment-forged': 'подделали подпись платежа',
  'tokens-spent': 'потратили токены',
  'tokens-refunded': 'вернули токены',
  created: 'создали материал',
  published: 'опубликовали',
  unpublished: 'сняли с публикации',
  approved: 'одобрили работу агента',
  'sweep-idle': 'обход продавца: тихо',
  'sweep-card': 'обход продавца: подготовил карточку',
  'card-pressed': 'владелец нажал на карточке', // cyrillic-ok: report text
  'draft-unsent': 'картинка сделана, но не отправлена', // cyrillic-ok: report text
  'sweep-failed': 'обход продавца: сбой',
  failure: 'сбой',
}

function humanName(kind: string): string {
  return NAMES[kind] ?? kind
}

/**
 * Russian numeral agreement: the one/few/many forms differ by the last digits,
 * so the count and its noun cannot simply be concatenated.
 */
function plural(n: number, one: string, few: string, many: string): string {
  const h = Math.abs(n) % 100
  const t = h % 10
  if (h > 10 && h < 20) return many
  if (t > 1 && t < 5) return few
  if (t === 1) return one
  return many
}

/**
 * Build the report text.
 *
 * Separate from sending: the text can be checked without touching the network
 * or Telegram.
 */
export function reportText(events: JournalRow[]): string {
  const alarms = events.filter(e => e.severity === 'alarm')
  const tally = new Map<string, number>()
  for (const e of events) tally.set(e.kind, (tally.get(e.kind) ?? 0) + 1)

  const lines: string[] = []
  lines.push(
    `🐝 Улей: ${events.length} ${plural(events.length, 'событие', 'события', 'событий')} с прошлого отчёта`
  )
  lines.push('')

  for (const [kind, n] of [...tally.entries()].sort((a, b) => b[1] - a[1])) {
    lines.push(`• ${humanName(kind)} — ${n}`)
  }

  if (alarms.length) {
    lines.push('')
    lines.push(
      `⚠️ ${plural(alarms.length, 'Требует', 'Требуют', 'Требуют')} внимания:`
    )
    // At most five: a long list of alarms reads like wallpaper.
    for (const a of alarms.slice(0, 5)) {
      const when = new Date(a.at).toLocaleString('ru-RU', {
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
      lines.push(
        `  ${when} — ${humanName(a.kind)}${a.what ? ` (${a.what})` : ''}`
      )
    }
    if (alarms.length > 5) {
      lines.push(
        `  …и ещё ${alarms.length - 5}. Спросите агента: «покажи тревоги».`
      )
    }
  }

  lines.push('')
  lines.push('Подробности — в чате агента: «пульс проекта».')
  return lines.join('\n')
}

export interface ReportOutcome {
  what:
    | 'sent'
    | 'nothing to say'
    | 'first run'
    | 'not sent'
    | 'no keepers'
    | 'too soon'
  events?: number
}

/**
 * How long to wait between ordinary reports.
 *
 * Checking may be frequent; writing to a person must be rare. The owner asked
 * to "react in time", and that is about ALARMS: a guessed code, a lost payment,
 * a forged signature. Those go out immediately.
 *
 * Ordinary life -- sign-ins, generations, publishes -- accumulates and arrives
 * in a batch. Otherwise, on a platform with 2380 people, the report becomes a
 * stream, and a stream gets skimmed right up to the day something important is
 * in it.
 */
export const QUIET_GAP_MINUTES = 180

/**
 * Report to the hive keepers.
 *
 * `send` is passed in from outside so the check depends on neither the network
 * nor the bot token -- the same reason as in `notify-sign-in`.
 */
export async function report(
  pool: JournalPool,
  send: (who: string, text: string) => Promise<boolean>,
  {
    now = Date.now(),
    gapMinutes = QUIET_GAP_MINUTES,
  }: { now?: number; gapMinutes?: number } = {}
): Promise<ReportOutcome> {
  const who = keepers()
  if (!who.length) {
    // Not silently: without HIVE_KEEPERS there is nobody to report to, and that
    // is a setting rather than a fault. Silence here is indistinguishable from
    // "the project is quiet".
    return { what: 'no keepers' }
  }

  let outcome: ReportOutcome = { what: 'nothing to say' }

  for (const keeper of who) {
    const cursor = await readCursor(pool, keeper)

    if (cursor === null) {
      // First run: plant the mark and send nothing.
      await writeCursor(pool, keeper, await newestId(pool))
      outcome = { what: 'first run' }
      continue
    }

    const all = await feed(
      pool,
      { role: 'keeper', who: keeper, bots: null },
      { limit: 200 }
    )
    const fresh = all.filter(e => Number(e.id) > cursor.lastId)
    if (!fresh.length) continue

    /*
     * An alarm goes out immediately, the ordinary waits for the gap.
     *
     * This is the only place where the difference between "look now" and "read
     * later" becomes behaviour. Remove it in either direction and one of two
     * things breaks: either the owner learns about a guessed code three hours
     * late, or they get forty messages a day and stop opening them.
     */
    const urgent = fresh.some(e => e.severity === 'alarm')
    const elapsed = (now - cursor.updatedAt) / 60000
    if (!urgent && elapsed < gapMinutes) {
      outcome = { what: 'too soon', events: fresh.length }
      continue
    }

    const delivered = await send(keeper, reportText(fresh))
    if (!delivered) {
      // Do NOT advance the cursor. An undelivered report must not eat the
      // events: next time they go out together with the new ones.
      outcome = { what: 'not sent', events: fresh.length }
      continue
    }

    const upTo = Math.max(...fresh.map(e => Number(e.id)))
    await writeCursor(pool, keeper, upTo)
    outcome = { what: 'sent', events: fresh.length }
  }

  return outcome
}
