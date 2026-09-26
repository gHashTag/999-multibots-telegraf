import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import {
  ACTING,
  CANARIES,
  alertText,
  answerMisses,
  CANARIES_HASH,
  dueCanaries,
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

describe('which agents are due, each on its own', () => {
  const H24 = 24 * H
  const v = (
    agent: string,
    msAgo: number,
    canaries = CANARIES_HASH
  ): LatestVerdict => ({
    agent,
    pass: true,
    at: new Date(NOW - msAgo).toISOString(),
    tools: [],
    codes: [],
    canaries,
  })
  const ids = (list: { id: string }[]) => list.map(c => c.id).sort()
  const all = CANARIES.map(c => c.id).sort()

  it('never checked: every agent is due', () => {
    expect(ids(dueCanaries([], NOW, H24, CANARIES_HASH))).toEqual(all)
  })

  it('an agent checked an hour ago is not due; the ones never checked are', () => {
    const due = ids(dueCanaries([v('job', H)], NOW, H24, CANARIES_HASH))
    expect(due).not.toContain('job')
    expect(due).toEqual(all.filter(a => a !== 'job'))
  })

  it('a day-old verdict is due again, and only that agent', () => {
    const latest = CANARIES.map(c => v(c.id, c.id === 'scientist' ? 25 * H : H))
    expect(ids(dueCanaries(latest, NOW, H24, CANARIES_HASH))).toEqual([
      'scientist',
    ])
  })

  it('a verdict made under another canary table is stale: due at once', () => {
    const latest = CANARIES.map(c =>
      v(c.id, H, c.id === 'google' ? 'aaaaaaaaaaaa' : CANARIES_HASH)
    )
    expect(ids(dueCanaries(latest, NOW, H24, CANARIES_HASH))).toEqual([
      'google',
    ])
    /* A run that did not say its table ('') is stale too. */
    const unsaid = CANARIES.map(c => v(c.id, H, ''))
    expect(ids(dueCanaries(unsaid, NOW, H24, CANARIES_HASH))).toEqual(all)
  })

  it('tri agents and the server fingerprint the same table the same way', () => {
    expect(script.canariesHash()).toBe(CANARIES_HASH)
    expect(CANARIES_HASH).toMatch(/^[0-9a-f]{12}$/)
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
    expect(alertText([v('job', true), v('scientist', true)], [])).toBeNull()
  })

  it('a failure, with its reason in words', () => {
    const t = alertText([v('job', false, ['acted']), v('scientist', true)], [])
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
  'agent-mail-mcp: https://a.io https://b.io https://c.io\n1. one\n2. two\n3. three\n' +
  'Гипотеза и вывод: частота не измерена. Маршрут yosys, Fmax не запускалось.\n' + // cyrillic-ok: answer fixture
  '```verilog\nmodule m; endmodule\n```\n```verilog\nmodule tb; endmodule\n```\niverilog tb.v'

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
    /* Each verdict kept as it was made: a deploy mid-run loses one, not all. */
    expect(recorded).toHaveLength(CANARIES.length)
    expect(recorded.every(batch => batch.length === 1)).toBe(true)
    expect(out.find(x => x.agent === 'job')).toMatchObject({
      pass: false,
      codes: expect.arrayContaining(['error']),
    })
    expect(out.filter(x => x.pass)).toHaveLength(CANARIES.length - 1)
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
  const scientistThen =
    'Гипотеза: GF16 даёт 35/35 бит-точно. Метод: README и тесты. Вывод: частота не измерена — отозвана.'
  const fpgaThen =
    'Маршрут: yosys -> nextpnr-xilinx -> openXC7. Fmax не запускалось; ресурсы — оценка.'
  const rtlThen =
    '```verilog\nmodule fifo; endmodule\n```\n```verilog\nmodule tb; endmodule\n```\niverilog -g2012 fifo.v tb.v && vvp a.out\nPASS fifo'

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
    expect(answerMisses(byId('scientist').answer, scientistThen)).toEqual([])
    expect(answerMisses(byId('fpga').answer, fpgaThen)).toEqual([])
    expect(answerMisses(byId('rtl').answer, rtlThen)).toEqual([])
  })

  it('bold or bulleted numbering counts as a list too', () => {
    expect(
      answerMisses(byId('tiktok').answer, '**1.** a\n- 2) b\n### 3. c')
    ).toEqual([])
  })

  it('the script counts exactly as the server does', () => {
    for (const c of CANARIES)
      for (const text of [
        googleThen,
        googleGood,
        tiktokThen,
        scientistThen,
        fpgaThen,
        rtlThen,
        '',
      ])
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

describe('a run over only the agents still due', () => {
  it('runs the given list, not the whole table', async () => {
    const asked: string[] = []
    await runAcceptance(
      {
        turn: async function* (c) {
          asked.push(c.id)
          yield ev('текст', { ['текст']: DONE }) // cyrillic-ok
        },
        previous: async () => [],
        record: async () => {},
        tell: async () => {},
      },
      CANARIES.filter(c => c.id === 'tiktok')
    )
    expect(asked).toEqual(['tiktok'])
  })
})
