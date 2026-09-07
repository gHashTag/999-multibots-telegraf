import { describe, it, expect, beforeEach, vi } from 'vitest'
import { HIVE_TOOLS } from './src/agent/hive-tools'
import { record, forgetTable } from './src/hive/journal'

/**
 * THE PULSE IN THE AGENT CHAT -- THE BORDER.
 *
 * An agent tool is more dangerous than an ordinary route: its arguments are
 * composed by a LANGUAGE MODEL from what a person typed. If identity were taken
 * from an argument, it would be enough to write "show me the events of user
 * 144022504" and the model would dutifully fill in somebody else's id.
 *
 * So exactly one thing is checked here: identity comes ONLY from the verified
 * context, and no argument can influence it.
 */

const tool = (name: string) => {
  const t = HIVE_TOOLS.find(t => t.name === name)
  if (!t) throw new Error(`no such tool: ${name}`)
  return t
}

function fakePool() {
  const rows: any[] = []
  let n = 1
  return {
    rows,
    async query(sql: string, params: any[] = []) {
      if (/^\s*(CREATE)/i.test(sql)) return { rows: [] }
      if (/INSERT INTO hive_events/i.test(sql)) {
        const [kind, who, bot, amount, what, severity] = params
        rows.push({
          id: n++,
          kind,
          who,
          bot,
          amount,
          what,
          severity,
          at: new Date().toISOString(),
        })
        return { rows: [] }
      }
      // Read like the real feed: only what the parameters allow.
      const who = params[1]
      const bots: string[] = params[2] ?? []
      const everything = /WHERE true/i.test(sql)
      return {
        rows: rows
          .filter(
            r => everything || r.who === who || (r.bot && bots.includes(r.bot))
          )
          .sort((a, b) => b.id - a.id)
          .slice(0, Number(params[0])),
      }
    },
  }
}

const OWNERSHIP: Record<string, string[]> = { '2': ['bot_a'], '3': [] }

beforeEach(() => {
  forgetTable()
  process.env.HIVE_KEEPERS = '1'
  process.env.SUPABASE_URL = 'https://example.invalid'
  process.env.SUPABASE_SERVICE_KEY = 'key'
  vi.stubGlobal('fetch', async (url: string) => {
    const m = String(url).match(/telegram_id=eq\.(\d+)/)
    const bots = OWNERSHIP[m?.[1] ?? ''] ?? []
    return {
      ok: true,
      json: async () => bots.map(b => ({ bot_name: b })),
    } as any
  })
})

async function fill(pool: any) {
  await record(pool, { kind: 'sign-in', who: '3', bot: 'bot_a' })
  await record(pool, { kind: 'payment', who: '9', bot: 'bot_b', amount: 500 })
  await record(pool, { kind: 'code-refused', severity: 'alarm' })
}

describe('hive pulse: identity', () => {
  it('without a verified identity it refuses rather than showing a general view', async () => {
    const pool = fakePool()
    await expect(
      tool('hive_pulse').handler({}, { pool, telegramId: '' } as any)
    ).rejects.toThrow("личности")
  })

  /*
   * BOTH tools are checked separately, not "one on behalf of both".
   *
   * The first pass covered `hive_events` only. A mutation that substituted
   * `telegram_id` from the argument in `hive_pulse` SURVIVED -- that is, an
   * identity swap in the pulse would have gone unnoticed. General conclusion:
   * the property is checked at every door, not at one of two.
   */
  it('hive_events: an id in the argument does NOT replace the identity', async () => {
    const pool = fakePool()
    await fill(pool)
    // The model "believed" the person and filled in somebody else's id.
    const out: any = await tool('hive_events').handler(
      { telegram_id: '1', who: '1', limit: 50 } as any,
      { pool, telegramId: '3' } as any
    )
    expect(out.scope).toContain("только ваши собственные")
    expect(out.events.every((e: any) => e.who === '3')).toBe(true)
  })

  it('hive_pulse: an id in the argument does NOT turn a bee into a keeper', async () => {
    const pool = fakePool()
    await fill(pool)
    const out: any = await tool('hive_pulse').handler(
      { telegram_id: '1', who: '1' } as any,
      { pool, telegramId: '3' } as any
    )
    expect(out.scope).toContain("только ваши собственные")
    expect(out.scope).not.toContain("вся ферма")
    // The bee has one event of their own; another's payment and a nobody's
    // alarm are not theirs.
    expect(out.total).toBe(1)
    expect(out.alarms).toBe(0)
  })
})

describe('hive pulse: the scope is named in the answer', () => {
  it('a keeper is told it is the whole farm', async () => {
    const pool = fakePool()
    await fill(pool)
    const out: any = await tool('hive_pulse').handler({}, {
      pool,
      telegramId: '1',
    } as any)
    expect(out.scope).toContain("вся ферма")
    expect(out.total).toBe(3)
    expect(out.alarms).toBe(1)
  })

  it('an owner gets THEIR bots listed, and no other events', async () => {
    const pool = fakePool()
    await fill(pool)
    const out: any = await tool('hive_events').handler({}, {
      pool,
      telegramId: '2',
    } as any)
    expect(out.scope).toMatch(/bot_a/)
    expect(out.scope).not.toMatch(/bot_b/)
    expect(out.events.some((e: any) => e.bot === 'bot_b')).toBe(false)
  })

  it('a bee does not see nobody-alarms -- those are the keeper business', async () => {
    const pool = fakePool()
    await fill(pool)
    const out: any = await tool('hive_pulse').handler({}, {
      pool,
      telegramId: '3',
    } as any)
    expect(out.alarms).toBe(0)
  })
})

describe('hive pulse: shape', () => {
  it('every tool is named with the hive_ prefix', () => {
    for (const t of HIVE_TOOLS) expect(t.name).toMatch(/^hive_/)
  })

  it('alarms_only narrows the output rather than widening it', async () => {
    const pool = fakePool()
    await fill(pool)
    const out: any = await tool('hive_events').handler({ alarms_only: true }, {
      pool,
      telegramId: '1',
    } as any)
    expect(out.events).toHaveLength(1)
    expect(out.events[0].kind).toBe('code-refused')
    // An event with no subject is named in words rather than left blank: an
    // empty field reads as a fault, and this is a legitimate case.
    expect(out.events[0].who).toContain("без субъекта")
  })
})
