import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentSkillsPanel } from './AgentSkillsPanel'

/**
 * EVERY AGENT SAYS WHAT IT CARRIES (owner, 2026-09-24: "in every agent the
 * skills are connected"). Each case is a way the panel could mislead: an
 * agent that looks skill-less because the person has no rules yet, a hint
 * with a literal placeholder, or a rule that says "connected" when it was
 * not saved.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const flush = () =>
  act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })

/** A server with the person's skills in memory; skills_create adds one. */
function server(rows: Array<{ name: string }>, created = true) {
  const tools: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: unknown, init?: RequestInit) => {
      const p = JSON.parse(String(init?.body)).params
      tools.push(p.name)
      if (p.name === 'skills_create') {
        if (created) rows.push({ name: p.arguments.name })
        return new Response(
          JSON.stringify({
            result: {
              structuredContent: created
                ? { ['создано']: true }
                : { ['создано']: false, ['причина']: 'already exists' },
            },
          }) // cyrillic-ok: the tool's own keys
        )
      }
      return new Response(
        JSON.stringify({
          result: { structuredContent: { ['скиллы']: [...rows] } },
        }) // cyrillic-ok: the tool's own key
      )
    })
  )
  return tools
}

const text = (id: string) =>
  host.querySelector(`[data-testid="${id}"]`)?.textContent ?? ''

async function type(value: string) {
  const input = host.querySelector(
    '[data-testid="agent-skills-input"]'
  ) as HTMLInputElement
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )!.set!
  await act(async () => {
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('the agent skills panel', () => {
  it('an agent with no rules of the person still says what it knows how to do', async () => {
    server([])
    await act(async () => root.render(<AgentSkillsPanel agentId="job" />))
    await flush()
    expect(text('agent-skills-builtin')).toMatch(/\S+ · \S+/)
    expect(text('agent-skills')).toContain('"Job: ..."')
    expect(host.textContent).not.toContain('<agent>')
    expect(host.textContent).not.toMatch(/\{\w+\}/)
  })

  it('a rule typed here is saved under this agent and then listed as connected', async () => {
    const tools = server([])
    await act(async () => root.render(<AgentSkillsPanel agentId="job" />))
    await flush()
    await type('answer briefly, with numbers')
    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()
    await flush()
    expect(tools).toEqual(['skills_list', 'skills_create', 'skills_list'])
    expect(text('agent-skills-result')).toContain(
      'Job: answer briefly, with numbers'
    )
    expect(text('agent-skills')).toContain('Job: answer briefly, with numbers')
  })

  it('a refused rule says why and never claims it is connected', async () => {
    server([], false)
    await act(async () => root.render(<AgentSkillsPanel agentId="job" />))
    await flush()
    await type('answer briefly')
    await act(async () => {
      host
        .querySelector('form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await flush()
    expect(text('agent-skills-result')).toContain('already exists')
    expect(text('agent-skills-result')).not.toContain('Connected')
  })

  it('an unknown agent draws nothing', async () => {
    server([])
    await act(async () => root.render(<AgentSkillsPanel agentId="nobody" />))
    expect(host.innerHTML).toBe('')
  })
})
