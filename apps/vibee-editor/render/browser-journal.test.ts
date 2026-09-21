/**
 * THE AGENT'S STEPS IN THE PERSON'S BROWSER, WRITTEN DOWN -- AND WHAT IS NOT.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import {
  stepOf,
  bareUrl,
  recordStep,
  readJournal,
  resetJournalCacheForTests,
} from './src/browser/journal'
import { BROWSER_TOOLS } from './src/browser/agent-tools'
import { handleBrowser } from './src/browser/routes'
import { fixedDriver } from './src/browser/pod-driver'

beforeEach(() => resetJournalCacheForTests())

describe('what a step keeps', () => {
  it('never the typed text or the evaluated code -- only their length', () => {
    const typed = stepOf(
      'browser_type',
      { text: 'my secret words' },
      { result: {} },
      12
    )
    expect(typed.detail).toEqual({ chars: 15 })
    expect(JSON.stringify(typed)).not.toContain('secret')
    const code = stepOf(
      'browser_evaluate',
      { code: 'document.cookie' },
      { result: 'x' },
      3
    )
    expect(code.detail).toEqual({ chars: 15 })
    expect(JSON.stringify(code)).not.toContain('cookie')
  })

  it('addresses without their query or fragment, where tokens live', () => {
    expect(
      bareUrl('https://accounts.google.com/v3/signin?continue=x&token=abc#frag')
    ).toBe('https://accounts.google.com/v3/signin')
    const opened = stepOf(
      'browser_open',
      { url: 'https://t27.ai/?t=secret' },
      { result: {} },
      5
    )
    expect(opened.detail.url).toBe('https://t27.ai/')
    expect(bareUrl('not a url')).toBeNull()
  })

  it('what the screenshot saw, and whether it failed', () => {
    const shot = stepOf(
      'browser_screenshot',
      { desktop: true },
      {
        result: {
          base64: 'AAAA',
          tabs: [{}, {}],
          seen: 'Google sign-in',
          seenPending: undefined,
        },
      },
      2400
    )
    expect(shot).toEqual({
      tool: 'browser_screenshot',
      ok: true,
      ms: 2400,
      detail: { desktop: true, tabs: 2, seen: 'Google sign-in' },
    })
    expect(JSON.stringify(shot)).not.toContain('AAAA')
    const failed = stepOf(
      'browser_click',
      { x: 10, y: 20 },
      { error: new Error('needs permission') },
      8
    )
    expect(failed.ok).toBe(false)
    expect(failed.detail).toEqual({ x: 10, y: 20, error: 'needs permission' })
  })
})

function memoryPool() {
  const rows: Array<Record<string, unknown>> = []
  let id = 0
  const sql: string[] = []
  return {
    rows,
    sql,
    async query(q: string, p: unknown[] = []) {
      sql.push(q)
      if (/^\s*INSERT INTO browser_journal/i.test(q)) {
        rows.push({
          id: ++id,
          telegram_id: p[0],
          at: new Date(Date.now() + id).toISOString(),
          tool: p[1],
          ok: p[2],
          ms: p[3],
          detail: p[4],
        })
      }
      if (/^\s*SELECT at, tool/i.test(q)) {
        return {
          rows: rows
            .filter(r => r.telegram_id === p[0])
            .slice()
            .reverse(),
        }
      }
      if (/^\s*SELECT/i.test(q)) return { rows: [] }
      return { rows: [] }
    },
  }
}

describe('the tools write their steps', () => {
  it('a failing call is written as failed, and still fails', async () => {
    const pool = memoryPool()
    const click = BROWSER_TOOLS.find(t => t.name === 'browser_click')!
    await expect(
      click.handler({ x: 1, y: 2 }, { telegramId: '900000001', pool } as never)
    ).rejects.toThrow(/no browser is running/)
    // The write is in the background: wait for it, not for a fixed time.
    for (let i = 0; i < 200 && pool.rows.length === 0; i++)
      await new Promise(r => setTimeout(r, 5))
    expect(pool.rows).toHaveLength(1)
    expect(pool.rows[0]).toMatchObject({
      telegram_id: '900000001',
      tool: 'browser_click',
      ok: false,
    })
    expect(JSON.parse(String(pool.rows[0].detail)).error).toMatch(
      /no browser is running/
    )
  })

  it('a journal that cannot be written never breaks the tool', async () => {
    const broken = {
      async query(q: string) {
        if (/browser_journal/i.test(q)) throw new Error('db down')
        return { rows: [] }
      },
    }
    // The write is fire-and-forget; if it rejected, Node 20 would treat the
    // unhandled rejection as fatal and take the whole render down.
    const unhandled: unknown[] = []
    const onUnhandled = (e: unknown) => void unhandled.push(e)
    process.on('unhandledRejection', onUnhandled)
    try {
      const status = BROWSER_TOOLS.find(t => t.name === 'browser_status')!
      const out = (await status.handler({}, {
        telegramId: '900000001',
        pool: broken,
      } as never)) as { running: boolean }
      expect(out.running).toBe(false)
      await new Promise(r => setTimeout(r, 50))
      expect(unhandled).toEqual([])
    } finally {
      process.off('unhandledRejection', onUnhandled)
    }
  })

  it('reads back newest first, for this person only', async () => {
    const pool = memoryPool()
    await recordStep(
      pool,
      '900000001',
      stepOf(
        'browser_open',
        { url: 'https://a.example/x?y=1' },
        { result: {} },
        1
      )
    )
    await recordStep(
      pool,
      '900000002',
      stepOf(
        'browser_open',
        { url: 'https://other.example/' },
        { result: {} },
        1
      )
    )
    await recordStep(
      pool,
      '900000001',
      stepOf(
        'browser_read',
        {},
        { result: { url: 'https://a.example/x', title: 'A' } },
        2
      )
    )
    const steps = await readJournal(pool, '900000001')
    expect(steps.map(s => s.tool)).toEqual(['browser_read', 'browser_open'])
    expect(steps[1].detail.url).toBe('https://a.example/x')
    expect(pool.sql.some(q => /DELETE FROM browser_journal/.test(q))).toBe(true)
  })
})

describe('GET /api/browser/journal', () => {
  const OWNER = '900000001'
  const deps = (pool: ReturnType<typeof memoryPool>) => ({
    getPool: async () => pool,
    identity: () => OWNER,
    driver: fixedDriver({ endpoint: 'pod:8080' }),
    newToken: () => 'tok',
    actor: () => 'person',
    env: { BROWSER_POD_OWNER: OWNER },
  })

  it('answers the person with their own steps', async () => {
    const pool = memoryPool()
    await recordStep(
      pool,
      OWNER,
      stepOf('browser_status', {}, { result: { running: true, pages: [1] } }, 4)
    )
    const out = await handleBrowser(
      { url: '/api/browser/journal?limit=10', method: 'GET' },
      deps(pool) as never
    )
    expect(out.status).toBe(200)
    expect((out.body as { steps: unknown[] }).steps).toHaveLength(1)
  })

  it('is read-only', async () => {
    const out = await handleBrowser(
      { url: '/api/browser/journal', method: 'POST' },
      deps(memoryPool()) as never
    )
    expect(out.status).toBe(405)
  })
})
