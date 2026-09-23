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
    ).toHaveLength(3)
    expect(host.textContent).toContain('designed, not active yet')
    expect(
      host.querySelector<HTMLAnchorElement>('a[href="/agents/connect"]')
        ?.textContent
    ).toContain('Connect a harness')
  })
})
