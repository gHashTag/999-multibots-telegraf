import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  ACTING,
  CANARIES,
  alertText,
  answerMisses,
  CANARIES_HASH,
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
  answerMisses: (rules: unknown, text: string) => string[]
  canariesHash: () => string
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
    canaries: '',
  })

  it('never checked: due; checked an hour ago: not; a day ago: due', () => {
    expect(isDue([], NOW, 24 * H)).toBe(true)
    expect(isDue([at(H)], NOW, 24 * H)).toBe(false)
    expect(isDue([at(25 * H)], NOW, 24 * H)).toBe(true)
  })

  it('a verdict made under another canary table is stale: due at once', () => {
    const fresh = { ...at(H), canaries: 'aaaaaaaaaaaa' }
    expect(isDue([fresh], NOW, 24 * H, 'aaaaaaaaaaaa')).toBe(false)
    expect(isDue([fresh], NOW, 24 * H, 'bbbbbbbbbbbb')).toBe(true)
    /* A run that did not say its table ('') is stale too. */
    expect(
      isDue([{ ...fresh, canaries: '' }], NOW, 24 * H, 'aaaaaaaaaaaa')
    ).toBe(true)
  })

  it('tri agents and the server fingerprint the same table the same way', () => {
    expect(script.canariesHash()).toBe(CANARIES_HASH)
    expect(CANARIES_HASH).toMatch(/^[0-9a-f]{12}$/)
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
    canaries: '',
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

const DONE =
  'agent-mail-mcp: https://a.io https://b.io https://c.io\n1. one\n2. two\n3. three'

describe('the run', () => {
  it('a canary that throws is a failed verdict; the others still run, all are recorded', async () => {
    const recorded: Verdict[][] = []
    const told: string[] = []
    const out = await runAcceptance({
      turn: async function* (c) {
        if (c.id === 'job') throw new Error('Telegram is not connected')
        yield ev('инструмент', { ['имя']: c.expect[0] ?? 'web_search' }) // cyrillic-ok
        /* An answer that does every canary's job (answer rules included). */
        yield ev('текст', { ['текст']: DONE }) // cyrillic-ok
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

/*
 * THE ANSWER IS CHECKED, NOT ONLY THE TOOL CALL. Calibrated on the real
 * 2026-09-24 07:14 run: Google Scout PASSED while its answer began "I have
 * not opened a single source yet" -- its search was down (HTTP 402).
 */
describe('what the answer must show', () => {
  const byId = (id: string) => CANARIES.find(c => c.id === id)!
  const googleThen =
    'Пока не открыл ни одного — этот вопрос первый в разговоре. Ключевой поиск лежит (HTTP 402), ' +
    'остались только открытые источники: Википедия. Честный ответ: данных мало.'
  const googleGood =
    'Спрос растёт: https://trends.google.com/x , https://example.com/report и https://habr.com/ru/articles/1/'
  const tiktokThen =
    'ТРИ ХУКА\n1. Антитеза: «Тебя нет в кадре»\n2. Вопрос-прогноз\n3. Числом\nСЦЕНАРИЙ 30 СЕКУНД'
  const habrThen =
    'Прочитал README (страница GitHub). Что за репо: MCP-сервер + CLI для доступа агента к Zoho Mail.'

  it('the morning run Google Scout "passed" now fails, and says why', () => {
    expect(answerMisses(byId('google').answer, googleThen)).toEqual([
      'меньше трёх ссылок на источники',
    ])
    const v = verdictFor(byId('google'), {
      tools: ['web_search'],
      text: googleThen,
      error: null,
    })
    expect(v).toMatchObject({ pass: false, codes: ['answer_shape'] })
  })

  it('real answers that did the job still pass', () => {
    expect(answerMisses(byId('google').answer, googleGood)).toEqual([])
    expect(answerMisses(byId('tiktok').answer, tiktokThen)).toEqual([])
    expect(answerMisses(byId('habr').answer, habrThen)).toEqual([])
  })

  it('bold or bulleted numbering counts as a list too', () => {
    expect(
      answerMisses(byId('tiktok').answer, '**1.** a\n- 2) b\n### 3. c')
    ).toEqual([])
  })

  it('the script counts exactly as the server does', () => {
    for (const c of CANARIES)
      for (const text of [googleThen, googleGood, tiktokThen, habrThen, ''])
        expect(script.answerMisses(c.answer, text), `${c.id}`).toEqual(
          answerMisses(c.answer, text)
        )
  })

  it('an empty answer is "no answer", not also "the wrong answer"', () => {
    const v = verdictFor(byId('google'), { tools: [], text: '', error: null })
    expect(v.codes).toContain('no_answer')
    expect(v.codes).not.toContain('answer_shape')
  })

  it('the owner hears which rule was missed', () => {
    const t = alertText(
      [{ agent: 'google', pass: false, tools: [], codes: ['answer_shape'] }],
      [],
      { google: ['меньше трёх ссылок на источники'] }
    )
    expect(t).toContain(
      '✗ google: ответ не тот, что просили (меньше трёх ссылок на источники)'
    )
  })
})
