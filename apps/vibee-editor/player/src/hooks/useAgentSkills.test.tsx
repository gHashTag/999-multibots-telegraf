import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  addAgentSkill,
  useAgentSkills,
  type AgentSkillNames,
} from './useAgentSkills'

/**
 * WHAT THE AGENT'S CHAT SAYS IS CONNECTED (owner, 2026-09-24). The same rule
 * as the render's prompt (vibee-atoms agentSkills): the agent's own skills
 * by prefix, then the general ones; nothing drawn when the list is unknown.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))

let seen: AgentSkillNames | null | undefined
function Probe({ id }: { id: string | null }) {
  seen = useAgentSkills(id)
  return null
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  seen = undefined
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const answer = (rows: unknown) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(
      async () =>
        new Response(
          JSON.stringify({
            result: { structuredContent: { ['скиллы']: rows } },
          })
        ) // cyrillic-ok: the tool's own key
    )
  )

async function draw(id: string | null) {
  await act(async () => root.render(<Probe id={id} />))
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

describe("the agent's connected skills", () => {
  it("the job agent carries its own and the general ones, never another agent's", async () => {
    answer([
      { name: 'Работа: рекрутёрам' }, // cyrillic-ok: a skill name
      { name: 'Blogger: hashtags' },
      { name: 'Тон' }, // cyrillic-ok
      { name: 'Leela: draft' },
    ])
    await draw('job')
    expect(seen).toEqual({ own: ['Работа: рекрутёрам'], general: ['Тон'] }) // cyrillic-ok
  })

  it('an unreadable list draws nothing rather than "none"', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 500 }))
    )
    await draw('job')
    expect(seen).toBeNull()
  })

  it('no agent, no question', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await draw(null)
    expect(seen).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})

/**
 * A RULE ADDED IN THE AGENT'S OWN CHAT: the person types the rule, the name
 * that files it under this agent is made for them.
 */
describe("adding a rule in the agent's chat", () => {
  const created = (out: Record<string, unknown>) => {
    const calls: Array<{ name: string; arguments: Record<string, string> }> = []
    const send = vi.fn(async (_u: unknown, init?: RequestInit) => {
      calls.push(JSON.parse(String(init?.body)).params)
      return new Response(
        JSON.stringify({ result: { structuredContent: out } })
      )
    }) as unknown as typeof fetch
    return { calls, send }
  }

  it('sends skills_create with the agent prefix put in, and the rule as it was typed', async () => {
    const { calls, send } = created({ ['создано']: true }) // cyrillic-ok: the tool's own key
    const r = await addAgentSkill(
      'job',
      'ru',
      '  Отвечать коротко: вилка и стек  ',
      send
    ) // cyrillic-ok
    expect(r).toEqual({
      ok: true,
      name: 'Работа: Отвечать коротко вилка и стек',
    }) // cyrillic-ok
    expect(calls[0].name).toBe('skills_create')
    expect(calls[0].arguments.content).toBe('Отвечать коротко: вилка и стек') // cyrillic-ok
  })

  it("the tool's refusal is said, not swallowed", async () => {
    const { send } = created({
      ['создано']: false,
      ['причина']: 'already exists',
    }) // cyrillic-ok: the tool's own keys
    expect(await addAgentSkill('job', 'en', 'reply briefly', send)).toEqual({
      ok: false,
      reason: 'already exists',
    })
  })

  it('an empty rule or a dead network never claims success', async () => {
    const f = vi.fn()
    expect(await addAgentSkill('job', 'en', '   ', f as never)).toEqual({
      ok: false,
      reason: 'empty',
    })
    expect(f).not.toHaveBeenCalled()
    const down = vi.fn(async () => {
      throw new Error('offline')
    }) as unknown as typeof fetch
    expect((await addAgentSkill('job', 'en', 'x', down)).ok).toBe(false)
    const refused = vi.fn(
      async () => new Response('', { status: 401 })
    ) as unknown as typeof fetch
    expect(await addAgentSkill('job', 'en', 'x', refused)).toEqual({
      ok: false,
      reason: 'HTTP 401',
    })
  })
})
