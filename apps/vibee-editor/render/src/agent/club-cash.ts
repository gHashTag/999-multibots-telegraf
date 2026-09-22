/**
 * A CLUB MONTH PAID IN CASH -- RECORDED BY THE OWNER, BOOKED LIKE A STARS MONTH.
 *
 * Two VIP clients pay the owner for the club in cash (2026-09-22). Until now
 * the only way to write that down was a token purchase: the tokens arrived,
 * the club did not -- /api/club/status kept answering "not a member", and
 * the app kept showing them the paywall for a month they had paid for.
 *
 * So the owner (or a keeper) records "club month paid in cash for <id>", and
 * the month goes into the SAME store the Telegram subscription writes:
 * `club_period`, the table /api/club/status reads. Nothing new decides
 * membership; a cash month is a paid period like any other, marked by its
 * transaction id (`cash:<telegram_id>:<start day>`, CASH_TX_PREFIX) so status
 * can say `paid_via: 'cash'`.
 *
 * THE TOKENS BACK ARE WHAT A STARS MONTH GIVES, THROUGH THE SAME DOOR. A paid
 * Stars month credits `clubTokensPerPeriod()` through creditStarsPayment
 * (charge id `club:<tx id>`, ledger kind 'purchase'). A cash month credits the
 * same number through the same function, charge id `club:cash:<id>:<day>`, and
 * with a reason that says cash -- the person reads "paid in cash" in their
 * history, never "Telegram Stars". payments_v2 is never written: it is the
 * archive (docs/architecture/single-wallet-decision.md).
 *
 * IDEMPOTENT PER PERSON AND PERIOD START. The transaction id is the unique key
 * of club_period, so a second call for the same day writes nothing. It still
 * asks for the credit again, because that is idempotent too (the charge id is
 * the primary key of star_payments): a month whose credit failed the first
 * time is repaired by repeating the command, and a month already credited is
 * not credited twice.
 *
 * MONTHS DO NOT OVERLAP AND DO NOT FLOAT. The start defaults to today (UTC);
 * a start inside a paid period that is still running is refused with the day
 * the next month may start, and a start later than that day -- or later than
 * today when nothing runs -- is refused too. So a repeated or mistyped command
 * cannot hand out two months for the same days, and a month recorded ahead of
 * time always joins the one before it.
 *
 * WHO MAY. Only the platform owner or a keeper: the person who took the money.
 * And only by a DIRECT call -- /mcp or an a2a tool call, where the call itself
 * is that person's act. The render's own model turns never see this tool
 * (DIRECT_CALL_ONLY in tools.ts): those turns read other people's words --
 * client DMs, CRM threads, web pages -- and a sentence in a client's message
 * must not be able to talk the owner's agent into a free month.
 */
import { record } from '../hive/journal'
import { keepers } from '../hive/roles'
import { creditStarsPayment } from '../stars-credit'
import { parseDay } from './club-guests'
import {
  CASH_TX_PREFIX,
  CLUB_PERIOD_S,
  clubTokensPerPeriod,
  ensureClubTables,
  grantDay,
  type Credit,
} from './club-membership'
import { OWNER_TELEGRAM_ID } from './telegram-tools'
import type { AgentTool } from './tools'

type Queryable = { query: (sql: string, params?: unknown[]) => Promise<any> }

/** What the person reads in their token history for a cash month. */
export const CASH_MONTH_REASON = 'клуб: месяц оплачен наличными' // cyrillic-ok: ledger reason shown to the person

const DAY_MS = 24 * 60 * 60 * 1000

const dayOf = (d: Date): string => d.toISOString().slice(0, 10)

/** The first UTC midnight at or after `d`: where the next month may begin. */
function nextDayStart(d: Date): Date {
  const midnight = grantDay(d)
  return midnight.getTime() === d.getTime()
    ? midnight
    : new Date(midnight.getTime() + DAY_MS)
}

/** club_period.star_tx_id of a cash month: one per person per start day. */
export function cashTxId(telegramId: string, start: Date): string {
  return `${CASH_TX_PREFIX}${telegramId}:${dayOf(start)}`
}

/** The platform owner, or a keeper -- nobody else records money taken by hand. */
export function mayRecordCash(who: string): boolean {
  const id = String(who ?? '').trim()
  if (!id) return false
  return id === OWNER_TELEGRAM_ID || keepers().includes(id)
}

export interface CashMonthInput {
  /** The member. */
  telegramId: string
  /** First day of the month, YYYY-MM-DD (UTC). Default: today. */
  start?: string
  /** Who recorded it (the verified caller) -- for the audit line. */
  by: string
}

export type CashMonth =
  | {
      ok: true
      /** 'now' = this call wrote the month; 'already' = it was on file. */
      recorded: 'now' | 'already'
      telegram_id: string
      start: string
      until: string
      tokens: number
      /** Whether THIS call credited the tokens. */
      credited: boolean
      credit_note?: string
    }
  | { ok: false; error: string; next_start?: string }

/**
 * The audit line. The member's id and the recorder's id, the dates and the
 * outcome -- never a name: this goes to the service log, which is read by
 * whoever has the log, not only by the owner.
 */
function audit(line: Record<string, string | number | boolean>): void {
  console.info(
    '[club] cash month',
    Object.entries(line)
      .map(([k, v]) => `${k}=${v}`)
      .join(' ')
  )
}

async function askCredit(
  credit: Credit,
  input: Parameters<Credit>[0]
): Promise<{ credited: boolean; reason?: string }> {
  try {
    return await credit(input)
  } catch (e) {
    return { credited: false, reason: String(e).slice(0, 160) }
  }
}

export async function recordCashClubMonth(
  pool: Queryable,
  input: CashMonthInput,
  credit: Credit,
  now: Date = new Date()
): Promise<CashMonth> {
  const tid = String(input.telegramId ?? '').trim()
  if (!/^\d{5,15}$/.test(tid)) {
    return { ok: false, error: 'нужен числовой telegram_id участника' } // cyrillic-ok: tool answer
  }
  const asked = String(input.start ?? '').trim()
  const start = asked ? parseDay(asked) : grantDay(now)
  if (!start) {
    return {
      ok: false,
      error:
        'start -- первый день месяца в виде ГГГГ-ММ-ДД, например 2026-09-22', // cyrillic-ok: tool answer
    }
  }
  const until = new Date(start.getTime() + CLUB_PERIOD_S * 1000)
  if (until.getTime() <= now.getTime()) {
    return {
      ok: false,
      error: `месяц с ${dayOf(start)} уже закончился ${dayOf(until)}: записывать нечего`, // cyrillic-ok: tool answer
    }
  }

  await ensureClubTables(pool)
  const key = cashTxId(tid, start)
  const tokens = clubTokensPerPeriod() // secret-guard-ok: token count, not a credential
  const creditInput = {
    telegramId: tid,
    tokens,
    chargeId: `club:${key}`,
    reason: CASH_MONTH_REASON,
  }
  const done = (
    recorded: 'now' | 'already',
    c: { credited: boolean; reason?: string }
  ): CashMonth => ({
    ok: true,
    recorded,
    telegram_id: tid,
    start: start.toISOString(),
    until: until.toISOString(),
    tokens,
    credited: c.credited,
    ...(c.credited ? {} : { credit_note: c.reason ?? '' }),
  })

  const seen = await pool.query(
    `SELECT id FROM club_period WHERE star_tx_id = $1 LIMIT 1`,
    [key]
  )
  if (!seen.rows?.length) {
    const latest = await pool.query(
      `SELECT until::text FROM club_period WHERE telegram_id = $1 ORDER BY until DESC LIMIT 1`,
      [tid]
    )
    const lastUntil = latest.rows?.[0]?.until
      ? new Date(String(latest.rows[0].until))
      : null
    if (lastUntil && lastUntil.getTime() > start.getTime()) {
      const next = dayOf(nextDayStart(lastUntil))
      return {
        ok: false,
        error:
          `клуб уже оплачен до ${dayOf(lastUntil)}, месяцы не накладываются. ` + // cyrillic-ok: tool answer
          `Следующий месяц начинается ${next}: передай start=${next}.`, // cyrillic-ok: tool answer
        next_start: next,
      }
    }
    const latestStart = Math.max(
      grantDay(now).getTime(),
      lastUntil ? nextDayStart(lastUntil).getTime() : 0
    )
    if (start.getTime() > latestStart) {
      return {
        ok: false,
        error:
          'месяц начинается сегодня или сразу после текущего оплаченного; ' + // cyrillic-ok: tool answer
          `более поздний start оставил бы дыру. Самый поздний день сейчас: ${dayOf(new Date(latestStart))}.`, // cyrillic-ok: tool answer
        next_start: dayOf(new Date(latestStart)),
      }
    }
    // The same INSERT a Stars charge makes (bookClubPeriods): the same table,
    // the same unique key. `stars` is 0 -- no Telegram Stars were charged, and
    // a sum over this column must not count cash as Stars.
    const ins = await pool.query(
      `INSERT INTO club_period (telegram_id, stars, tokens_granted, star_tx_id, paid_at, until)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (star_tx_id) DO NOTHING RETURNING id`,
      [tid, 0, tokens, key, start.toISOString(), until.toISOString()]
    )
    if (ins.rows?.length) {
      const c = await askCredit(credit, creditInput)
      audit({
        outcome: 'recorded',
        member: tid,
        start: dayOf(start),
        until: dayOf(until),
        tokens,
        credited: c.credited,
        by: input.by,
      })
      try {
        await record(pool as never, {
          kind: c.credited ? 'payment' : 'payment-lost',
          who: tid,
          amount: 0,
          what: c.credited
            ? `клуб, наличные: 30 дней до ${dayOf(until)}, ${tokens} токенов зачислено` // cyrillic-ok: journal text
            : `клуб, наличные: месяц записан, токены НЕ зачислены: ${c.reason ?? ''}`, // cyrillic-ok: journal text
          severity: c.credited ? 'normal' : 'alarm',
        })
      } catch {
        // The period row is the record that matters; the journal is a courtesy.
      }
      return done('now', c)
    }
    // Somebody else wrote this very month a moment ago: fall through to the
    // repeat path below, which writes nothing.
  }

  // Already on file. Nothing is written again; the credit is asked again
  // because it is idempotent on the charge id -- a lost credit is repaired, a
  // made one is refused as a redelivery.
  const c = await askCredit(credit, creditInput)
  audit({
    outcome: 'already-on-file',
    member: tid,
    start: dayOf(start),
    until: dayOf(until),
    credited_now: c.credited,
    by: input.by,
  })
  if (c.credited) {
    try {
      await record(pool as never, {
        kind: 'payment',
        who: tid,
        amount: 0,
        what: `клуб, наличные: токены месяца с ${dayOf(start)} зачислены повторной командой`, // cyrillic-ok: journal text
        severity: 'attention',
      })
    } catch {
      // Courtesy only, as above.
    }
  }
  return done('already', c)
}

/**
 * The owner's command, as a tool on the shared registry (and so on /mcp).
 * Refuses anyone but the platform owner or a keeper, by the VERIFIED caller in
 * the context -- never by an argument.
 */
export const CLUB_CASH_TOOLS: AgentTool[] = [
  {
    name: 'club_cash_month',
    description:
      'Только для владельца платформы и хранителей. Записать месяц клуба, оплаченный ' + // cyrillic-ok: tool description
      'наличными: человеку с этим telegram_id клуб открыт 30 дней, как после оплаты ' + // cyrillic-ok: tool description
      'звёздами, и начисляются те же токены месяца с пометкой «наличные». ' + // cyrillic-ok: tool description
      'Повтор с тем же днём начала ничего не удваивает. start -- первый день ' + // cyrillic-ok: tool description
      '(ГГГГ-ММ-ДД, UTC), по умолчанию сегодня; если оплаченный месяц ещё идёт, ' + // cyrillic-ok: tool description
      'инструмент назовёт день, с которого начать следующий.', // cyrillic-ok: tool description
    parameters: {
      type: 'object',
      properties: {
        telegram_id: {
          type: 'string',
          description: 'telegram_id участника, числом', // cyrillic-ok: tool description
        },
        start: {
          type: 'string',
          description:
            'первый день месяца, ГГГГ-ММ-ДД; по умолчанию сегодня (UTC)', // cyrillic-ok: tool description
        },
      },
      required: ['telegram_id'],
      additionalProperties: false,
    },
    async handler(args, ctx) {
      const by = String(ctx?.telegramId ?? '').trim()
      if (!mayRecordCash(by)) {
        throw new Error(
          'Оплату клуба наличными записывает только владелец платформы или хранитель: ' + // cyrillic-ok: refusal text
            'деньги принимал он, и отметку ставит тоже он.' // cyrillic-ok: refusal text
        )
      }
      const pool = ctx.pool as Queryable
      return recordCashClubMonth(
        pool,
        {
          telegramId: String(args?.telegram_id ?? ''),
          start: args?.start === undefined ? undefined : String(args.start),
          by,
        },
        c =>
          creditStarsPayment(pool, {
            chargeId: c.chargeId,
            telegramId: c.telegramId,
            amount: c.tokens,
            reason: c.reason,
          })
      )
    },
  },
]
