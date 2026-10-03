/**
 * A DESK THAT STARTS THE PERSON'S BROWSER LEAVES A STEP IN THE JOURNAL.
 *
 * 2026-10-03: right after a render deploy, `tri browser doctor` showed the
 * owner's visit "on record" (created 00:11:12) while the newest journal step
 * was from 22:47 the day before. The Reddit desk's hourly tick had run at
 * 00:11:11, found no live visit, and started one -- and since the desks drive
 * the page over CDP rather than through the journaled tools, nothing said who
 * had opened it. The real start function is exercised here, not a mock.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { configureAgentStart, startBrowserAsAgent } from './src/browser/routes'
import { resetBrowserSessionsCache } from './src/browser/sessions'
import { resetJournalCacheForTests } from './src/browser/journal'
import { reportBrowserWork, stepInWords } from './src/browser/report'

const WHO = '9000000071'
let journal: unknown[][] = []

const pool = {
  query: async (sql: string, params: unknown[] = []) => {
    if (/INSERT INTO browser_journal/i.test(sql)) journal.push(params)
    if (/RETURNING profile_id/i.test(sql))
      return { rows: [{ profile_id: 'profile-1' }] }
    return { rows: [] }
  },
}

const driver = (fails = false) => ({
  start: async () => {
    if (fails) throw new Error('no pod')
    return {
      podId: 'pod-1',
      endpoint: 'pod.internal:8080',
      cdpEndpoint: 'pod.internal:9222',
      viewToken: '',
      adminToken: '',
    }
  },
  stop: async () => undefined,
  alive: async () => false,
})

const configure = (fails = false) =>
  configureAgentStart(
    () =>
      ({
        getPool: async () => pool,
        driver: driver(fails),
        newToken: () => 'tok',
        env: {},
      }) as never
  )

beforeEach(() => {
  journal = []
  resetBrowserSessionsCache()
  resetJournalCacheForTests()
})

describe('who started the browser is written down', () => {
  it('a desk names itself in a browser_start step', async () => {
    configure()
    expect(await startBrowserAsAgent(WHO, 'reddit')).toBe(true)
    expect(journal).toHaveLength(1)
    const [who, tool, ok, , detail] = journal[0]
    expect([who, tool, ok]).toEqual([WHO, 'browser_start', true])
    expect(JSON.parse(String(detail))).toEqual({ by: 'reddit' })
  })

  it('a start that failed is journaled as failed', async () => {
    configure(true)
    expect(await startBrowserAsAgent(WHO, 'engage')).toBe(false)
    expect(journal).toHaveLength(1)
    expect(journal[0][2]).toBe(false)
    expect(JSON.parse(String(journal[0][4]))).toMatchObject({ by: 'engage' })
  })

  it('the tools leave it out: their own call is the step', async () => {
    configure()
    expect(await startBrowserAsAgent(WHO)).toBe(true)
    expect(journal).toEqual([])
  })

  it('the person reads which desk it was', () => {
    const row = (by: string) => ({
      at: '2026-10-03T00:11:12Z',
      tool: 'browser_start',
      ok: true,
      ms: 900,
      detail: { by },
    })
    expect(stepInWords(row('reddit'))).toContain('Reddit')
    expect(stepInWords(row('something-new'))).toContain('агент') // cyrillic-ok
  })
})

describe("a desk start inside a chat turn is not the turn's report", () => {
  const since = Date.parse('2026-10-03T00:11:00Z')
  const step = (tool: string, at: string) => ({
    at,
    tool,
    ok: true,
    ms: 900,
    detail: tool === 'browser_start' ? { by: 'reddit' } : {},
  })
  const run = async (steps: ReturnType<typeof step>[]) => {
    const sent: string[] = []
    const out = await reportBrowserWork(
      {
        readSteps: async () => steps,
        sendText: async text => void sent.push(text),
        sendVideo: async () => undefined,
        film: async () => ({ mp4: null, frames: 0 }),
        settle: async () => undefined,
      },
      { since, task: 'hi', answer: 'hello' }
    )
    return { out, sent }
  }

  it('a turn that never touched the browser stays silent', async () => {
    const { out, sent } = await run([
      step('browser_start', '2026-10-03T00:11:12Z'),
    ])
    expect(out).toBe('silent')
    expect(sent).toEqual([])
  })

  it('a turn that did work is reported without the desk start', async () => {
    const { out, sent } = await run([
      step('browser_status', '2026-10-03T00:11:20Z'),
      step('browser_start', '2026-10-03T00:11:12Z'),
    ])
    expect(out).toBe('sent')
    expect(sent[0]).not.toContain('Reddit')
  })
})
