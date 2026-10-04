/**
 * A SWEEP MODEL THAT TALKS INSTEAD OF CALLING GIVES WAY.
 *
 * Production 2026-10-04 20:04, the owner: the seller's sweep (a
 * toolsOnly turn) reached zai-lite/glm-4.5-flash, which answered "calling the
 * context for the first lead" and called nothing. The turn ended as done, the
 * bot filed it as failed, and its one retry reached the same model again.
 *
 * Proved on the real loop with fake providers: the talker is out of the turn,
 * the next tool-capable provider gets it, and the talker's words never reach
 * the caller. With nobody left, the old behaviour stands.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { MockInstance } from 'vitest'
import { EMPTY_ANSWER_LOG_PREFIX, runAgent } from './chat'
import { forgetProviderChoiceForTests } from './provider-choice'
import { forgetBreakersForTests } from './provider-breaker'

function sse(deltas: Array<Record<string, unknown>>): Response {
  return new Response(
    [
      ...deltas.map(
        d => `data: ${JSON.stringify({ choices: [{ delta: d }] })}`
      ),
      'data: [DONE]',
      '',
    ].join('\n'),
    { status: 200, headers: { 'Content-Type': 'text/event-stream' } }
  )
}
const text = (t: string) => () => sse([{ content: t }])
const call = (name: string) => () =>
  sse([
    {
      tool_calls: [
        { index: 0, id: 'call_0', function: { name, arguments: '{}' } },
      ],
    },
  ])

function providers(script: Record<string, Array<() => Response>>) {
  const asked: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      asked.push(body.model)
      const next = script[body.model]?.shift()
      if (!next) return new Response('not scripted', { status: 500 })
      return next()
    })
  )
  return asked
}

const pool = { query: async () => ({ rows: [] }) }
const TALK = 'Calling the context for the first lead now.'

async function turn(toolsOnly: boolean) {
  const events: Array<Record<string, unknown>> = []
  for await (const ev of runAgent(
    [{ role: 'user', content: 'sweep' }],
    { telegramId: '900000002', pool, turn: 't-talk' } as Parameters<
      typeof runAgent
    >[1],
    { surface: 'bot', toolsOnly }
  ))
    events.push(ev as Record<string, unknown>)
  return events
}
const said = (events: Array<Record<string, unknown>>) =>
  events
    .filter(e => e['тип'] === 'текст')
    .map(e => String(e['текст']))
    .join('')
const toolsRun = (events: Array<Record<string, unknown>>) =>
  events.filter(e => e['тип'] === 'инструмент').map(e => e['имя'])

let warn: MockInstance<typeof console.warn>
beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('NVIDIA_API_KEY', '')
  vi.stubEnv('AGENT_PROVIDER', '')
  vi.stubEnv('AGENT_MODEL', '')
  vi.stubEnv('RESERVE_BASE_URL', '')
  vi.stubEnv('OLLAMA_BASE_URL', '')
  vi.stubEnv('RAILWAY_SERVICE_QUEEN_OLLAMA_URL', '')
  vi.stubEnv('OLLAMA_ENABLED', '')
  warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
  forgetBreakersForTests()
})

describe('a toolsOnly turn', () => {
  it('drops the talker and lets the next provider call the tool', async () => {
    const asked = providers({
      'glm-4.7-flash': [text(TALK)],
      'glm-4.5-flash': [call('crm_leads'), text('quiet')],
    })
    const events = await turn(true)
    expect(asked.slice(0, 2)).toEqual(['glm-4.7-flash', 'glm-4.5-flash'])
    expect(toolsRun(events)).toEqual(['crm_leads'])
    expect(said(events)).not.toContain(TALK)
    expect(said(events)).toContain('quiet')
    const lines = warn.mock.calls
      .filter(c => String(c[0]) === EMPTY_ANSWER_LOG_PREFIX)
      .map(c => JSON.parse(String(c[1])))
    expect(lines.map(l => l.action)).toContain('talked instead of calling')
  })

  it('with nobody left, the last talker still answers in words', async () => {
    providers({
      'glm-4.7-flash': [text(TALK)],
      'glm-4.5-flash': [text(TALK)],
    })
    const events = await turn(true)
    expect(toolsRun(events)).toEqual([])
    expect(said(events)).toBe(TALK)
    expect(events.at(-1)?.['тип']).toBe('готово')
  })

  it('after a tool ran, words end the turn as before', async () => {
    const asked = providers({
      'glm-4.7-flash': [call('crm_leads'), text('quiet')],
    })
    const events = await turn(true)
    expect(asked).toEqual(['glm-4.7-flash', 'glm-4.7-flash'])
    expect(said(events)).toBe('quiet')
  })
})

describe('a turn with a person on the other end', () => {
  it('keeps the plain answer from the first provider, streamed', async () => {
    const asked = providers({ 'glm-4.7-flash': [text('hello')] })
    const events = await turn(false)
    expect(asked).toEqual(['glm-4.7-flash'])
    expect(said(events)).toBe('hello')
  })
})
