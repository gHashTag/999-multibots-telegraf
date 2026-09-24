import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/Header', () => ({ Header: () => null }))
/* Keeper or not is the server's answer (#2957); the test sets it. */
let keeperAnswer: boolean | null = false
vi.mock('@/hooks/useIsKeeper', () => ({ useIsKeeper: () => keeperAnswer }))
/* The last acceptance verdicts come from the server; the test sets them. */
let verdictsAnswer: Record<string, unknown> | null = null
vi.mock('@/hooks/useAgentAcceptance', async importOriginal => ({
  ...(await importOriginal<typeof import('@/hooks/useAgentAcceptance')>()),
  useAgentAcceptance: () => verdictsAnswer,
}))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ lang: 'en', t: (key: string) => key }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

import { AgentsPage } from './Agents'
import { MARKETPLACE_AGENTS } from '../../../packages/vibee-atoms/src/agent-marketplace'

/**
 * How many listings are still training, read from the catalogue itself: the
 * count used to be written here as 3, and adding the job agent (#2940) broke
 * the player's image build on a number, not on behaviour.
 */
const TRAINING = MARKETPLACE_AGENTS.filter(a => a.status === 'training').length

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  keeperAnswer = false
  verdictsAnswer = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

describe('agent labour market', () => {
  it('shows Blogger as hireable and trainees as unavailable', () => {
    act(() =>
      root.render(
        <MemoryRouter>
          <AgentsPage />
        </MemoryRouter>
      )
    )
    expect(
      host.querySelector<HTMLAnchorElement>('a[href="/agents/blogger/work"]')
        ?.textContent
    ).toContain('Hire this agent')
    expect(
      [...host.querySelectorAll('.agent-card__cta--disabled')].filter(node =>
        node.textContent?.includes('Training — join later')
      )
    ).toHaveLength(TRAINING)
    expect(TRAINING).toBeGreaterThan(0)
    expect(host.textContent).toContain('designed, not active yet')
    expect(
      host.querySelector<HTMLAnchorElement>('a[href="/agents/connect"]')
        ?.textContent
    ).toContain('Connect a harness')
  })
})

describe('owner preview (#2957)', () => {
  const trainees = MARKETPLACE_AGENTS.filter(a => a.status !== 'live')
  const draw = () =>
    act(() =>
      root.render(
        <MemoryRouter>
          <AgentsPage />
        </MemoryRouter>
      )
    )

  it('a keeper gets a way into every trainee, and no disabled card', () => {
    keeperAnswer = true
    draw()
    for (const a of trainees) {
      const link = host.querySelector<HTMLAnchorElement>(
        `a.agent-card__cta--preview[href="/agents/${a.id}/work"]`
      )
      expect(link?.textContent, a.id).toContain('Owner preview')
    }
    expect(host.querySelectorAll('.agent-card__cta--disabled')).toHaveLength(0)
  })

  it('anybody else, or an unknown answer, gets no preview link', () => {
    for (const answer of [false, null]) {
      keeperAnswer = answer
      draw()
      expect(host.querySelectorAll('.agent-card__cta--preview')).toHaveLength(0)
    }
  })
})

describe('what was measured, next to what is promised', () => {
  const draw = () =>
    act(() =>
      root.render(
        <MemoryRouter>
          <AgentsPage />
        </MemoryRouter>
      )
    )

  it('shows the last verdict and its day, a failure as plainly as a pass', () => {
    verdictsAnswer = {
      blogger: {
        agent: 'blogger',
        pass: true,
        at: '2026-09-24T07:14:00Z',
        tools: [],
        codes: [],
      },
      job: {
        agent: 'job',
        pass: false,
        at: '2026-09-24T07:15:00Z',
        tools: [],
        codes: ['no_answer'],
      },
    }
    draw()
    const lines = [...host.querySelectorAll('.agent-card__checked')]
    expect(lines).toHaveLength(2)
    const pass = lines.find(n => n.getAttribute('data-pass') === 'yes')
    const fail = lines.find(n => n.getAttribute('data-pass') === 'no')
    expect(pass?.textContent).toContain('Checked on a real account')
    expect(pass?.textContent).toContain('24 Sep')
    expect(fail?.textContent).toContain('Last check failed')
  })

  it('no answer from the server draws no line, never "unchecked"', () => {
    verdictsAnswer = null
    draw()
    expect(host.querySelectorAll('.agent-card__checked')).toHaveLength(0)
  })
})
