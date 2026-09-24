import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  ACTING,
  CANARIES,
  alertText,
  isDue,
  runAcceptance,
  seenOf,
  verdictFor,
  type Canary,
} from './src/agent/daily-acceptance'
import type { LatestVerdict, Verdict } from './src/agent/agent-acceptance'

/**
 * THE DAILY CHECK (owner, 2026-09-24: all three next steps).
 *
 * Each case is a way a scheduled check stops being one: a run that skips a
 * day after a redeploy or runs twice, a turn that throws and takes the other
 * agents down with it, an owner who hears "all fine" daily until he stops
 * reading, or a server rule that quietly disagrees with `tri agents`.
 */

const require = createRequire(import.meta.url)
const script = require('../../../scripts/agents-acceptance.cjs') as {
  AGENTS: Canary[]
  ACTING: string[]
  verdict: (
    a: { expect: string[] },
    run: { status: number; tools: string[]; text: string; error: string | null }
  ) => { pass: boolean; codes: string[] }
}

const ev = (kind: string, extra: Record<string, unknown> = {}) => ({
  ['тип']: kind, // cyrillic-ok: the agent's event key
  ...extra,
})
const H = 3_600_000
const NOW = Date.UTC(2026, 8, 24, 9, 0)

describe('one table for the script and the server', () => {
  it('the server reads exactly the canaries and the ACTING list tri agents uses', () => {
    expect(CANARIES).toEqual(script.AGENTS)
    expect(ACTING).toEqual(script.ACTING)
  })

  it('the server verdict and the script verdict agree, case by case', () => {
    const job = CANARIES.find(c => c.id === 'job')!
    const cases = [
      { tools: ['job_hunters'], text: 'ответ', error: null },
      { tools: [], text: '', error: null },
      { tools: ['tg_send', 'job_hunters'], text: 'x', error: null },
      { tools: ['web_read'], text: 'x', error: 'cut: timeout' },
    ]
    for (const seen of cases) {
      const server = verdictFor(job, seen)
      const cli = script.verdict(job, { status: 200, ...seen })
      expect(server.pass, JSON.stringify(seen)).toBe(cli.pass)
      expect(server.codes, JSON.stringify(seen)).toEqual(cli.codes)
    }
  })
})

describe('reading a turn', () => {
  it('collects tool names, the answer and a cut', () => {
    const seen = seenOf([
      ev('инструмент', { ['имя']: 'web_search' }), // cyrillic-ok: event names
      ev('текст', { ['текст']: 'Три ' }), // cyrillic-ok
      ev('текст', { ['текст']: 'источника' }), // cyrillic-ok
      ev('готово', { ['обрыв']: 'timeout' }), // cyrillic-ok
    ])
    expect(seen).toEqual({
      tools: ['web_search'],
      text: 'Три источника',
      error: 'cut: timeout',
    })
  })
})

describe('when a run is due', () => {
  const at = (msAgo: number): LatestVerdict => ({
    agent: 'job',
    pass: true,
    at: new Date(NOW - msAgo).toISOString(),
    tools: [],
    codes: [],
  })

  it('never checked: due; checked an hour ago: not; a day ago: due', () => {
    expect(isDue([], NOW, 24 * H)).toBe(true)
    expect(isDue([at(H)], NOW, 24 * H)).toBe(false)
    expect(isDue([at(25 * H)], NOW, 24 * H)).toBe(true)
  })

  it('the NEWEST verdict decides, so one stale agent does not rerun all daily', () => {
    expect(isDue([at(30 * H), at(H)], NOW, 24 * H)).toBe(false)
  })
})

describe('what the owner hears', () => {
  const v = (agent: string, pass: boolean, codes: Verdict['codes'] = []) => ({
    agent,
    pass,
    tools: [],
    codes,
  })
  const was = (agent: string, pass: boolean): LatestVerdict => ({
    ...v(agent, pass),
    at: '2026-09-23T09:00:00Z',
  })

  it('nothing when everything passes, as it did before', () => {
    expect(alertText([v('job', true), v('habr', true)], [])).toBeNull()
  })

  it('a failure, with its reason in words', () => {
    const t = alertText([v('job', false, ['acted']), v('habr', true)], [])
    expect(t).toContain('1/2')
    expect(t).toContain('✗ job')
    expect(t).toContain('публиковать')
  })

  it('a recovery, once', () => {
    const t = alertText([v('job', true)], [was('job', false)])
    expect(t).toContain('✓ job')
    expect(alertText([v('job', true)], [was('job', true)])).toBeNull()
  })
})

describe('the run', () => {
  it('a canary that throws is a failed verdict; the others still run, all are recorded', async () => {
    const recorded: Verdict[][] = []
    const told: string[] = []
    const out = await runAcceptance({
      turn: async function* (c) {
        if (c.id === 'job') throw new Error('Telegram is not connected')
        yield ev('инструмент', { ['имя']: c.expect[0] ?? 'web_search' }) // cyrillic-ok
        yield ev('текст', { ['текст']: 'ok' }) // cyrillic-ok
      },
      previous: async () => [],
      record: async v => void recorded.push(v),
      tell: async t => void told.push(t),
    })
    expect(out).toHaveLength(CANARIES.length)
    expect(out.find(x => x.agent === 'job')).toMatchObject({
      pass: false,
      codes: expect.arrayContaining(['error']),
    })
    expect(out.filter(x => x.pass)).toHaveLength(CANARIES.length - 1)
    expect(recorded).toHaveLength(1)
    expect(told).toHaveLength(1)
    expect(told[0]).toContain('✗ job')
  })
})
