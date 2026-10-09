/**
 * EVERY FILE A TOOL MADE REACHES THE PERSON (agent-claims-honest.t27 v2).
 *
 * Owner, 2026-10-09, a client thread: image_edit drew real posters and the
 * answers read "Link:" with nothing after it, or "(link removed: no such
 * file)" -- the model's own copy of the URL was the only road to the file.
 * Proved on the real loop with a fake provider and the maker tool's handler
 * stubbed: the host appends what was made and the answer did not carry.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgent } from './chat'
import { TOOLS_BY_NAME } from './tools'
import { forgetProviderChoiceForTests } from './provider-choice'
import { forgetBreakersForTests } from './provider-breaker'

const BASE = 'https://bucket-production-8259.up.railway.app/vibee-assets'
const POSTER = `${BASE}/assets/1791547101324-4b3edafccd7463ef-agent-edit-1791547101277.png`

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
// The arguments pass the tool's own schema check; the handler is stubbed.
const ARGS: Record<string, string> = {
  image_edit: JSON.stringify({
    prompt: 'афиша 9:16',
    image_url: `${BASE}/assets/source.png`,
  }),
}
const call = (name: string) =>
  sse([
    {
      tool_calls: [
        {
          index: 0,
          id: 'call_0',
          function: { name, arguments: ARGS[name] ?? '{}' },
        },
      ],
    },
  ])

function script(answers: Array<() => Response>) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => {
      const next = answers.shift()
      return next ? next() : new Response('not scripted', { status: 500 })
    })
  )
}

const pool = { query: async () => ({ rows: [] }) }

async function turn() {
  const events: Array<Record<string, unknown>> = []
  for await (const ev of runAgent(
    [{ role: 'user', content: 'сделай афишу' }],
    { telegramId: '900000002', pool, turn: 't-file' } as Parameters<
      typeof runAgent
    >[1],
    { surface: 'miniapp' }
  ))
    events.push(ev as Record<string, unknown>)
  return events
}
const said = (events: Array<Record<string, unknown>>) =>
  events
    .filter(e => e['тип'] === 'текст')
    .map(e => String(e['текст']))
    .join('')
const count = (s: string, sub: string) => s.split(sub).length - 1

function stubTool(name: string, answer: unknown) {
  const tool = TOOLS_BY_NAME.get(name)!
  return vi.spyOn(tool, 'handler').mockResolvedValue(answer as never)
}

beforeEach(() => {
  vi.stubEnv('S3_PUBLIC_URL', BASE)
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('KIE_AI_API_KEY', '')
  vi.stubEnv('NVIDIA_API_KEY', '')
  vi.stubEnv('AGENT_PROVIDER', '')
  vi.stubEnv('RESERVE_BASE_URL', '')
  vi.stubEnv('OLLAMA_BASE_URL', '')
  vi.stubEnv('RAILWAY_SERVICE_QUEEN_OLLAMA_URL', '')
  vi.stubEnv('OLLAMA_ENABLED', '')
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'log').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  forgetProviderChoiceForTests()
  forgetBreakersForTests()
})

describe('a file a tool made', () => {
  it('"Done! Link:" with no link: the host appends the poster', async () => {
    stubTool('image_edit', { done: true, url: POSTER })
    script([
      () => call('image_edit'),
      () => sse([{ content: '✅ Афиша готова!\n📸 Ссылка:' }]),
    ])
    const out = said(await turn())
    expect(out).toContain(`📎 ${POSTER}`)
    expect(out).not.toContain('ссылку на файл убрал')
  })

  it('a link wrapped in ** is still the file: kept, and not appended twice', async () => {
    stubTool('image_edit', { done: true, url: POSTER })
    script([
      () => call('image_edit'),
      () => sse([{ content: `Готово: **${POSTER}**— смотри` }]),
    ])
    const out = said(await turn())
    expect(out).not.toContain('ссылку на файл убрал')
    expect(count(out, POSTER)).toBe(1)
  })

  it('a picture still drawing is no file yet: nothing is appended', async () => {
    stubTool('image_edit', { done: false, pending: true, taskId: 'k1' })
    script([
      () => call('image_edit'),
      () => sse([{ content: 'Рисуется, придёт сама.' }]),
    ])
    const out = said(await turn())
    expect(out).not.toContain('📎')
  })

  it('a tool that is not a maker names a file: it is not appended', async () => {
    stubTool('crm_client_face', { url: POSTER, done: true })
    script([
      () => call('crm_client_face'),
      () => sse([{ content: 'Лицо нашёл.' }]),
    ])
    const events = await turn()
    // The stub really answered with our file: the test is about the list.
    expect(events.find(e => e['тип'] === 'результат')?.['значение']).toEqual({
      url: POSTER,
      done: true,
    })
    expect(said(events)).not.toContain('📎')
  })

  it('the step limit still hands over what was made', async () => {
    stubTool('image_edit', { done: true, url: POSTER })
    script(Array.from({ length: 12 }, () => () => call('image_edit')))
    const events = await turn()
    expect(said(events)).toContain(`📎 ${POSTER}`)
    expect(events.at(-1)?.['code']).toBe('step_limit')
  })
})
