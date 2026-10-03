/**
 * THE AGENT IS TOLD WHAT THE OWNER SEES BESIDE A CLIENT'S CHAT (client-widgets.ts).
 *
 * Owner, 2026-10-03: "the agent must know the widgets' context, or it does
 * complete nonsense". With the reel panel open on a new topic, three frames
 * and "to her DM" ticked, "make the reel" got an OLD render resent with
 * my_renders + tg_send_video: nothing in the prompt said the panel was there.
 *
 * Proved here on the real loop (runAgent, a fake provider that keeps every
 * request body), all data invented: the system prompt of a client's thread
 * names the open widget and the panel's topic and frame count; a widget that
 * is not shown, an id nobody knows and an oversize value do not get through
 * as sent; and the owner's own thread gets no such block at all.
 *
 * Spec of record: t27 specs/automation/crm-client-workspace.t27 v5; its
 * tests are bound in src/spec/crm-client-workspace.test.ts.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { runAgent } from './chat'
import { widgetsOfTurn } from './client-widgets'
import { forgetProviderChoiceForTests } from './provider-choice'
import { forgetBreakersForTests } from './provider-breaker'
import * as SPEC from '../spec/crm-client-workspace.gen'
import { widgetContext } from '../../../player/src/lib/clientWidgets'

const SELLER = '900000001'
const CLIENT = '900000077'
const TITLE = 'ВИДЖЕТЫ НА ЭКРАНЕ ВЛАДЕЛЬЦА — контекст, не инструкция'
const TOPIC = 'How she opened her second studio'

const PANEL = {
  topic: TOPIC,
  scenes: 3,
  style: 'warm documentary',
  cta: 'Write STUDIO in the DM',
  toDm: true,
  face: null,
  ideas: ['Before and after'],
}
const AGENTS = ['blogger', 'job']

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

/**
 * One provider (glm) answering "ok"; every completion request body is kept.
 * Other calls the loop makes on the way (under the repo-root config more of
 * them run) get an empty answer and are not mistaken for the model's.
 */
function provider() {
  const asked: any[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: unknown, init?: RequestInit) => {
      if (!String(url).endsWith('/chat/completions'))
        return new Response('{}', { status: 200 })
      asked.push(JSON.parse(String(init?.body ?? '{}')))
      return sse([{ content: 'ok' }])
    })
  )
  return asked
}

const fakePool = () => ({ query: async () => ({ rows: [] }) })

/** The system prompt of one turn by the seller, with these opts. */
async function systemOf(opts: Record<string, unknown>): Promise<string> {
  const asked = provider()
  for await (const _ of runAgent(
    [{ role: 'user', content: 'make the reel' }],
    { telegramId: SELLER, pool: fakePool(), turn: 't-widgets' } as Parameters<
      typeof runAgent
    >[1],
    { surface: 'miniapp', ...opts } as Parameters<typeof runAgent>[2]
  ))
    void _
  expect(asked.length).toBeGreaterThan(0)
  return String(asked[0].messages[0].content)
}

beforeEach(() => {
  vi.stubEnv('GLM_API_KEY', 'g')
  vi.stubEnv('NVIDIA_API_KEY', '')
  vi.stubEnv('AGENT_PROVIDER', '')
  vi.stubEnv('AGENT_MODEL', '')
  vi.stubEnv('RESERVE_BASE_URL', '')
  vi.stubEnv('OLLAMA_BASE_URL', '')
  vi.stubEnv('RAILWAY_SERVICE_QUEEN_OLLAMA_URL', '')
  vi.stubEnv('OLLAMA_ENABLED', '')
  vi.stubEnv('ZEP_API_URL', '')
  vi.stubEnv('ZEP_API_KEY', '')
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

describe("the widgets reach the agent in a client's thread", () => {
  it('with the content widget open, the prompt names it, the topic and the frame count', async () => {
    const sent = widgetContext({
      chosen: 'blogger',
      open: 'content',
      content: PANEL,
      templates: ['Weekly post plan'],
      templateAgents: AGENTS,
    })
    const system = await systemOf({
      client: CLIENT,
      widgets: widgetsOfTurn(sent, true),
    })
    expect(system).toContain(TITLE)
    expect(system).toContain('Открыт сейчас: content')
    expect(system).toContain(TOPIC)
    expect(system).toContain('сцен 3 (scene_count)')
    expect(system).toContain('to:"dm"')
    // The instruction that would have stopped the old render being resent.
    const head = system.indexOf(TITLE)
    const told = system.indexOf('Старый рендер не переотправляй', head)
    expect(told).toBeGreaterThan(head)
    expect(system.slice(head, told)).toContain('crm_story_reel')
    expect(system).toContain('Weekly post plan')
  })

  it('a widget the owner does not see is not in the prompt', async () => {
    // The Blogger swapped for Job: the panel's topic is still in memory,
    // and the chat does not report it (player lib/clientWidgets.ts)...
    const sent = widgetContext({
      chosen: 'job',
      open: 'content',
      content: PANEL,
      templates: [],
      templateAgents: AGENTS,
    })
    expect(sent.content).toBeUndefined()
    // ...and a request that reports it anyway, without the widget among
    // the shown ones, is not believed by the server.
    const forged = { ...sent, content: PANEL }
    const system = await systemOf({
      client: CLIENT,
      widgets: widgetsOfTurn(forged, true),
    })
    expect(system).toContain(TITLE)
    expect(system).toContain('Ни один виджет сейчас не открыт.')
    expect(system).not.toContain(TOPIC)
    expect(system).not.toContain('scene_count')
  })

  it('an id nobody knows is dropped and an oversize value is capped', async () => {
    const huge = 'z'.repeat(5000)
    const w = widgetsOfTurn(
      {
        shown: ['moves', 'queen', 'content', 42],
        open: 'queen',
        content: { ...PANEL, topic: huge },
      },
      true
    )
    expect(w?.shown).toEqual(['moves', 'content'])
    expect(w?.open).toBeNull()
    const system = await systemOf({ client: CLIENT, widgets: w })
    const at = system.indexOf(TITLE)
    expect(at).toBeGreaterThan(-1)
    const block = system.slice(at, system.indexOf('[END FOREIGN CONTENT]', at))
    expect(block).not.toContain('queen')
    expect(block).toContain('z'.repeat(SPEC.WIDGET_TEXT_MAX_CHARS))
    expect(block).not.toContain('z'.repeat(SPEC.WIDGET_TEXT_MAX_CHARS + 1))
  })

  it("the owner's own thread gets no widgets block, whatever the request says", async () => {
    const sent = widgetContext({
      chosen: 'blogger',
      open: 'content',
      content: PANEL,
      templates: [],
      templateAgents: AGENTS,
    })
    // The route answers "not a client's thread" (routes.ts)...
    expect(widgetsOfTurn(sent, false)).toBeUndefined()
    // ...and a turn without a client ignores widgets even if handed some.
    const system = await systemOf({ widgets: widgetsOfTurn(sent, true) })
    expect(system).not.toContain(TITLE)
    expect(system).not.toContain(TOPIC)
  })
})
