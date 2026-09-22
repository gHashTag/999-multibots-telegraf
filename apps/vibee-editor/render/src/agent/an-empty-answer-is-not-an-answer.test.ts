/**
 * AN EMPTY ANSWER IS NOT AN ANSWER.
 *
 * Production, 2026-09-22, the admin bot, turn 271956af: glm-5.3 called
 * my_assets and my_renders and then ended the turn with no text -- 70 s,
 * length 0. The route reported a finished turn, the bot logged "empty answer"
 * and handed the person to a tool-less fallback with no history, which
 * answered a Russian message in English about a service nobody offers.
 *
 * The rule, proved with fake providers on the real loop: an empty final
 * answer gets one follow-up on the same provider, then the next provider in
 * the chain, and when nobody has anything to say the turn ends with an
 * explicit error the bot recognises -- never with a quiet `готово`.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
  onTestFinished,
} from 'vitest'
import type { MockInstance } from 'vitest'
import {
  ANSWER_NOW_NUDGE,
  EMPTY_ANSWER_ERROR,
  EMPTY_ANSWER_LOG_PREFIX,
  REPEAT_REFUSED,
  runAgent,
} from './chat'
import { forgetProviderChoiceForTests } from './provider-choice'
import { breakerSnapshot, forgetBreakersForTests } from './provider-breaker'
import { TOOLS_BY_NAME } from './tools'

/* ---------- fake providers, told apart by the model they are asked for ---------- */

const PERSON_WORDS = 'покажи мои материалы, пожалуйста' // cyrillic-ok: test fixture

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
const text = (t: string) => sse([{ content: t }])
/** What glm-5.3 did: thought about it, said nothing. */
const empty = () => sse([{ reasoning_content: 'hmm' }])
const tools = (...names: string[]) =>
  sse([
    {
      tool_calls: names.map((name, index) => ({
        index,
        id: `call_${index}`,
        function: { name, arguments: '{}' },
      })),
    },
  ])

type Reply = () => Response
/** Each model gets its own queue of replies; a request past the end fails. */
function providers(script: Record<string, Reply[]>) {
  const asked: Array<{ model: string; messages: any[] }> = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      asked.push({ model: body.model, messages: body.messages })
      const next = script[body.model]?.shift()
      if (!next) return new Response('not scripted', { status: 500 })
      return next()
    })
  )
  return asked
}

const pool = { query: async () => ({ rows: [] }) }

async function turn() {
  const events: Array<Record<string, unknown>> = []
  for await (const ev of runAgent(
    [{ role: 'user', content: PERSON_WORDS }],
    { telegramId: '900000001', pool, turn: 't-empty' } as Parameters<
      typeof runAgent
    >[1],
    { surface: 'bot' }
  ))
    events.push(ev as Record<string, unknown>)
  return events
}

const kinds = (events: Array<Record<string, unknown>>) =>
  events.map(e => e['тип'])
const said = (events: Array<Record<string, unknown>>) =>
  events
    .filter(e => e['тип'] === 'текст')
    .map(e => String(e['текст']))
    .join('')

let warn: MockInstance<typeof console.warn>
const emptyLines = () =>
  warn.mock.calls
    .filter(c => String(c[0]) === EMPTY_ANSWER_LOG_PREFIX)
    .map(c => JSON.parse(String(c[1])))

beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('NVIDIA_API_KEY', 'n')
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

describe('an empty answer after tools', () => {
  it('gets one follow-up on the same provider, and its text reaches the person', async () => {
    const asked = providers({
      'glm-5.3': [
        () => tools('my_assets', 'my_renders'),
        empty,
        () => text('Вот что у тебя есть.'), // cyrillic-ok: fixture answer
      ],
    })
    const events = await turn()

    expect(said(events)).toBe('Вот что у тебя есть.') // cyrillic-ok: fixture answer
    expect(kinds(events)).toContain('готово')
    expect(kinds(events)).not.toContain('ошибка')

    // The follow-up went back to the model that holds the context, with the
    // tool results already in the history and the request after them.
    expect(asked.map(a => a.model)).toEqual(['glm-5.3', 'glm-5.3', 'glm-5.3'])
    const followUp = asked[2].messages
    expect(followUp[followUp.length - 1]).toEqual({
      role: 'user',
      content: ANSWER_NOW_NUDGE,
    })
    expect(followUp.filter((m: any) => m.role === 'tool')).toHaveLength(2)
    // Asked once: the empty call itself carried no nudge.
    expect(
      asked[1].messages.some((m: any) => m.content === ANSWER_NOW_NUDGE)
    ).toBe(false)
  })

  it('logs the decision with turn, provider and tool names, and never the words', async () => {
    providers({
      'glm-5.3': [
        () => tools('my_assets', 'my_renders'),
        empty,
        () => text('Готово.'), // cyrillic-ok: fixture answer
      ],
    })
    await turn()
    const lines = emptyLines()
    expect(lines).toEqual([
      {
        turn: 't-empty',
        surface: 'bot',
        provider: 'zai',
        tools: ['my_assets', 'my_renders'],
        action: 'follow-up',
      },
    ])
    const raw = warn.mock.calls.map(c => c.join(' ')).join('\n')
    expect(raw).not.toContain(PERSON_WORDS)
  })

  it('the follow-up goes to the provider that was empty, not back to the head of the chain', async () => {
    const busy = () => new Response('busy', { status: 429 })
    const asked = providers({
      'glm-5.3': [busy, busy, busy],
      'glm-4.5': [
        () => tools('my_assets'),
        empty,
        () => text('Вот.'), // cyrillic-ok: fixture answer
      ],
    })
    const events = await turn()
    expect(said(events)).toBe('Вот.') // cyrillic-ok: fixture answer
    // zai refused twice; the empty answer came from zai-lite, so zai-lite is
    // asked again -- a third refusal from zai would only cost a round trip.
    expect(asked.map(a => a.model)).toEqual([
      'glm-5.3',
      'glm-4.5',
      'glm-5.3',
      'glm-4.5',
      'glm-4.5',
    ])
  })

  it('still empty after the follow-up: the next provider in the chain answers', async () => {
    const asked = providers({
      'glm-5.3': [() => tools('my_assets'), empty, empty],
      'glm-4.5': [() => text('Нашёл два файла.')], // cyrillic-ok: fixture answer
    })
    const events = await turn()

    expect(said(events)).toBe('Нашёл два файла.') // cyrillic-ok: fixture answer
    expect(kinds(events)).not.toContain('ошибка')
    expect(asked.map(a => a.model)).toEqual([
      'glm-5.3',
      'glm-5.3',
      'glm-5.3',
      'glm-4.5',
    ])
    // The next provider sees the tool results and the request for words.
    const last = asked[3].messages
    expect(last.some((m: any) => m.role === 'tool')).toBe(true)
    expect(last[last.length - 1].content).toBe(ANSWER_NOW_NUDGE)
    expect(emptyLines().map(l => [l.provider, l.action])).toEqual([
      ['zai', 'follow-up'],
      ['zai', 'next provider'],
    ])
  })

  it('every provider empty: an explicit error naming each of them, not an empty finish', async () => {
    providers({
      'glm-5.3': [() => tools('my_assets', 'my_renders'), empty, empty],
      'glm-4.5': [empty, empty],
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': [empty, empty],
    })
    const events = await turn()

    expect(said(events)).toBe('')
    expect(kinds(events)).not.toContain('готово')
    const error = events.find(e => e['тип'] === 'ошибка')
    expect(error, 'the turn ended without saying it failed').toBeTruthy()
    const why = String(error?.['текст'])
    expect(why.startsWith(EMPTY_ANSWER_ERROR)).toBe(true)
    for (const id of ['zai', 'zai-lite', 'nemotron']) expect(why).toContain(id)
    expect(why).toContain('my_assets')
    expect(emptyLines().at(-1)?.action).toBe('failed')
  })

  it('is bounded: each provider is asked at most twice for words', async () => {
    const asked = providers({
      'glm-5.3': [() => tools('my_assets'), empty, empty, empty, empty],
      'glm-4.5': [empty, empty, empty, empty],
      'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning': [empty, empty, empty],
    })
    await turn()
    const count = (m: string) => asked.filter(a => a.model === m).length
    expect(count('glm-5.3')).toBe(3) // the tool step, then two empty answers
    expect(count('glm-4.5')).toBe(2)
    expect(count('nvidia/nemotron-3-nano-omni-30b-a3b-reasoning')).toBe(2)
  })
})

describe('what is NOT an empty answer', () => {
  it('a turn that already said something before its tools is left alone', async () => {
    const asked = providers({
      'glm-5.3': [
        () =>
          sse([
            { content: 'Сохранил.' }, // cyrillic-ok: fixture answer
            {
              tool_calls: [
                {
                  index: 0,
                  id: 'c',
                  function: { name: 'my_assets', arguments: '{}' },
                },
              ],
            },
          ]),
        empty,
      ],
    })
    const events = await turn()
    expect(said(events)).toBe('Сохранил.') // cyrillic-ok: fixture answer
    expect(kinds(events)).toContain('готово')
    expect(asked).toHaveLength(2)
    expect(emptyLines()).toEqual([])
  })

  it('the unattended sweep (tools only) is not asked for prose', async () => {
    const asked = providers({
      'glm-5.3': [() => tools('my_assets'), empty],
    })
    const events: Array<Record<string, unknown>> = []
    for await (const ev of runAgent(
      [{ role: 'user', content: 'sweep brief' }],
      { telegramId: '900000002', pool, turn: 't-sweep' } as Parameters<
        typeof runAgent
      >[1],
      { toolsOnly: true }
    ))
      events.push(ev as Record<string, unknown>)
    expect(kinds(events)).toContain('готово')
    expect(asked).toHaveLength(2)
  })

  it('an empty answer is not a timeout: it does not open the breaker by itself', async () => {
    providers({
      'glm-5.3': [() => tools('my_assets'), empty, empty],
      'glm-4.5': [() => text('Есть.')], // cyrillic-ok: fixture answer
    })
    await turn()
    expect(breakerSnapshot()).toEqual([])
  })
})

describe('the follow-up does not redo the work', () => {
  /** A call with arguments of our choosing, as one streamed tool delta. */
  const callWith = (name: string, args: Record<string, unknown>) => () =>
    sse([
      {
        tool_calls: [
          {
            index: 0,
            id: `call_${name}`,
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      },
    ])
  /** my_assets, answered without a database; counts how often it RAN. */
  const countAssets = () => {
    const tool = TOOLS_BY_NAME.get('my_assets')
    if (!tool) throw new Error('my_assets is not in the registry')
    return vi.spyOn(tool, 'handler').mockResolvedValue({ files: [] })
  }

  it('an identical call after the request for words is refused, and the handler does not run again', async () => {
    const ran = countAssets()
    const asked = providers({
      'glm-5.3': [
        callWith('my_assets', { limit: 5 }),
        empty,
        // Asked for words, it does the work again instead.
        callWith('my_assets', { limit: 5 }),
        () => text('Файлов пока нет.'), // cyrillic-ok: fixture answer
      ],
    })
    const events = await turn()

    expect(said(events)).toBe('Файлов пока нет.') // cyrillic-ok: fixture answer
    expect(ran, 'the same call ran twice in one turn').toHaveBeenCalledTimes(1)
    const results = events.filter(e => e['тип'] === 'результат')
    expect(results).toHaveLength(2)
    expect(results[1]['значение']).toMatchObject({ ['отказано']: true })
    // The model is told why, in the result it reads next.
    const last = asked[asked.length - 1].messages
    const toolReplies = last.filter((m: any) => m.role === 'tool')
    expect(String(toolReplies[toolReplies.length - 1].content)).toContain(
      REPEAT_REFUSED
    )
    expect(emptyLines().map(l => l.action)).toContain('repeat refused')
  })

  it('the next model writing the same arguments in another key order is still a repeat', async () => {
    const ran = countAssets()
    /*
     * The call is checked against the tool's schema before it runs
     * (tool-args.ts), and my_assets takes only `limit`: for the length of
     * this test it also takes the fields that make the key order interesting.
     */
    const tool = TOOLS_BY_NAME.get('my_assets')!
    const schema = tool.parameters
    tool.parameters = {
      type: 'object',
      properties: { limit: {}, kind: {}, where: {} },
      additionalProperties: false,
    }
    onTestFinished(() => {
      tool.parameters = schema
    })
    providers({
      'glm-5.3': [
        callWith('my_assets', {
          limit: 5,
          kind: 'image',
          where: { a: 1, b: 2 },
        }),
        empty,
        empty,
      ],
      // zai-lite gets the history and the nudge, and redoes the work with the
      // keys in its own order, nested ones included.
      'glm-4.5': [
        callWith('my_assets', {
          where: { b: 2, a: 1 },
          kind: 'image',
          limit: 5,
        }),
        () => text('Вот твои картинки.'), // cyrillic-ok: fixture answer
      ],
    })
    const events = await turn()
    expect(said(events)).toBe('Вот твои картинки.') // cyrillic-ok: fixture answer
    expect(
      ran,
      'reordered keys made the same call run twice'
    ).toHaveBeenCalledTimes(1)
    const results = events.filter(e => e['тип'] === 'результат')
    expect(results[results.length - 1]['значение']).toMatchObject({
      ['отказано']: true,
    })
  })

  it('a different call after the request for words still runs', async () => {
    const ran = countAssets()
    providers({
      'glm-5.3': [
        callWith('my_assets', { limit: 5 }),
        empty,
        callWith('my_assets', { limit: 20 }),
        () => text('Вот двадцать последних.'), // cyrillic-ok: fixture answer
      ],
    })
    const events = await turn()
    expect(said(events)).toBe('Вот двадцать последних.') // cyrillic-ok: fixture answer
    expect(ran).toHaveBeenCalledTimes(2)
  })

  it('before the request for words, a repeat runs as it always did', async () => {
    const ran = countAssets()
    providers({
      'glm-5.3': [
        callWith('my_assets', { limit: 5 }),
        callWith('my_assets', { limit: 5 }),
        () => text('Вот.'), // cyrillic-ok: fixture answer
      ],
    })
    await turn()
    expect(ran).toHaveBeenCalledTimes(2)
  })
})
