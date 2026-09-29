import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentTemplates } from './AgentTemplates'

/**
 * THE REPEAT BUTTONS, PINNED (owner, 2026-09-29).
 *
 * The configured templates had to be described from memory every time; the
 * pin here is the contract of the button that ends that: each catalogued
 * agent's thread carries its own (the Blogger its three, the Job agent its
 * two), a press sends the template's own prompt (verbatim, not the label),
 * and an agent with no templates shows none -- no invented buttons for a
 * profession that has none.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string) =>
      ({
        'chat.templates.reel': 'Повторить мой рилс по шаблону',
        'chat.templates.photo': 'Нейро-фото по моему шаблону',
        'chat.templates.gift': 'Снова подарок клиенту',
        'chat.templates.reply': 'Повторить мой отклик по шаблону',
        'chat.templates.recruiters': 'Кто ждёт моего ответа',
      })[key] ?? key,
  }),
}))

import { AGENT_TEMPLATES } from '@/pages/agentSuggestions'

describe("the agent's repeat buttons", () => {
  let host: HTMLDivElement
  let root: Root
  const sent: string[] = []

  beforeEach(() => {
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
    sent.length = 0
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
  })

  const show = async (agentId: string) => {
    await act(async () => {
      root.render(
        <AgentTemplates agentId={agentId} onSend={p => sent.push(p)} />
      )
    })
  }

  it("the Blogger's thread carries every configured template", async () => {
    await show('blogger')
    const buttons = [
      ...host.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="agent-template-"]'
      ),
    ]
    expect(buttons.map(b => b.textContent)).toEqual([
      'Повторить мой рилс по шаблону',
      'Нейро-фото по моему шаблону',
      'Снова подарок клиенту',
    ])
  })

  it('a press sends the template prompt, verbatim, not the label', async () => {
    await show('blogger')
    const reel = host.querySelector<HTMLButtonElement>(
      '[data-testid="agent-template-reel"]'
    )
    await act(async () => reel?.click())
    expect(sent).toEqual([AGENT_TEMPLATES.blogger[0].prompt])
  })

  it('the Job agent carries its reply and recruiter buttons', async () => {
    await show('job')
    const buttons = [
      ...host.querySelectorAll<HTMLButtonElement>(
        '[data-testid^="agent-template-"]'
      ),
    ]
    expect(buttons.map(b => b.textContent)).toEqual([
      'Повторить мой отклик по шаблону',
      'Кто ждёт моего ответа',
    ])
  })

  it('an agent with no templates shows no buttons', async () => {
    await show('not-an-agent')
    expect(host.querySelector('[data-testid="agent-templates"]')).toBeNull()
    expect(host.textContent).toBe('')
  })

  it('a disabled panel refuses the press', async () => {
    await act(async () => {
      root.render(
        <AgentTemplates agentId="blogger" onSend={p => sent.push(p)} disabled />
      )
    })
    const gift = host.querySelector<HTMLButtonElement>(
      '[data-testid="agent-template-gift"]'
    )
    expect(gift?.disabled).toBe(true)
    gift?.click()
    expect(sent).toEqual([])
  })
})
