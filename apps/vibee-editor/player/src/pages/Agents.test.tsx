import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/components/Header', () => ({ Header: () => null }))
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
