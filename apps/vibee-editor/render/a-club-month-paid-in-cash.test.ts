import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  handleClub,
  forgetClubTablesForTests,
  clubTokensPerPeriod,
} from './src/agent/club-membership'
import {
  recordCashClubMonth,
  CASH_MONTH_REASON,
  mayRecordCash,
} from './src/agent/club-cash'
import {
  TOOLS_BY_NAME,
  toOpenAITools,
  toMcpTools,
  type ToolContext,
} from './src/agent/tools'
import { dispatchToolCall } from './src/agent/chat'
import { forgetTokenLedgerTables } from './src/token-ledger'
import { forgetTable } from './src/hive/journal'

/**
 * A CLUB MONTH PAID IN CASH (owner, 2026-09-22: two VIP clients pay him in
 * cash, and until now that could only be written down as a token purchase --
 * the tokens came, the club did not).
 *
 * Pinned here, each through the real code:
 *  - the month lands in `club_period`, the store a Stars month writes and
 *    /api/club/status reads, and status then says paid, via cash, until when;
 *  - the tokens back are what a Stars month gives, through the same crediting
 *    function (creditStarsPayment), with a reason that says cash;
 *  - idempotent per person and period start; a lost credit is repaired by
 *    repeating the command, a made one is never doubled;
 *  - months do not overlap and do not float;
 *  - only the platform owner or a keeper, only by a direct call: the render's
 *    own model turns never see the tool;
 *  - payments_v2 is never touched.
 *
 * Ids are invented (9000000xx).
 */
const MEMBER = '900000071'
const KEEPER = '900000091'
const STRANGER = '900000092'
const MONTH = clubTokensPerPeriod()
const TODAY = '2026-09-22'
const NOW = new Date('2026-09-22T10:00:00Z')

/**
 * The render's Postgres, strictly: every statement this path may issue, and a
 * throw for anything else -- a write to payments_v2 would be "anything else".
 */
function renderDb() {
  const periods: Array<{
    id: number
    telegram_id: string
    stars: number
    tokens_granted: number
    star_tx_id: string
    paid_at: string
    until: string
    created_at?: string
  }> = []
  const charges = new Set<string>()
  const balances = new Map<string, number>()
  const ledger: Array<{
    telegram_id: string
    delta: number
    kind: string
    reason: string
    ref: string | null
    created_at?: string
  }> = []
  const journal: unknown[][] = []
  const statements: string[] = []
  const query = async (sql: string, params: unknown[] = []) => {
    const s = sql.replace(/\s+/g, ' ').trim()
    statements.push(s)
    if (/payments_v2/i.test(s)) throw new Error('the archive is never written')
    if (/^(CREATE|ALTER|BEGIN|COMMIT|ROLLBACK)/i.test(s)) return { rows: [] }
    if (
      /^SELECT id, tokens_granted FROM club_period WHERE star_tx_id = \$1 LIMIT 1$/i.test(
        s
      )
    ) {
      return {
        rows: periods
          .filter(p => p.star_tx_id === params[0])
          .map(p => ({ id: p.id, tokens_granted: p.tokens_granted })),
      }
    }
    if (
      /^SELECT MAX\(created_at\)::text AS at FROM club_period WHERE telegram_id = \$1 AND star_tx_id LIKE \$2$/i.test(
        s
      )
    ) {
      const prefix = String(params[1]).replace(/%$/, '')
      const at = periods
        .filter(
          p => p.telegram_id === params[0] && p.star_tx_id.startsWith(prefix)
        )
        .map(p => p.created_at ?? '')
        .sort()
        .pop()
      return { rows: [{ at: at || null }] }
    }
    if (
      /^SELECT ref, delta, created_at::text AS at FROM token_ledger WHERE telegram_id = \$1 AND ref LIKE \$2 AND delta > 0 ORDER BY created_at$/i.test(
        s
      )
    ) {
      const prefix = String(params[1]).replace(/%$/, '')
      return {
        rows: ledger
          .filter(
            l =>
              l.telegram_id === params[0] &&
              (l.ref ?? '').startsWith(prefix) &&
              l.delta > 0
          )
          .map(l => ({ ref: l.ref, delta: l.delta, at: l.created_at })),
      }
    }
    if (
      /^SELECT until::text FROM club_period WHERE telegram_id = \$1 ORDER BY until DESC LIMIT 1$/i.test(
        s
      )
    ) {
      const mine = periods
        .filter(p => p.telegram_id === params[0])
        .sort((a, b) => b.until.localeCompare(a.until))
      return { rows: mine.slice(0, 1).map(p => ({ until: p.until })) }
    }
    if (
      /^SELECT paid_at::text, until::text, star_tx_id, COUNT\(\*\) OVER \(\) AS periods FROM club_period WHERE telegram_id = \$1/i.test(
        s
      )
    ) {
      const mine = periods
        .filter(p => p.telegram_id === params[0])
        .sort((a, b) => b.until.localeCompare(a.until))
      return {
        rows: mine.slice(0, 1).map(p => ({
          paid_at: p.paid_at,
          until: p.until,
          star_tx_id: p.star_tx_id,
          periods: mine.length,
        })),
      }
    }
    if (
      /^INSERT INTO club_period \(telegram_id, stars, tokens_granted, star_tx_id, paid_at, until\) VALUES \(\$1, \$2, \$3, \$4, \$5, \$6\) ON CONFLICT \(star_tx_id\) DO NOTHING RETURNING id$/i.test(
        s
      )
    ) {
      const [telegram_id, stars, tokens_granted, star_tx_id, paid_at, until] =
        params as [string, number, number, string, string, string]
      if (periods.some(p => p.star_tx_id === star_tx_id)) return { rows: [] }
      periods.push({
        id: periods.length + 1,
        telegram_id,
        stars,
        tokens_granted,
        star_tx_id,
        paid_at,
        until,
        created_at: new Date().toISOString(),
      })
      return { rows: [{ id: periods.length }] }
    }
    if (/FROM club_grant_period/i.test(s)) return { rows: [] }
    if (/^INSERT INTO hive_events/i.test(s)) {
      journal.push(params)
      return { rows: [] }
    }
    // creditStarsPayment and the ledger (stars-credit.ts, token-ledger.ts).
    if (/^INSERT INTO star_payments/i.test(s)) {
      const id = String(params[0])
      if (charges.has(id)) return { rowCount: 0, rows: [] }
      charges.add(id)
      return { rowCount: 1, rows: [] }
    }
    if (/^SELECT 1 FROM token_ledger WHERE telegram_id = \$1/i.test(s)) {
      return {
        rows: ledger.filter(l => l.telegram_id === params[0]).slice(0, 1),
      }
    }
    if (/^SELECT balance FROM user_tokens WHERE telegram_id = \$1/i.test(s)) {
      const b = balances.get(String(params[0]))
      return { rows: b === undefined ? [] : [{ balance: b }] }
    }
    if (/^UPDATE user_tokens SET balance = balance \+ \$2/i.test(s)) {
      const tid = String(params[0])
      if (!balances.has(tid)) return { rows: [] }
      balances.set(tid, balances.get(tid)! + Number(params[1]))
      return { rows: [{ balance: balances.get(tid) }] }
    }
    if (
      /^INSERT INTO user_tokens .* DO UPDATE SET balance = user_tokens\.balance \+ \$2/i.test(
        s
      )
    ) {
      const tid = String(params[0])
      balances.set(tid, (balances.get(tid) ?? 0) + Number(params[1]))
      return { rows: [{ balance: balances.get(tid) }] }
    }
    if (/^INSERT INTO token_ledger .* RETURNING id$/i.test(s)) {
      ledger.push({
        telegram_id: String(params[0]),
        delta: Number(params[1]),
        kind: String(params[3]),
        reason: String(params[4]),
        ref: params[5] == null ? null : String(params[5]),
        created_at: new Date().toISOString(),
      })
      return { rows: [{ id: ledger.length }] }
    }
    throw new Error(`the render's database does not know: ${s.slice(0, 140)}`)
  }
  return { periods, charges, balances, ledger, journal, statements, query }
}

let db: ReturnType<typeof renderDb>

beforeEach(() => {
  forgetClubTablesForTests()
  forgetTokenLedgerTables()
  forgetTable()
  db = renderDb()
  vi.stubEnv('HIVE_KEEPERS', KEEPER)
  vi.spyOn(console, 'info').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const cashTool = () => TOOLS_BY_NAME.get('club_cash_month')!
const ctxOf = (telegramId: string) =>
  ({ telegramId, pool: db }) as unknown as ToolContext

/** The tool as the owner calls it over /mcp, on a fixed day. */
async function record(args: Record<string, unknown>, by = KEEPER) {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  try {
    return (await cashTool().handler(args, ctxOf(by))) as Record<string, any>
  } finally {
    vi.useRealTimers()
  }
}

async function statusOf(telegramId: string, now = NOW) {
  const out = await handleClub(
    { url: '/api/club/status', method: 'GET' },
    {
      getPool: async () => db,
      identity: () => telegramId,
      botToken: 'bot',
      credit: async () => ({ credited: true }),
      grant: {
        botsOwnedBy: async () => [],
        keepers: () => [],
        guests: () => [],
      },
      now: () => now,
    }
  )
  return out.body
}

describe('the month goes where a Stars month goes', () => {
  it('club_period gets the month, and status says paid in cash, until when', async () => {
    const out = await record({ telegram_id: MEMBER })
    expect(out).toMatchObject({
      ok: true,
      recorded: 'now',
      telegram_id: MEMBER,
      start: `${TODAY}T00:00:00.000Z`,
      until: '2026-10-22T00:00:00.000Z',
      tokens: MONTH,
      credited: true,
    })
    expect(db.periods).toEqual([
      expect.objectContaining({
        telegram_id: MEMBER,
        star_tx_id: `cash:${MEMBER}:${TODAY}`,
        stars: 0,
        tokens_granted: MONTH,
      }),
    ])
    expect(await statusOf(MEMBER)).toMatchObject({
      ok: true,
      active: true,
      paid: true,
      paid_via: 'cash',
      granted: null,
      until: '2026-10-22T00:00:00.000Z',
      days_left: 30,
    })
  })

  it('a Stars month still reads as stars', async () => {
    db.periods.push({
      id: 1,
      telegram_id: MEMBER,
      stars: 10000,
      tokens_granted: MONTH,
      star_tx_id: 'stx-telegram-charge',
      paid_at: '2026-09-20T12:00:00.000Z',
      until: '2026-10-20T12:00:00.000Z',
    })
    expect(await statusOf(MEMBER)).toMatchObject({
      paid: true,
      paid_via: 'stars',
    })
  })

  it('the tokens back match a Stars month, go through creditStarsPayment, and the reason says cash', async () => {
    await record({ telegram_id: MEMBER })
    expect(db.balances.get(MEMBER)).toBe(MONTH)
    expect(db.charges).toEqual(new Set([`club:cash:${MEMBER}:${TODAY}`]))
    expect(db.ledger).toEqual([
      {
        telegram_id: MEMBER,
        delta: MONTH,
        kind: 'purchase',
        reason: CASH_MONTH_REASON,
        ref: `club:cash:${MEMBER}:${TODAY}`,
        created_at: NOW.toISOString(),
      },
    ])
    expect(CASH_MONTH_REASON).toMatch(/наличн/) // cyrillic-ok: the reason under test
    expect(db.ledger[0].reason).not.toMatch(/Stars/i)
  })

  it('never touches payments_v2', async () => {
    await record({ telegram_id: MEMBER })
    await record({ telegram_id: MEMBER })
    expect(db.statements.some(s => /payments_v2/i.test(s))).toBe(false)
  })

  it('writes an audit line with ids and dates, and no name', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    await record({ telegram_id: MEMBER })
    const line = info.mock.calls
      .map(c => c.join(' '))
      .find(l => l.includes('cash month'))
    expect(line).toBe(
      `[club] cash month outcome=recorded member=${MEMBER} start=${TODAY} until=2026-10-22 tokens=${MONTH} credited=true by=${KEEPER}`
    )
  })
})

describe('idempotent per person and period start', () => {
  it('the same command twice writes one month and credits once', async () => {
    const first = await record({ telegram_id: MEMBER, start: TODAY })
    const again = await record({ telegram_id: MEMBER, start: TODAY })
    expect(first).toMatchObject({ ok: true, recorded: 'now', credited: true })
    expect(again).toMatchObject({
      ok: true,
      recorded: 'already',
      credited: false,
    })
    expect(again.credit_note).toMatch(/already credited/)
    expect(db.periods).toHaveLength(1)
    expect(db.ledger).toHaveLength(1)
    expect(db.balances.get(MEMBER)).toBe(MONTH)
  })

  it('a credit that failed is repaired by repeating the command -- and only once', async () => {
    const broken = async () => {
      throw new Error('wallet unreachable')
    }
    const first = await recordCashClubMonth(
      db,
      { telegramId: MEMBER, by: KEEPER },
      broken,
      NOW
    )
    expect(first).toMatchObject({ ok: true, recorded: 'now', credited: false })
    // The keeper is told at once, loudly: a month with no tokens.
    expect(
      db.journal.some(p => p[0] === 'payment-lost' && p[5] === 'alarm')
    ).toBe(true)

    const credits: unknown[] = []
    const working = async (c: any) => {
      credits.push(c)
      return { credited: true }
    }
    const repaired = await recordCashClubMonth(
      db,
      { telegramId: MEMBER, by: KEEPER },
      working,
      NOW
    )
    expect(repaired).toMatchObject({
      ok: true,
      recorded: 'already',
      credited: true,
    })
    expect(credits).toEqual([
      {
        telegramId: MEMBER,
        tokens: MONTH,
        chargeId: `club:cash:${MEMBER}:${TODAY}`,
        reason: CASH_MONTH_REASON,
      },
    ])
    expect(db.periods).toHaveLength(1)
  })
})

describe('months do not overlap and do not float', () => {
  it('a second month inside the first is refused, with the day the next one may start', async () => {
    await record({ telegram_id: MEMBER })
    const out = await record({ telegram_id: MEMBER, start: '2026-09-25' })
    expect(out).toMatchObject({ ok: false, next_start: '2026-10-22' })
    expect(db.periods).toHaveLength(1)
    expect(db.balances.get(MEMBER)).toBe(MONTH)
  })

  it('...and that day chains the next month on', async () => {
    await record({ telegram_id: MEMBER })
    const next = await record({ telegram_id: MEMBER, start: '2026-10-22' })
    expect(next).toMatchObject({
      ok: true,
      recorded: 'now',
      until: '2026-11-21T00:00:00.000Z',
    })
    expect(db.balances.get(MEMBER)).toBe(2 * MONTH)
  })

  it('a running Stars month is not overlapped by a cash one', async () => {
    db.periods.push({
      id: 1,
      telegram_id: MEMBER,
      stars: 10000,
      tokens_granted: MONTH,
      star_tx_id: 'stx-telegram-charge',
      paid_at: '2026-09-05T14:33:00.000Z',
      until: '2026-10-05T14:33:00.000Z',
    })
    const out = await record({ telegram_id: MEMBER })
    expect(out).toMatchObject({ ok: false, next_start: '2026-10-06' })
    expect(db.charges.size).toBe(0)
  })

  it('a start in the future with nothing running would leave a gap: refused', async () => {
    const out = await record({ telegram_id: MEMBER, start: '2026-10-01' })
    expect(out).toMatchObject({ ok: false, next_start: TODAY })
    expect(db.periods).toHaveLength(0)
  })

  it('a month that is already over is not recorded', async () => {
    const out = await record({ telegram_id: MEMBER, start: '2026-08-01' })
    expect(out).toMatchObject({ ok: false })
    expect(db.periods).toHaveLength(0)
  })

  it('a start from earlier this month is accepted while the month still runs', async () => {
    const out = await record({ telegram_id: MEMBER, start: '2026-09-01' })
    expect(out).toMatchObject({ ok: true, until: '2026-10-01T00:00:00.000Z' })
  })

  it.each([['2026-9-22'], ['2026-02-30'], ['today']])(
    'a start that is not a real day (%j) is refused, nothing written',
    async start => {
      const out = await record({ telegram_id: MEMBER, start })
      expect(out).toMatchObject({ ok: false })
      expect(db.periods).toHaveLength(0)
    }
  )

  it('a telegram_id that is not a number is refused', async () => {
    const out = await record({ telegram_id: '@someone' })
    expect(out).toMatchObject({ ok: false })
    expect(db.statements).toEqual([])
  })
})

describe('only the owner or a keeper, only by a direct call', () => {
  it('anybody else is refused before a single statement runs', async () => {
    await expect(record({ telegram_id: MEMBER }, STRANGER)).rejects.toThrow(
      /владелец платформы или хранитель/ // cyrillic-ok: refusal under test
    )
    await expect(record({ telegram_id: STRANGER }, STRANGER)).rejects.toThrow()
    expect(db.statements).toEqual([])
    expect(mayRecordCash(STRANGER)).toBe(false)
    expect(mayRecordCash('')).toBe(false)
    expect(mayRecordCash(KEEPER)).toBe(true)
  })

  it('the member cannot record a month for themselves', async () => {
    await expect(record({ telegram_id: MEMBER }, MEMBER)).rejects.toThrow()
    expect(db.periods).toHaveLength(0)
  })

  it('is on /mcp, and never listed to a model turn inside the render', () => {
    expect(toMcpTools().map(t => t.name)).toContain('club_cash_month')
    const listed = toOpenAITools().map(t => t.function.name)
    expect(listed).not.toContain('club_cash_month')
    // The filter is aimed: the rest of the registry is still offered.
    expect(listed).toContain('whoami')
  })

  it('a model turn that calls it anyway is refused, and the handler never runs', async () => {
    const gen = dispatchToolCall(
      {
        function: {
          name: 'club_cash_month',
          arguments: JSON.stringify({ telegram_id: MEMBER }),
        },
      },
      ctxOf(KEEPER)
    )
    let r = await gen.next()
    while (!r.done) r = await gen.next()
    expect(r.value).toMatchObject({ отказано: true }) // cyrillic-ok: the envelope's field
    expect(db.statements).toEqual([])
  })
})

/*
 * TOKENS HANDED OUT BY HAND ARE NOT HANDED OUT AGAIN (2026-09-22). Before the
 * tool existed, a cash member's month of tokens could only be a plain ledger
 * grant (ref `cash-club-<day>-<id>`), with no club month behind it. Recording
 * that month must not credit the same tokens a second time.
 */
describe('tokens already given by hand', () => {
  const HAND_REF = `cash-club-${TODAY}-${MEMBER}`
  const HAND_AT = '2026-09-22T05:26:00.000Z'
  beforeEach(() => {
    db.ledger.push({
      telegram_id: MEMBER,
      delta: MONTH,
      kind: 'grant',
      reason: 'club month, cash, by hand',
      ref: HAND_REF,
      created_at: HAND_AT,
    })
    db.balances.set(MEMBER, MONTH)
  })
  const writes = () =>
    db.statements.filter(s => /^(INSERT|UPDATE|DELETE)/i.test(s))

  it('stop the call with the question, and nothing is written', async () => {
    const out = await record({ telegram_id: MEMBER })
    expect(out).toMatchObject({
      ok: false,
      tokens_given_by_hand: [{ ref: HAND_REF, tokens: MONTH, at: HAND_AT }],
    })
    expect(out.error).toMatch(/tokens_already_given=true/)
    expect(writes()).toEqual([])
    expect(db.periods).toHaveLength(0)
    expect(db.balances.get(MEMBER)).toBe(MONTH)
  })

  it('"they were this month\'s": the month is recorded, paid via cash, and no token is credited', async () => {
    const out = await record({
      telegram_id: MEMBER,
      tokens_already_given: true,
    })
    expect(out).toMatchObject({
      ok: true,
      recorded: 'now',
      tokens: 0,
      credited: false,
      tokens_by_hand: true,
    })
    expect(db.periods).toEqual([
      expect.objectContaining({ tokens_granted: 0, stars: 0 }),
    ])
    expect(db.charges.size).toBe(0)
    expect(db.ledger).toHaveLength(1)
    expect(db.balances.get(MEMBER)).toBe(MONTH)
    // Not an alarm: nothing was lost, the tokens came earlier.
    expect(db.journal.some(p => p[0] === 'payment-lost')).toBe(false)
    expect(await statusOf(MEMBER)).toMatchObject({
      active: true,
      paid: true,
      paid_via: 'cash',
      until: '2026-10-22T00:00:00.000Z',
    })
  })

  it('...and a repeat without the answer neither asks again nor credits', async () => {
    await record({ telegram_id: MEMBER, tokens_already_given: true })
    const again = await record({ telegram_id: MEMBER })
    expect(again).toMatchObject({
      ok: true,
      recorded: 'already',
      tokens: 0,
      credited: false,
    })
    expect(db.charges.size).toBe(0)
    expect(db.balances.get(MEMBER)).toBe(MONTH)
  })

  it('...a repeat that says "false" does not credit either: the recorded month decides', async () => {
    await record({ telegram_id: MEMBER, tokens_already_given: true })
    const again = await record({
      telegram_id: MEMBER,
      tokens_already_given: false,
    })
    expect(again).toMatchObject({ recorded: 'already', credited: false })
    expect(db.balances.get(MEMBER)).toBe(MONTH)
  })

  it('...and the next month is a normal month: no question, the tokens come', async () => {
    await record({ telegram_id: MEMBER, tokens_already_given: true })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T09:00:00Z'))
    try {
      const out = (await cashTool().handler(
        { telegram_id: MEMBER, start: '2026-10-22' },
        ctxOf(KEEPER)
      )) as Record<string, any>
      expect(out).toMatchObject({ ok: true, recorded: 'now', credited: true })
    } finally {
      vi.useRealTimers()
    }
    expect(db.balances.get(MEMBER)).toBe(2 * MONTH)
  })

  it('"they were something else": the month is credited as usual', async () => {
    const out = await record({
      telegram_id: MEMBER,
      tokens_already_given: false,
    })
    expect(out).toMatchObject({ ok: true, tokens: MONTH, credited: true })
    expect(db.balances.get(MEMBER)).toBe(2 * MONTH)
  })

  it('a month with tokens whose credit failed is not credited once the owner says they came by hand', async () => {
    db.ledger.length = 0
    db.balances.clear()
    const broken = async () => ({ credited: false, reason: 'wallet down' })
    await recordCashClubMonth(
      db,
      { telegramId: MEMBER, by: KEEPER, tokensGivenAlready: false },
      broken,
      NOW
    )
    const credits: unknown[] = []
    const out = await recordCashClubMonth(
      db,
      { telegramId: MEMBER, by: KEEPER, tokensGivenAlready: true },
      async c => {
        credits.push(c)
        return { credited: true }
      },
      NOW
    )
    expect(out).toMatchObject({
      ok: true,
      recorded: 'already',
      credited: false,
    })
    expect(credits).toEqual([])
  })

  it('only that ref shape asks: a Stars charge or another grant on file does not', async () => {
    db.ledger.length = 0
    db.ledger.push(
      {
        telegram_id: MEMBER,
        delta: 500,
        kind: 'purchase',
        reason: 'Telegram Stars',
        ref: 'stx-telegram-charge',
        created_at: HAND_AT,
      },
      {
        telegram_id: MEMBER,
        delta: 100,
        kind: 'grant',
        reason: 'welcome tokens',
        ref: `welcome:${MEMBER}`,
        created_at: HAND_AT,
      }
    )
    const out = await record({ telegram_id: MEMBER })
    expect(out).toMatchObject({ ok: true, credited: true })
  })

  it('a grant whose time cannot be read is still asked about, not let through', async () => {
    await record({ telegram_id: MEMBER, tokens_already_given: true })
    db.ledger.push({
      telegram_id: MEMBER,
      delta: MONTH,
      kind: 'grant',
      reason: 'club month, cash, by hand',
      ref: `cash-club-2026-10-22-${MEMBER}`,
      created_at: 'not a time',
    })
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-10-22T09:00:00Z'))
    try {
      const out = (await cashTool().handler(
        { telegram_id: MEMBER, start: '2026-10-22' },
        ctxOf(KEEPER)
      )) as Record<string, any>
      expect(out).toMatchObject({ ok: false })
      expect(out.tokens_given_by_hand).toHaveLength(1)
    } finally {
      vi.useRealTimers()
    }
  })

  it('"given by hand" with no hand grant on file is refused, nothing written', async () => {
    // Review of #2845: the row would carry 0 tokens and every repeat reads
    // that 0, so a paying member would end with nothing and no way back.
    db.ledger.length = 0
    db.balances.clear()
    const out = await record({
      telegram_id: MEMBER,
      tokens_already_given: true,
    })
    expect(out).toMatchObject({ ok: false })
    expect(out.error).toMatch(/tokens_already_given=true/)
    expect(writes()).toEqual([])
    expect(db.periods).toHaveLength(0)
    // ...and the plain call after it is a normal month.
    const plain = await record({ telegram_id: MEMBER })
    expect(plain).toMatchObject({ ok: true, tokens: MONTH, credited: true })
    expect(db.balances.get(MEMBER)).toBe(MONTH)
  })

  it('an answer that is not true or false is refused, nothing written', async () => {
    const out = await record({
      telegram_id: MEMBER,
      tokens_already_given: 'maybe',
    })
    expect(out).toMatchObject({ ok: false })
    expect(writes()).toEqual([])
  })

  it('"true" and "false" as strings are read, as an MCP client may send them', async () => {
    const out = await record({
      telegram_id: MEMBER,
      tokens_already_given: 'true',
    })
    expect(out).toMatchObject({ ok: true, tokens: 0, credited: false })
  })
})
