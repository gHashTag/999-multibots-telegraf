import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))

/**
 * THE CLIENT'S GROUP ON THE CARD (owner, 2026-09-26: "the Farisha group --
 * allowed"). Binding is the owner's memory and sends nothing; the post is a
 * question to the agent, whose answer is a card the owner presses.
 * Fictional ids only (9000000xx).
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const GROUP = {
  chat_id: '-900000072',
  title: 'Farisha project',
  members_count: 4,
}
let bound: unknown = null
let fail = false
const calls: Array<{ name: string; args: Record<string, unknown> }> = []

vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const name = String(body?.params?.name ?? '')
    const args = (body?.params?.arguments ?? {}) as Record<string, unknown>
    calls.push({ name, args })
    if (fail) return new Response('nope', { status: 500 })
    let data: unknown = {}
    if (name === 'crm_client_group') {
      if (args.unbind) bound = null
      else if (args.chat) bound = GROUP
      data = { group: bound }
    } else if (name === 'crm_groups') {
      data = {
        groups: [
          { ...GROUP, kind: 'group', messages: 3 },
          { chat_id: '-900000073', kind: 'channel', title: 'A channel' },
        ],
      }
    }
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { structuredContent: data },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  })
)

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  bound = null
  fail = false
  calls.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

const tick = () =>
  act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })

async function show(onAsk?: (t: string) => void) {
  const { ClientGroup } = await import('./ClientGroup')
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ClientGroup client="900000071" name="Farisha" onAsk={onAsk} />
      </MemoryRouter>
    )
  })
  await tick()
}
const button = (key: string) =>
  [...host.querySelectorAll('button')].find(b => b.textContent === key)!

describe('the client group block', () => {
  it('no group: says so and offers to bind; the picker lists groups, not channels', async () => {
    await show()
    expect(host.textContent).toContain('crm.clientGroup.none')
    await act(async () => button('crm.clientGroup.bind').click())
    await tick()
    const options = [...host.querySelectorAll('option')].map(o => o.value)
    expect(options).toEqual(['', '-900000072'])
  })

  it('picking a group binds it, and nothing is sent', async () => {
    await show()
    await act(async () => button('crm.clientGroup.bind').click())
    await tick()
    const select = host.querySelector('select')!
    await act(async () => {
      select.value = '-900000072'
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await tick()
    expect(host.textContent).toContain('Farisha project')
    expect(calls.map(c => c.name)).not.toContain('tg_send')
    expect(calls.at(-1)).toEqual({
      name: 'crm_client_group',
      args: { client: '900000071', chat: '-900000072' },
    })
  })

  it('a bound group: the post is a question to the agent, and unbind forgets it', async () => {
    bound = GROUP
    const asked: string[] = []
    await show(t => asked.push(t))
    expect(host.textContent).toContain('crm.clientGroup.rule')
    await act(async () => button('crm.clientGroup.post').click())
    expect(asked).toEqual(['crm.clientGroup.askPost:Farisha,Farisha project'])
    await act(async () => button('crm.clientGroup.unbind').click())
    await tick()
    expect(host.textContent).toContain('crm.clientGroup.none')
  })

  it('draws nothing when the tool could not be reached', async () => {
    fail = true
    await show()
    expect(host.querySelector('.chat-aside__group')).toBeNull()
  })
})
