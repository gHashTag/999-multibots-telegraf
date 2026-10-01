import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  DEFECT_TOOLS,
  OPEN_PER_LEAD_MAX,
  defectsBlock,
  forgetDefectsTable,
  setDefectNotifier,
  type Defect,
} from './src/agent/client-defects'
import { forgetTable } from './src/hive/journal'
import { clientTurnContext } from './src/agent/chat'
import { closedToClients } from './src/agent/client-facing'
import type { ToolContext } from './src/agent/tools'

/**
 * Owner, 2026-10-01: "fixing clients' bugs and support right in the DM". The
 * shape of the defect is "a fault a client reported reaches the wrong owner,
 * or nobody, or is never told back" -- so every check is about whose row it
 * is, who hears of it, and who may close it.
 */

const OWNER = '144022504'
const OTHER_OWNER = '777000111'
const CLIENT = '555666777'
const OTHER_CLIENT = '555666888'

/** A pool that keeps `client_defects` and `hive_events` in arrays. */
function fakePool() {
  const defects: Defect[] = []
  const journal: Array<{
    kind: string
    who: string
    what: string
    lead?: string
  }> = []
  let next = 1
  const pool = {
    defects,
    journal,
    async query(sql: string, p: any[] = []) {
      const s = sql.replace(/\s+/g, ' ').trim()
      if (/^(CREATE|ALTER)/i.test(s)) return { rows: [] }
      if (/^INSERT INTO hive_events/i.test(s)) {
        journal.push({ kind: p[0], who: p[1], what: p[4], lead: p[6] })
        return { rows: [] }
      }
      if (/^INSERT INTO client_defects/i.test(s)) {
        const row: Defect = {
          id: next++,
          owner_id: p[0],
          lead_id: p[1],
          product: p[2],
          summary: p[3],
          status: 'open',
          fix_note: null,
          opened_at: new Date().toISOString(),
          fixed_at: null,
        }
        defects.push(row)
        return { rows: [{ id: row.id }] }
      }
      if (/^UPDATE client_defects/i.test(s)) {
        const row = defects.find(
          d =>
            d.id === p[0] &&
            (!/owner_id/.test(s) || d.owner_id === p[1]) &&
            d.status === 'open'
        )
        if (!row) return { rows: [] }
        row.status = 'fixed'
        row.fixed_at = new Date().toISOString()
        row.fix_note = p[2]
        return { rows: [row] }
      }
      if (/^SELECT id, product FROM client_defects/i.test(s)) {
        return {
          rows: defects.filter(
            d =>
              d.owner_id === p[0] && d.lead_id === p[1] && d.status === 'open'
          ),
        }
      }
      if (
        /^SELECT \* FROM client_defects WHERE owner_id = \$1 AND lead_id/i.test(
          s
        )
      ) {
        return {
          rows: defects.filter(d => d.owner_id === p[0] && d.lead_id === p[1]),
        }
      }
      if (
        /^SELECT \* FROM client_defects WHERE owner_id = \$1 AND status = 'open'/i.test(
          s
        )
      ) {
        return {
          rows: defects.filter(d => d.owner_id === p[0] && d.status === 'open'),
        }
      }
      throw new Error(`fake pool: unexpected SQL ${s.slice(0, 80)}`)
    },
  }
  return pool
}

const tool = (name: string) => DEFECT_TOOLS.find(t => t.name === name)!

let pool: ReturnType<typeof fakePool>
let pushed: Array<{ to: string; text: string }>

beforeEach(() => {
  forgetDefectsTable()
  forgetTable()
  pool = fakePool()
  pushed = []
  setDefectNotifier(async (to, text) => {
    pushed.push({ to, text })
    return true
  })
})
afterEach(() => setDefectNotifier(null))

const clientCtx = (seller = OWNER, client = CLIENT) =>
  ({ telegramId: client, pool, dmSeller: seller }) as unknown as ToolContext
const ownerCtx = (owner = OWNER) =>
  ({ telegramId: owner, pool }) as unknown as ToolContext

describe('a fault a client reports reaches the owner of that chat', () => {
  it('is saved under the seller, and the seller is told once', async () => {
    const out = await tool('report_defect').handler(
      {
        what: 'оплата не прошла, звёзды списались',
        product: '@leela_chakra_ai_bot',
      }, // cyrillic-ok: client words
      clientCtx()
    )
    expect(out).toMatchObject({ saved: true, again: false })
    expect(pool.defects).toHaveLength(1)
    expect(pool.defects[0]).toMatchObject({
      owner_id: OWNER,
      lead_id: CLIENT,
      product: 'leela_chakra_ai_bot',
    })
    expect(pushed).toHaveLength(1)
    expect(pushed[0]!.to).toBe(OWNER)
    expect(pushed[0]!.text).toContain(`#${pool.defects[0]!.id}`)
  })

  it("the journal gets the number, never the client's words", async () => {
    await tool('report_defect').handler(
      { what: 'кнопка оплаты молчит' }, // cyrillic-ok: client words
      clientCtx()
    )
    const ev = pool.journal.find(e => e.kind === 'client-defect')!
    expect(ev).toMatchObject({ who: OWNER, what: '#1', lead: CLIENT })
    expect(JSON.stringify(pool.journal)).not.toContain('кнопка') // cyrillic-ok: client words
  })

  it('the same fault said twice is one fault, and one push', async () => {
    const say = { what: 'бот молчит', product: 'leela_chakra_ai_bot' } // cyrillic-ok: client words
    await tool('report_defect').handler(say, clientCtx())
    const again = await tool('report_defect').handler(say, clientCtx())
    expect(again).toMatchObject({ saved: true, again: true, id: 1 })
    expect(pool.defects).toHaveLength(1)
    expect(pushed).toHaveLength(1)
  })

  it('one person cannot open more than the cap', async () => {
    for (let i = 0; i < OPEN_PER_LEAD_MAX + 2; i++) {
      await tool('report_defect').handler(
        { what: `fault ${i}`, product: `bot_${i}` },
        clientCtx()
      )
    }
    expect(pool.defects).toHaveLength(OPEN_PER_LEAD_MAX)
  })

  it('outside a business chat nothing is written and nobody is told', async () => {
    for (const ctx of [
      ownerCtx(),
      clientCtx('', CLIENT),
      clientCtx(CLIENT, CLIENT),
      clientCtx('not-a-number', CLIENT),
    ]) {
      const out = await tool('report_defect').handler({ what: 'broken' }, ctx)
      expect(out).toMatchObject({ saved: false })
    }
    expect(pool.defects).toHaveLength(0)
    expect(pushed).toHaveLength(0)
  })
})

describe('only the owner sees and closes their own', () => {
  beforeEach(async () => {
    await tool('report_defect').handler({ what: 'A' }, clientCtx(OWNER, CLIENT))
    await tool('report_defect').handler(
      { what: 'B' },
      clientCtx(OTHER_OWNER, OTHER_CLIENT)
    )
  })

  it("defects_open lists the asking owner's only", async () => {
    const mine = (await tool('defects_open').handler({}, ownerCtx())) as any
    expect(mine.defects.map((d: any) => d.what)).toEqual(['A'])
    const theirs = (await tool('defects_open').handler(
      {},
      ownerCtx(OTHER_OWNER)
    )) as any
    expect(theirs.defects.map((d: any) => d.what)).toEqual(['B'])
  })

  it("another owner's number closes nothing", async () => {
    const out = await tool('defect_close').handler(
      { id: 2, note: 'x' },
      ownerCtx()
    )
    expect(out).toMatchObject({ closed: false })
    expect(pool.defects[1]!.status).toBe('open')
    expect(pool.journal.some(e => e.kind === 'defect-fixed')).toBe(false)
  })

  it('the owner closes their own, and it is journalled', async () => {
    const out = await tool('defect_close').handler(
      { id: '#1', note: 'перезапустил оплату' }, // cyrillic-ok: owner words
      ownerCtx()
    )
    expect(out).toMatchObject({ closed: true, id: 1, client: CLIENT })
    expect(pool.journal.find(e => e.kind === 'defect-fixed')).toMatchObject({
      who: OWNER,
      what: '#1',
    })
  })
})

describe('the client is told back in the same conversation', () => {
  it("a fixed fault is in that client's next turn, and in nobody else's", async () => {
    await tool('report_defect').handler({ what: 'A' }, clientCtx())
    await tool('defect_close').handler({ id: 1, note: 'done' }, ownerCtx())
    const block = await defectsBlock(pool as never, OWNER, CLIENT)
    expect(block).toContain('ИСПРАВЛЕНО: done') // cyrillic-ok: prompt copy
    expect(await defectsBlock(pool as never, OWNER, OTHER_CLIENT)).toBe('')
    expect(await defectsBlock(pool as never, OTHER_OWNER, CLIENT)).toBe('')
  })

  it('an open fault says it is in work and promises no date', async () => {
    await tool('report_defect').handler({ what: 'A' }, clientCtx())
    const block = await defectsBlock(pool as never, OWNER, CLIENT)
    expect(block).toContain('в работе') // cyrillic-ok: prompt copy
    expect(block).toContain('Не обещай сроков') // cyrillic-ok: prompt copy
  })
})

describe('the seller is set by code, from the server-keyed seller_id', () => {
  const base = { telegramId: CLIENT } as unknown as ToolContext

  it('a business turn with a numeric seller who is not the client', () => {
    expect(
      clientTurnContext(base, { surface: 'business', seller: OWNER }).dmSeller
    ).toBe(OWNER)
  })

  it('anything else leaves it unset', () => {
    for (const opts of [
      { surface: 'bot', seller: OWNER },
      { surface: 'business', seller: CLIENT },
      { surface: 'business', seller: 'nobody' },
      { surface: 'business' },
      undefined,
    ]) {
      expect(
        clientTurnContext(base, opts).dmSeller,
        JSON.stringify(opts)
      ).toBeUndefined()
    }
  })

  it('a client may report; only the owner may list or close', () => {
    expect(closedToClients('report_defect')).toBe(false)
    expect(closedToClients('defects_open')).toBe(true)
    expect(closedToClients('defect_close')).toBe(true)
  })
})
