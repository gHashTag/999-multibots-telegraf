import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  listAgentTools: vi.fn(),
}))

const registry = [
  {
    name: 'whoami',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'read', requiresOwnerApproval: false },
  },
  {
    name: 'feed_stats',
    inputSchema: {},
    annotations: { readOnlyHint: true, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'read', requiresOwnerApproval: false },
  },
  {
    name: 'content_plan_prepare',
    inputSchema: {},
    annotations: { readOnlyHint: false, destructiveHint: false },
    _meta: { scope: 'owner', effect: 'draft', requiresOwnerApproval: false },
  },
]

vi.mock('@/lib/agentMcp', () => ({
  listAgentTools: mocks.listAgentTools,
}))

import { AgentConnect } from './AgentConnect'

async function flushUi() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

describe('landing AgentConnect SAFE BETA honesty', () => {
  let host: HTMLDivElement
  let root: Root
  let clipboardDescriptor: PropertyDescriptor | undefined

  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    clipboardDescriptor = Object.getOwnPropertyDescriptor(
      navigator,
      'clipboard'
    )
    host = document.createElement('div')
    document.body.appendChild(host)
    root = createRoot(host)
    mocks.listAgentTools.mockResolvedValue(registry)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    if (clipboardDescriptor)
      Object.defineProperty(navigator, 'clipboard', clipboardDescriptor)
    else Reflect.deleteProperty(navigator, 'clipboard')
    vi.clearAllMocks()
  })

  it('shows only the confirmed three read/draft tools and blocks external onboarding', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AgentConnect />
        </MemoryRouter>
      )
    })
    await flushUi()

    expect(host.textContent).toContain('3 / 3 live tools')
    expect(host.textContent).toContain('whoami')
    expect(host.textContent).toContain('feed_stats')
    expect(host.textContent).toContain('content_plan_prepare')
    expect(host.textContent).toMatch(
      /внешнее MCP-подключение временно закрыто/i
    )
    expect(host.querySelector('a[href="/chat"]')).not.toBeNull()
    expect(host.querySelector('textarea')).toBeNull()
    expect(host.innerHTML).not.toMatch(
      /X-Agent-Key|VITE_AGENT_KEY|feed_publish|curl|config\.toml|TRINITY_MCP_KEY/i
    )
    expect(writeText).not.toHaveBeenCalled()
  })

  it('fails closed when the live registry contains an extra tool', async () => {
    mocks.listAgentTools.mockResolvedValueOnce([
      ...registry,
      { name: 'unsafe_extra', inputSchema: {} },
    ])

    await act(async () => {
      root.render(
        <MemoryRouter>
          <AgentConnect />
        </MemoryRouter>
      )
    })
    await flushUi()

    expect(host.textContent).toContain('0 / 3 live tools')
    expect(host.textContent).toContain('контракт registry не подтверждён')
    expect(host.textContent).not.toContain('unsafe_extra')
  })
})
