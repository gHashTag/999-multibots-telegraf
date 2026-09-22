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
 * TOKENS ALREADY GIVEN BY HAND ARE NOT GIVEN AGAIN. Before this tool existed
 * (2026-09-22) a cash member's month of tokens could only be handed out as a
 * plain ledger grant (ref `cash-club-<day>-<id>`, HAND_GIVEN_REF_PREFIX), with
 * no club month behind it. Recording that month now must not credit the same
 * tokens twice, and the tool cannot know by itself whether such a grant was
 * THIS month's -- so it asks. A hand grant of that shape newer than the
 * person's last recorded cash month stops the call, writing nothing, until the
 * caller says `tokens_already_given`: true records the month and credits
 * nothing (the row carries 0 tokens, so no later repeat credits it either),
 * false credits the month's tokens as usual.
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
import { ensureTokenLedger } from '../token-ledger'
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
  /**
   * The caller's answer about tokens handed out by hand for this month:
   * true = they were, record the month and credit nothing; false = they were
   * not, credit as usual; absent = not asked yet (a hand grant on file then
   * stops the call with the question).
   */
  tokensGivenAlready?: boolean
}

/**
 * The ref shape a cash member's tokens were handed out under before this tool
 * existed: `cash-club-<day>-<telegram_id>`, a plain ledger grant.
 */
export const HAND_GIVEN_REF_PREFIX = 'cash-club-'

export interface HandGiven {
  ref: string
  tokens: number
  at: string
}

/**
 * Tokens handed out by hand for a cash club month (HAND_GIVEN_REF_PREFIX) that
 * no recorded cash month has answered for yet: newer than the person's last
 * cash row in club_period. Once a month is recorded -- either way -- the grant
 * before it has been decided on and is not asked about again.
 */
async function tokensGivenByHand(
  pool: Queryable,
  tid: string
): Promise<HandGiven[]> {
  await ensureTokenLedger(pool as never)
  const last = await pool.query(
    `SELECT MAX(created_at)::text AS at FROM club_period WHERE telegram_id = $1 AND star_tx_id LIKE $2`,
    [tid, `${CASH_TX_PREFIX}%`]
  )
  const lastAt = last.rows?.[0]?.at
  const since = lastAt ? new Date(String(lastAt)).getTime() : -Infinity
  // Unsure is "not answered for": a time that cannot be read on either side
  // keeps the grant in the question rather than letting it through silently.
  const answeredFor = (at: unknown) => new Date(String(at)).getTime() <= since
  const r = await pool.query(
    `SELECT ref, delta, created_at::text AS at FROM token_ledger WHERE telegram_id = $1 AND ref LIKE $2 AND delta > 0 ORDER BY created_at`,
    [tid, `${HAND_GIVEN_REF_PREFIX}%`]
  )
  return (r.rows ?? [])
    .filter((row: { at: unknown }) => !answeredFor(row.at))
    .map((row: { ref: unknown; delta: unknown; at: unknown }) => ({
      ref: String(row.ref),
      tokens: Number(row.delta),
      at: String(row.at),
    }))
}

export type CashMonth =
  | {
      ok: true
      /** 'now' = this call wrote the month; 'already' = it was on file. */
      recorded: 'now' | 'already'
      telegram_id: string
      start: string
      until: string
      /** The tokens this month carries: a Stars month's, or 0 when given by hand. */
      tokens: number
      /** Whether THIS call credited the tokens. */
      credited: boolean
      credit_note?: string
      /** The month's tokens were handed out by hand before; none credited here. */
      tokens_by_hand?: true
    }
  | {
      ok: false
      error: string
      next_start?: string
      /** Hand grants the caller must say something about (tokens_already_given). */
      tokens_given_by_hand?: HandGiven[]
    }

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
  const byHand = input.tokensGivenAlready === true

  // Tokens handed out by hand for a cash month, not yet answered for: the
  // caller says whether they were this month's before anything is written.
  if (input.tokensGivenAlready === undefined) {
    const hand = await tokensGivenByHand(pool, tid)
    if (hand.length) {
      const list = hand
        .map(h => `${h.tokens} (${h.at.slice(0, 10)}, ${h.ref})`)
        .join('; ')
      return {
        ok: false,
        error:
          `этому человеку уже выданы токены за клуб наличными вручную: ${list}. Месяц не записан. ` + // cyrillic-ok: tool answer
          'Если это токены этого месяца -- повтори с tokens_already_given=true: месяц запишется без второго начисления. ' + // cyrillic-ok: tool answer
          'Если нет -- с tokens_already_given=false.', // cyrillic-ok: tool answer
        tokens_given_by_hand: hand,
      }
    }
  }

  const done = (
    recorded: 'now' | 'already',
    tokens: number,
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
    ...(tokens === 0 ? { tokens_by_hand: true as const } : {}),
  })
  const creditFor = (tokens: number) =>
    askCredit(credit, {
      telegramId: tid,
      tokens,
      chargeId: `club:${key}`,
      reason: CASH_MONTH_REASON,
    })
  const NOT_BY_US = {
    credited: false,
    reason: 'токены этого месяца выданы вручную раньше; здесь не начислялись', // cyrillic-ok: tool answer
  }
  const onFile = async () =>
    (
      await pool.query(
        `SELECT id, tokens_granted FROM club_period WHERE star_tx_id = $1 LIMIT 1`,
        [key]
      )
    ).rows?.[0] as { id: unknown; tokens_granted: unknown } | undefined

  let row = await onFile()
  if (!row) {
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
    // "Given by hand" with no hand grant on file would write a month of 0
    // tokens, and every later repeat reads that 0: a paying member left with
    // nothing and no way back through this tool (review of #2845). So the
    // answer is taken only when there is a grant it answers for.
    if (byHand && !(await tokensGivenByHand(pool, tid)).length) {
      return {
        ok: false,
        error:
          'tokens_already_given=true, но выданных вручную токенов за клуб у этого человека нет. ' + // cyrillic-ok: tool answer
          'Месяц не записан. Повтори без tokens_already_given: токены месяца начислятся.', // cyrillic-ok: tool answer
      }
    }
    // A Stars month's tokens, or none when they were handed out by hand: the
    // row says which, so no later repeat of the command can credit them.
    const tokens = byHand ? 0 : clubTokensPerPeriod() // secret-guard-ok: token count, not a credential
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
      const c = tokens > 0 ? await creditFor(tokens) : NOT_BY_US
      audit({
        outcome: 'recorded',
        member: tid,
        start: dayOf(start),
        until: dayOf(until),
        tokens,
        credited: c.credited,
        by: input.by,
      })
      const lost = tokens > 0 && !c.credited
      try {
        await record(pool as never, {
          kind: lost ? 'payment-lost' : 'payment',
          who: tid,
          amount: 0,
          what:
            tokens === 0
              ? `клуб, наличные: 30 дней до ${dayOf(until)}, токены месяца выданы вручную раньше` // cyrillic-ok: journal text
              : c.credited
                ? `клуб, наличные: 30 дней до ${dayOf(until)}, ${tokens} токенов зачислено` // cyrillic-ok: journal text
                : `клуб, наличные: месяц записан, токены НЕ зачислены: ${c.reason ?? ''}`, // cyrillic-ok: journal text
          severity: lost ? 'alarm' : 'normal',
        })
      } catch {
        // The period row is the record that matters; the journal is a courtesy.
      }
      return done('now', tokens, c)
    }
    // Somebody else wrote this very month a moment ago: fall through to the
    // repeat path below, which writes nothing.
    row = await onFile()
  }

  // Already on file. Nothing is written again. The credit is asked again when
  // the month carries tokens, because it is idempotent on the charge id -- a
  // lost credit is repaired, a made one is refused as a redelivery. A month
  // recorded without tokens (given by hand) stays without them, and so does
  // one the caller now says was paid by hand.
  const tokens = Number(row?.tokens_granted ?? 0)
  const c = tokens > 0 && !byHand ? await creditFor(tokens) : NOT_BY_US
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
  return done('already', tokens, c)
}

/**
 * A yes/no argument as an MCP client may send it: a boolean, or its string.
 * Anything else is not guessed at -- a money flag read wrong is money moved.
 */
function readYesNo(v: unknown): boolean | undefined | 'unreadable' {
  if (v === undefined || v === null) return undefined
  if (v === true || v === 'true') return true
  if (v === false || v === 'false') return false
  return 'unreadable'
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
      'инструмент назовёт день, с которого начать следующий. Если токены этого месяца ' + // cyrillic-ok: tool description
      'уже выданы вручную, передай tokens_already_given=true: месяц запишется без ' + // cyrillic-ok: tool description
      'второго начисления.', // cyrillic-ok: tool description
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
        tokens_already_given: {
          type: 'boolean',
          description:
            'true -- токены этого месяца уже выданы вручную, не начислять; false -- начислить как обычно', // cyrillic-ok: tool description
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
      const given = readYesNo(args?.tokens_already_given)
      if (given === 'unreadable') {
        return {
          ok: false,
          error: 'tokens_already_given -- true или false', // cyrillic-ok: tool answer
        }
      }
      const pool = ctx.pool as Queryable
      return recordCashClubMonth(
        pool,
        {
          telegramId: String(args?.telegram_id ?? ''),
          start: args?.start === undefined ? undefined : String(args.start),
          by,
          tokensGivenAlready: given,
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
