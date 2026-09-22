/**
 * PROBES ARE NOT THE AGENT'S WORK.
 *
 * On 2026-09-22 the owner's journal was nothing but `tri eyes` checks. A
 * caller that marks itself a probe (MCP _meta.probe) is kept apart: hidden
 * from the person's view, shown to tri journal, trimmed on its own.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  recordStep,
  readJournal,
  stepOf,
  resetJournalCacheForTests,
  KEEP_PROBES,
} from './src/browser/journal'
import { BROWSER_TOOLS } from './src/browser/agent-tools'

beforeEach(() => resetJournalCacheForTests())

function memoryPool() {
  const rows: Array<Record<string, unknown>> = []
  const sql: string[] = []
  let id = 0
  const isProbe = (r: Record<string, unknown>) =>
    Boolean(JSON.parse(String(r.detail)).probe)
  return {
    rows,
    sql,
    async query(q: string, p: unknown[] = []) {
      sql.push(q)
      if (/^\s*INSERT INTO browser_journal/i.test(q))
        rows.push({
          id: ++id,
          telegram_id: p[0],
          at: new Date(Date.now() + id).toISOString(),
          tool: p[1],
          ok: p[2],
          ms: p[3],
          detail: p[4],
        })
      if (/^\s*SELECT at, tool/i.test(q)) {
        const workOnly = /\(detail->>'probe'\) IS NULL/.test(q)
        return {
          rows: rows
            .filter(r => r.telegram_id === p[0] && (!workOnly || !isProbe(r)))
            .slice()
            .reverse(),
        }
      }
      return { rows: [] }
    },
  }
}

describe('a probe in the journal', () => {
  it('is marked, and the person does not see it by default', async () => {
    const pool = memoryPool()
    await recordStep(
      pool,
      '900000001',
      stepOf('browser_open', { url: 'https://t27.ai/' }, { result: {} }, 1)
    )
    await recordStep(
      pool,
      '900000001',
      stepOf('browser_status', {}, { result: { running: true, pages: [] } }, 1),
      { probe: true }
    )
    const seen = await readJournal(pool, '900000001')
    expect(seen.map(s => s.tool)).toEqual(['browser_open'])
    const all = await readJournal(pool, '900000001', 50, { probes: true })
    expect(all.map(s => s.tool)).toEqual(['browser_status', 'browser_open'])
    expect(all[0].detail.probe).toBe(true)
  })

  it('probes and work are trimmed apart: checks never push out work', async () => {
    const pool = memoryPool()
    await recordStep(
      pool,
      '900000001',
      stepOf('browser_status', {}, { result: {} }, 1),
      { probe: true }
    )
    const deletes = pool.sql.filter(q =>
      /^\s*DELETE FROM browser_journal/.test(q)
    )
    expect(deletes).toHaveLength(2)
    expect(deletes.some(q => /IS NULL[\s\S]*LIMIT 200/.test(q))).toBe(true)
    expect(
      deletes.some(q =>
        new RegExp(`IS NOT NULL[\\s\\S]*LIMIT ${KEEP_PROBES}`).test(q)
      )
    ).toBe(true)
  })

  it('a tool called with ctx.probe writes a probe', async () => {
    const pool = memoryPool()
    const status = BROWSER_TOOLS.find(t => t.name === 'browser_status')!
    await status.handler({}, {
      telegramId: '900000001',
      pool,
      probe: true,
    } as never)
    for (let i = 0; i < 200 && pool.rows.length === 0; i++)
      await new Promise(r => setTimeout(r, 5))
    expect(JSON.parse(String(pool.rows[0].detail)).probe).toBe(true)
    const plain = memoryPool()
    await status.handler({}, { telegramId: '900000001', pool: plain } as never)
    for (let i = 0; i < 200 && plain.rows.length === 0; i++)
      await new Promise(r => setTimeout(r, 5))
    expect(JSON.parse(String(plain.rows[0].detail)).probe).toBeUndefined()
  })
})
