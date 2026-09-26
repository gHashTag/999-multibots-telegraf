import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * EVERY AGENT HAS ITS OWN DASHBOARD (owner, 2026-09-26). Each case is a way
 * the dashboard could lie: a check drawn when there was none, a trainee's
 * chat offered to somebody who may not open it, or work read from a thread
 * the person has no right to.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const state = vi.hoisted(() => ({
  keeper: true as boolean | null,
  verdicts: null as Record<string, unknown> | null,
}))
vi.mock('@/hooks/useIsKeeper', () => ({ useIsKeeper: () => state.keeper }))
vi.mock('@/hooks/useAgentAcceptance', () => ({
  useAgentAcceptance: () => state.verdicts,
  checkedDay: () => '24 Sep',
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/components/Chat/AgentSkillsPanel', () => ({
  AgentSkillsPanel: ({ agentId }: { agentId: string }) => (
    <p data-testid="skills-of">{agentId}</p>
  ),
}))

import AgentDashboardPage, { recentAnswers } from './AgentDashboard'

let host: HTMLDivElement
let root: Root
const asked: string[] = []
beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  asked.length = 0
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      asked.push(url)
      return new Response(
        JSON.stringify({
          messages: [
            { role: 'user', content: 'check the FIFO' },
            {
              role: 'assistant',
              content: 'The testbench passes; not run here.',
            },
          ],
        })
      )
    })
  )
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function open(id: string) {
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[`/agents/${id}`]}>
        <Routes>
          <Route path="/agents/:agentId" element={<AgentDashboardPage />} />
          <Route path="/agents" element={<p>market</p>} />
        </Routes>
      </MemoryRouter>
    )
  )
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}
const q = (id: string) => host.querySelector(`[data-testid="${id}"]`)

describe("an agent's dashboard", () => {
  it('the RTL engineer: its check, streak, skills, recent work and its chat', async () => {
    state.keeper = true
    state.verdicts = {
      rtl: {
        agent: 'rtl',
        pass: true,
        at: 'x',
        tools: ['web_read'],
        codes: [],
        streak: 3,
      },
    }
    await open('rtl')
    expect(q('agent-dashboard')).not.toBeNull()
    expect(q('agent-dash-check')?.textContent).toMatch(/3/)
    expect(
      host.querySelector('[role="meter"]')?.getAttribute('aria-valuenow')
    ).toBe('3')
    expect(q('skills-of')?.textContent).toBe('rtl')
    expect(q('agent-dash-recent')?.textContent).toContain(
      'The testbench passes'
    )
    expect(asked[0]).toContain('agent=rtl')
    expect(q('agent-dash-open')?.getAttribute('href')).toBe('/agents/rtl/work')
  })

  it('no check yet is said as such, not drawn as a result', async () => {
    state.keeper = true
    state.verdicts = {}
    await open('fpga')
    expect(host.querySelector('[role="meter"]')).toBeNull()
    expect(q('agent-dash-check')?.textContent).not.toMatch(/Passed|Прошёл/) // cyrillic-ok: ru copy
  })

  it('somebody who may not open a trainee gets no chat and no read of its thread', async () => {
    state.keeper = false
    state.verdicts = {}
    await open('scientist')
    expect(q('agent-dash-open')).toBeNull()
    expect(q('agent-dash-recent')).toBeNull()
    expect(asked).toEqual([])
  })

  it('an unknown agent goes back to the market', async () => {
    await open('nobody')
    expect(host.textContent).toBe('market')
  })
})

describe('recent work', () => {
  it('the last answers, newest first, trimmed; questions and empties dropped', () => {
    const turns = [
      { role: 'assistant', content: 'one' },
      { role: 'user', content: 'q' },
      { role: 'assistant', content: '  ' },
      { role: 'assistant', content: 'two' },
      { role: 'assistant', content: 'x'.repeat(400) },
    ]
    const r = recentAnswers(turns)
    expect(r[0].endsWith('…')).toBe(true)
    expect(r[0].length).toBe(220)
    expect(r.slice(1)).toEqual(['two', 'one'])
  })
})
