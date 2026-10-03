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
import { describe, it, expect, beforeEach, vi } from 'vitest'

/* The pod in the last restart case keeps its boot identity and never answers. */
vi.mock('./src/browser/health', async orig => ({
  ...(await orig<typeof import('./src/browser/health')>()),
  cdpHealthIo: async () => ({}),
  waitForBrowser: async () => false,
}))
vi.mock('./src/browser/boot', async orig => ({
  ...(await orig<typeof import('./src/browser/boot')>()),
  browserBootId: async () => 'boot-1',
}))
import {
  configureAgentStart,
  restartBrowserAsAgent,
  startBrowserAsAgent,
} from './src/browser/routes'
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

describe('who restarted the browser is written down too', () => {
  it('the round names itself in a browser_restart step', async () => {
    configure()
    expect(await restartBrowserAsAgent(WHO, 'rounds')).toBe(true)
    const steps = journal.filter(r => r[1] === 'browser_restart')
    expect(steps).toHaveLength(1)
    expect(steps[0][2]).toBe(true)
    expect(JSON.parse(String(steps[0][4]))).toEqual({ by: 'rounds' })
  })

  it('a restart that did not come back is journaled as failed', async () => {
    configure(true)
    expect(await restartBrowserAsAgent(WHO, 'heal')).toBe(false)
    const steps = journal.filter(r => r[1] === 'browser_restart')
    expect(steps).toHaveLength(1)
    expect(steps[0][2]).toBe(false)
    expect(JSON.parse(String(steps[0][4]))).toMatchObject({
      by: 'heal',
      error: expect.stringMatching(/^did not come back \(status \d+\)$/),
    })
  })

  it('a pod the driver will not restart says so, not "did not come back"', async () => {
    configureAgentStart(
      () =>
        ({
          getPool: async () => pool,
          driver: { ...driver(), restart: async () => false },
          newToken: () => 'tok',
          env: {},
        }) as never
    )
    expect(await restartBrowserAsAgent(WHO, 'rounds')).toBe(false)
    const steps = journal.filter(r => r[1] === 'browser_restart')
    expect(steps).toHaveLength(1)
    expect(JSON.parse(String(steps[0][4]))).toEqual({
      by: 'rounds',
      error: 'the driver cannot restart this pod',
    })
  })

  it('a journal that cannot be reached does not change the answer', async () => {
    let calls = 0
    configureAgentStart(
      () =>
        ({
          getPool: async () => {
            if (++calls > 1) throw new Error('pool gone')
            return pool
          },
          driver: driver(),
          newToken: () => 'tok',
          env: {},
        }) as never
    )
    await expect(restartBrowserAsAgent(WHO, 'heal')).resolves.toBe(true)
  })

  it('a pod that came back without answering says so, and which kind', async () => {
    /*
     * A pool that remembers the session row: the old browser is up before the
     * restart (its boot identity is read first) and the new one has a CDP.
     */
    let row: Record<string, unknown> | null = {
      telegram_id: WHO,
      session_id: 'session-0',
      pod_id: 'pod-1',
      endpoint: 'pod.internal:8080',
      cdp_endpoint: 'pod.internal:9222',
      state: 'running',
    }
    const remembering = {
      query: async (sql: string, params: unknown[] = []) => {
        if (/INSERT INTO browser_journal/i.test(sql)) journal.push(params)
        if (/INSERT INTO browser_sessions/i.test(sql))
          row = {
            telegram_id: params[0],
            session_id: params[1],
            pod_id: params[2],
            endpoint: params[3],
            cdp_endpoint: params[4],
            state: params[5],
          }
        if (/DELETE FROM browser_sessions/i.test(sql)) row = null
        if (/FROM browser_sessions WHERE telegram_id/i.test(sql))
          return { rows: row ? [row] : [] }
        if (/RETURNING profile_id/i.test(sql))
          return { rows: [{ profile_id: 'profile-1' }] }
        return { rows: [] }
      },
    }
    configureAgentStart(
      () =>
        ({
          getPool: async () => remembering,
          driver: driver(),
          newToken: () => 'tok',
          env: {},
        }) as never
    )
    expect(await restartBrowserAsAgent(WHO, 'heal')).toBe(false)
    const steps = journal.filter(r => r[1] === 'browser_restart')
    expect(steps).toHaveLength(1)
    expect(JSON.parse(String(steps[0][4]))).toEqual({
      by: 'heal',
      error: 'came back but does not answer (same-browser)',
    })
  })

  it('without a name nothing is written', async () => {
    configure()
    expect(await restartBrowserAsAgent(WHO)).toBe(true)
    expect(journal).toEqual([])
  })

  it('the person reads that the browser was restarted, and by what', () => {
    const said = stepInWords({
      at: '2026-10-03T01:00:00Z',
      tool: 'browser_restart',
      ok: true,
      ms: 40000,
      detail: { by: 'heal' },
    })
    expect(said).toContain('Перезапустил') // cyrillic-ok
    expect(said).toContain('починка') // cyrillic-ok
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
