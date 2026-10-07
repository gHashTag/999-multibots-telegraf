import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AgentAside } from './AgentAside'

/**
 * THE AGENT'S OWN PANEL, PINNED (owner, 2026-09-29: "each agent has its own
 * dashboard for working with clients").
 *
 * A client's thread had its card beside the conversation; an agent's thread
 * had nothing, and the configured templates with it. What is pinned here is
 * the panel's contract: it names the agent, a template press asks in THIS
 * conversation, its clients link into their threads with this agent as the
 * helper, and the full dashboard is one door away.
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    lang: 'ru',
    t: (key: string, params?: Record<string, string | number>) =>
      String(key)
        .replace('chat.templates.reel', 'Повторить мой рилс по шаблону')
        .replace('chat.templates.photo', 'Нейро-фото по моему шаблону')
        .replace('chat.templates.gift', 'Снова подарок клиенту')
        .replace('chat.agentAside.label', 'Панель агента')
        .replace('chat.agentAside.clients', 'Клиенты этого агента')
        .replace(
          'chat.agentAside.noClients',
          'Через этого агента с клиентами ещё не работали'
        )
        .replace('chat.agentAside.dash', 'Полный дашборд')
        .replace('crm.aside.close', 'Закрыть карточку')
        .replace(
          'agents.dash.clientRow',
          `Клиент ${params?.id} · ходов: ${params?.n}`
        ),
  }),
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))

import { AGENT_TEMPLATES } from '@/pages/agentSuggestions'

let host: HTMLDivElement
let root: Root
let clients: unknown[] | null

beforeEach(() => {
  host = document.createElement('div')
  document.body.append(host)
  root = createRoot(host)
  clients = null
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      if (String(url).endsWith('/mcp'))
        return new Response(
          JSON.stringify({
            result: { structuredContent: { clients } },
          })
        )
      return new Response('{}')
    })
  )
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

const show = async (agentId = 'blogger') => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <AgentAside
          agentId={agentId}
          onAsk={() => {}}
          open={false}
          onClose={() => {}}
        />
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

describe("the agent's own panel beside its conversation", () => {
  it('names the agent and carries its repeat buttons', async () => {
    await show()
    expect(host.querySelector('[data-testid="agent-aside"]')).not.toBeNull()
    expect(host.textContent).toContain('Блогер')
    expect(host.textContent).toContain('Повторить мой рилс по шаблону')
  })

  it('a template press asks in this conversation, not somewhere else', async () => {
    const asked: string[] = []
    await act(async () => {
      root.render(
        <MemoryRouter>
          <AgentAside
            agentId="blogger"
            onAsk={p => asked.push(p)}
            open={false}
            onClose={() => {}}
          />
        </MemoryRouter>
      )
    })
    await act(async () => {
      host
        .querySelector<HTMLButtonElement>('[data-testid="agent-template-gift"]')
        ?.click()
    })
    expect(asked).toEqual([AGENT_TEMPLATES.blogger[2].prompt])
  })

  it('its clients link into their threads with this agent as the helper', async () => {
    clients = [{ client: '435572800', turns: 5, lastAt: 'x' }]
    await show()
    const link = host.querySelector<HTMLAnchorElement>(
      '[data-testid="agent-aside-client"]'
    )
    expect(link?.getAttribute('href')).toBe(
      '/crm/435572800/chat?helper=blogger'
    )
    expect(link?.textContent).toContain('435572800')
  })

  it('no client work yet says so instead of an empty list', async () => {
    clients = []
    await show()
    expect(host.querySelector('[data-testid="agent-aside-client"]')).toBeNull()
    expect(host.textContent).toContain(
      'Через этого агента с клиентами ещё не работали'
    )
  })

  it('the full dashboard is one door away', async () => {
    await show()
    const door = host.querySelector<HTMLAnchorElement>(
      '[data-testid="agent-aside-dash"]'
    )
    expect(door?.getAttribute('href')).toBe('/agents/blogger')
  })

  it('an unknown agent has no panel', async () => {
    await show('nobody')
    expect(host.querySelector('[data-testid="agent-aside"]')).toBeNull()
  })
})
