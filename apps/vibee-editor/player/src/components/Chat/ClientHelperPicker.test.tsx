import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MARKETPLACE_AGENTS } from '../../../../packages/vibee-atoms/src/agent-marketplace'
import { agentMessagesAtomFor } from '@/atoms/agentChat'

/**
 * A SPECIALIST IN A CLIENT'S CONVERSATION (owner, 2026-09-26). Each case is a
 * way it could go wrong: a client offered a trainee nobody vetted, the
 * choice not reaching the message, or the answer landing in the agent's own
 * thread instead of the client's.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const keeper = vi.hoisted(() => ({ value: true as boolean | null }))
vi.mock('@/hooks/useIsKeeper', () => ({ useIsKeeper: () => keeper.value }))
vi.mock('@/hooks/useAgentAcceptance', () => ({
  useAgentAcceptance: () => null,
}))

import { ClientHelperPicker, helpersFor } from './ClientHelperPicker'

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

describe('who may be called in', () => {
  it('a keeper may call any agent, the scientist and both engineers included', () => {
    const ids = helpersFor(MARKETPLACE_AGENTS, true, null).map(a => a.id)
    expect(ids).toEqual(MARKETPLACE_AGENTS.map(a => a.id))
    for (const id of ['scientist', 'fpga', 'rtl']) expect(ids).toContain(id)
  })

  it('anybody else: live agents, and a trainee only once it earned the market', () => {
    const live = MARKETPLACE_AGENTS.filter(a => a.status === 'live').map(
      a => a.id
    )
    expect(helpersFor(MARKETPLACE_AGENTS, false, null).map(a => a.id)).toEqual(
      live
    )
    expect(
      helpersFor(MARKETPLACE_AGENTS, false, { rtl: { earned: true } }).map(
        a => a.id
      )
    ).toEqual([...live, 'rtl'])
  })
})

describe('the picker', () => {
  it('offers "Assistant" and the agents, and says which one is chosen', async () => {
    keeper.value = true
    const picked: Array<string | null> = []
    await act(async () =>
      root.render(
        <ClientHelperPicker value="fpga" onChange={id => picked.push(id)} />
      )
    )
    const chips = [...host.querySelectorAll('button')]
    expect(chips).toHaveLength(MARKETPLACE_AGENTS.length + 1)
    expect(
      host
        .querySelector('[data-testid="client-helper-fpga"]')
        ?.getAttribute('aria-pressed')
    ).toBe('true')
    await act(async () =>
      (
        host.querySelector(
          '[data-testid="client-helper-scientist"]'
        ) as HTMLButtonElement
      ).click()
    )
    await act(async () =>
      (
        host.querySelector(
          '[data-testid="client-helper-none"]'
        ) as HTMLButtonElement
      ).click()
    )
    expect(picked).toEqual(['scientist', null])
  })
})

describe('where the answer goes', () => {
  it("a specialist's answer about a client lands in the client's thread", () => {
    expect(agentMessagesAtomFor('12345', 'rtl')).toBe(
      agentMessagesAtomFor('12345')
    )
    expect(agentMessagesAtomFor(null, 'rtl')).not.toBe(
      agentMessagesAtomFor('12345')
    )
  })
})

describe('the chat page wires it', () => {
  it('a client line carries the chosen specialist; an agent chat names its own agent', async () => {
    const { readFileSync } = await import('node:fs')
    const { join } = await import('node:path')
    const src = readFileSync(
      join(__dirname, '..', '..', 'pages', 'Chat.tsx'),
      'utf8'
    )
    expect(src).toContain('agent: client ? helper : marketplaceAgent')
    expect(src).toMatch(/<ClientHelperPicker value=\{helper\}/)
    /* The header that said "Блогер" in every agent's chat is gone. */
    expect(src).not.toContain("'Блогер · работает'") // cyrillic-ok: the removed literal
  })
})
