import { describe, it, expect, beforeEach } from 'vitest'
import {
  record,
  feed,
  pulse,
  forgetTable,
  type HiveEvent,
} from './src/hive/journal'
import type { Visibility } from './src/hive/roles'

/**
 * THE HIVE JOURNAL -- THE BORDER BETWEEN CLIENTS.
 *
 * Exactly one property is checked here, and it is worth it: a client does not
 * see other people's data. By construction the journal lives in ONE table for
 * the whole platform, so a forgotten condition in a SELECT does not mean
 * "inconvenience", it means showing somebody else's revenue.
 *
 * WHY THE FAKE POOL EXECUTES SQL INSTEAD OF KNOWING THE ANSWER
 *
 * An ordinary fake pool returns prepared rows and silently agrees with any
 * query. Such a test is green both when the filter is there and when it has
 * been cut out -- that is, it checks nothing.
 *
 * This already happened last week: in `known-phone.test.ts` the fake held its
 * OWN copy of the `WHERE telegram_id = ...` condition, so a mutation that
 * deleted the real one passed. Here the pool PARSES the `WHERE` out of the
 * query text it received and executes it. Cut the condition and the fake stops
 * filtering too, and the test goes red.
 */

interface Row {
  id: number
  kind: string
  who: string | null
  bot: string | null
  amount: number | null
  what: string | null
  severity: string
  at: string
}

/**
 * Turn a real query's `WHERE` into a predicate.
 *
 * It understands exactly the shapes that occur in `journal.ts`. An unknown
 * shape throws rather than "letting everything through": a silent pass would
 * turn the fake back into one that agrees with anything.
 */
function predicate(cond: string, P: unknown[]): (R: Row) => boolean {
  /*
   * Word boundaries here use `(?<![\p{L}...])`, NOT `\b`.
   *
   * In JavaScript `\b` is defined over ASCII, so it does not exist before a
   * non-Latin letter and a `\b...\b` pattern matches nothing. The first run
   * broke exactly there: the substitution silently did not happen and the
   * predicate died on an undefined name. Same disease as non-ASCII variable
   * names in bash: it looks right, it does not work, and static checks do not
   * catch it. Only running does.
   */
  const columns =
    /(?<![\p{L}\d_.])(kind|who|bot|amount|what|severity|at|id)(?![\p{L}\d_])/gu

  const js = cond
    .replace(/\$(\d+)/g, (_, n) => `P[${Number(n) - 1}]`)
    .replace(columns, 'R.$1')
    .replace(/([\p{L}\d_.[\]]+) = ANY\(([^)]+)\)/gu, '($2).includes($1)')
    .replace(
      /([\p{L}\d_.[\]]+) IS NOT NULL/gu,
      '($1 !== null && $1 !== undefined)'
    )
    // `=` compares in SQL and ASSIGNS in JavaScript. Without this line
    // `R.who = P[1]` was not comparing but writing, and always returned truthy
    // -- the fake let everything through and every mutation looked harmless.
    // Done AFTER `= ANY(...)`, which it would otherwise corrupt.
    .replace(/(?<![=<>!])=(?!=)/g, '===')
    .replace(/ AND /g, ' && ')
    .replace(/ OR /g, ' || ')

  // An unknown word throws rather than "letting everything through". A silent
  // pass would turn the fake back into one that agrees with anything.
  const leftover = js.replace(
    /R\.[\p{L}\d_]+|P\[\d+\]|true|false|null|undefined|includes/gu,
    ''
  )
  if (/\p{L}/u.test(leftover)) {
    throw new Error(
      `the fake did not understand "${cond}" -- left over: ${leftover}`
    )
  }

  // eslint-disable-next-line no-new-func
  const f = new Function('R', 'P', `return (${js})`) as (
    R: Row,
    P: unknown[]
  ) => boolean
  return R => !!f(R, P)
}

function fakePool() {
  const rows: Row[] = []
  let nextId = 1
  const queries: string[] = []

  return {
    rows,
    queries,
    async query(sql: string, params: unknown[] = []) {
      queries.push(sql)
      if (/^\s*CREATE/i.test(sql)) return { rows: [] }

      if (/^\s*INSERT INTO hive_events/i.test(sql)) {
        const [kind, who, bot, amount, what, severity] = params as any[]
        rows.push({
          id: nextId++,
          kind,
          who: who ?? null,
          bot: bot ?? null,
          amount: amount ?? null,
          what: what ?? null,
          severity: severity ?? 'normal',
          at: new Date().toISOString(),
        })
        return { rows: [] }
      }

      if (/^\s*SELECT/i.test(sql)) {
        const m = sql.match(/WHERE ([\s\S]*?)\s+ORDER BY/i)
        if (!m)
          throw new Error(
            'fake pool: a SELECT with no WHERE is the leak itself'
          )
        const matches = predicate(m[1], params)
        const cap = Number(params[0])
        return {
          rows: rows
            .filter(matches)
            .sort((a, b) => b.id - a.id)
            .slice(0, cap),
        }
      }

      throw new Error(`fake pool does not know this query: ${sql}`)
    },
  }
}

const keeper: Visibility = { role: 'keeper', who: '1', bots: null }
const owner: Visibility = { role: 'owner', who: '2', bots: ['bot_a'] }
const bee: Visibility = { role: 'bee', who: '3', bots: [] }
const otherBee: Visibility = { role: 'bee', who: '9', bots: [] }

async function fill(pool: any) {
  const events: HiveEvent[] = [
    { kind: 'sign-in', who: '3', bot: 'bot_a' }, // bee 3 inside owner 2's bot
    { kind: 'payment', who: '9', bot: 'bot_b', amount: 500 }, // another bot
    { kind: 'sign-in', who: '2' }, // the owner themselves, with no bot
    { kind: 'code-refused', severity: 'alarm' }, // nobody's: code guessing
    { kind: 'payment-forged', severity: 'alarm' }, // nobody's: signature
    { kind: 'created', who: '3', bot: 'bot_a', what: 'video' },
  ]
  for (const e of events) await record(pool, e)
}

describe('hive journal: who sees what', () => {
  beforeEach(() => forgetTable())

  it('the keeper sees everything, including events with no subject', async () => {
    const pool = fakePool()
    await fill(pool)
    const rows = await feed(pool, keeper)
    expect(rows).toHaveLength(6)
    expect(rows.some(r => r.kind === 'code-refused')).toBe(true)
    expect(rows.some(r => r.bot === 'bot_b')).toBe(true)
  })

  it('an owner sees their own and themselves, but NOT another bot', async () => {
    const pool = fakePool()
    await fill(pool)
    const rows = await feed(pool, owner)
    const bots = new Set(rows.map(r => r.bot))
    expect(bots.has('bot_b')).toBe(false)
    expect(rows.some(r => r.bot === 'bot_a')).toBe(true)
    expect(rows.some(r => r.who === '2')).toBe(true) // own event with no bot
  })

  it("an owner does NOT see nobody's events -- those are the keeper's", async () => {
    const pool = fakePool()
    await fill(pool)
    const rows = await feed(pool, owner)
    expect(rows.some(r => r.who === null)).toBe(false)
  })

  it('a bee sees only their own events', async () => {
    const pool = fakePool()
    await fill(pool)
    const rows = await feed(pool, bee)
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.every(r => r.who === '3')).toBe(true)
  })

  it('a bee does not see another bee inside the same bot', async () => {
    const pool = fakePool()
    await fill(pool)
    const rows = await feed(pool, otherBee)
    expect(rows.every(r => r.who === '9')).toBe(true)
    expect(rows.some(r => r.bot === 'bot_a')).toBe(false)
  })

  it('an unidentified caller sees nothing', async () => {
    const pool = fakePool()
    await fill(pool)
    const rows = await feed(pool, { role: 'bee', who: '', bots: [] })
    expect(rows).toHaveLength(0)
  })
})

describe('hive journal: writing', () => {
  beforeEach(() => forgetTable())

  it('the note is trimmed -- the journal is no place for a prompt', async () => {
    const pool = fakePool()
    await record(pool, { kind: 'created', who: '3', what: 'x'.repeat(900) })
    expect(pool.rows[0].what).toHaveLength(200)
  })

  it('an empty bot becomes null rather than an empty string', async () => {
    const pool = fakePool()
    await record(pool, { kind: 'sign-in', who: '3', bot: '   ' })
    expect(pool.rows[0].bot).toBeNull()
  })

  it('a broken database does NOT take the caller down: the payment matters more', async () => {
    const broken = {
      async query() {
        throw new Error('database unreachable')
      },
    }
    await expect(record(broken, { kind: 'payment', who: '3' })).resolves.toBe(
      'not recorded'
    )
  })

  it('an event with no subject is recorded -- code guessing names nobody', async () => {
    const pool = fakePool()
    const result = await record(pool, {
      kind: 'code-refused',
      severity: 'alarm',
    })
    expect(result).toBe('recorded')
    expect(pool.rows[0].who).toBeNull()
  })
})

describe('hive journal: pulse', () => {
  beforeEach(() => forgetTable())

  it('counts within the same visibility as the feed', async () => {
    const pool = fakePool()
    await fill(pool)
    const forKeeper = await pulse(pool, keeper)
    const forBee = await pulse(pool, bee)
    expect(forKeeper.total).toBe(6)
    expect(forKeeper.alarms).toBe(2)
    expect(forBee.total).toBe(2)
    expect(forBee.alarms).toBe(0) // the alarms are nobody's, so not the bee's
  })

  it('the window is capped: a month, not an arbitrary number', async () => {
    const pool = fakePool()
    await fill(pool)
    const p = await pulse(pool, keeper, { hours: 1e9 })
    expect(p.hours).toBe(24 * 30)
  })
})

/**
 * MUTATIONS. A check that does not go red when the code is broken checks
 * nothing.
 *
 * Each mutation repeats the feed with a corrupted condition ON THE SAME fake
 * pool and requires the result to differ from the correct one. If it does not
 * differ, the real test above would have passed on broken code too.
 */
describe('hive journal: mutations', () => {
  beforeEach(() => forgetTable())

  async function feedWithCondition(pool: any, cond: string, P: unknown[]) {
    const r = await pool.query(
      `SELECT id, kind, who, bot, amount, what, severity, at FROM hive_events
        WHERE ${cond} ORDER BY at DESC, id DESC LIMIT $1`,
      P
    )
    return r.rows
  }

  it('drop the filter entirely -- an owner would see another bot (caught)', async () => {
    const pool = fakePool()
    await fill(pool)
    const correct = await feed(pool, owner)
    const broken = await feedWithCondition(pool, 'true', [200])
    expect(broken.length).toBeGreaterThan(correct.length)
    expect(broken.some((r: any) => r.bot === 'bot_b')).toBe(true)
  })

  it('drop the bot-list check -- other bots would leak in (caught)', async () => {
    const pool = fakePool()
    await fill(pool)
    const correct = await feed(pool, owner)
    const broken = await feedWithCondition(
      pool,
      '(who = $2 OR bot IS NOT NULL)',
      [200, owner.who]
    )
    expect(broken.some((r: any) => r.bot === 'bot_b')).toBe(true)
    expect(correct.some(r => r.bot === 'bot_b')).toBe(false)
  })

  it('drop "who = $2" -- an owner would lose their own bot-less events (caught)', async () => {
    const pool = fakePool()
    await fill(pool)
    const correct = await feed(pool, owner)
    const broken = await feedWithCondition(
      pool,
      '(bot IS NOT NULL AND bot = ANY($2))',
      [200, owner.bots]
    )
    expect(correct.some(r => r.who === '2' && r.bot === null)).toBe(true)
    expect(broken.some((r: any) => r.who === '2' && r.bot === null)).toBe(false)
  })

  it('turn "who" into "is not empty" -- a bee would see everyone (caught)', async () => {
    const pool = fakePool()
    await fill(pool)
    const correct = await feed(pool, bee)
    const broken = await feedWithCondition(pool, 'who IS NOT NULL', [200])
    expect(broken.length).toBeGreaterThan(correct.length)
    expect(broken.some((r: any) => r.who === '9')).toBe(true)
  })

  it('the fake refuses a SELECT with no WHERE -- a leak must not pass quietly', async () => {
    const pool = fakePool()
    await fill(pool)
    await expect(
      pool.query('SELECT id FROM hive_events ORDER BY id DESC LIMIT $1', [10])
    ).rejects.toThrow(/WHERE/)
  })
})
