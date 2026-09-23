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
 * THE CLIENT'S CARD BESIDE THE CONVERSATION.
 *
 * Owner, 2026-09-23: in wide mode the card should be there straight away.
 * What is pinned here is what the card is FOR -- the facts that change an
 * answer -- and the rule the whole CRM screen lives by: a panel that could
 * not load says so instead of rendering zeros.
 *
 * Fictional ids only (9000000xx).
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let context: unknown = {
  name: 'A Client',
  username: 'placeholder_client',
  stage: 'talk',
  balance_tokens: 42,
  waiting_for_reply: 2,
  dialog: [
    { at: '2026-09-22T10:00:00Z', who: 'owner', text: 'наш ответ' }, // cyrillic-ok: a line
    { at: '2026-09-22T11:00:00Z', who: 'person', text: 'а сколько стоит?' }, // cyrillic-ok: their line
  ],
}
let profile: unknown = { telegram_id: '900000301', has_profile: true }
let fail = false

vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const name = String(body?.params?.name ?? '')
    if (fail) return new Response('nope', { status: 500 })
    const data = name === 'crm_lead_context' ? context : profile
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
  fail = false
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function show(client = '900000301') {
  const { ClientAside } = await import('./ClientAside')
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ClientAside client={client} />
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

const text = () => host.textContent ?? ''

describe('the card', () => {
  it('shows who it is, the stage, the balance and that they are waiting', async () => {
    await show()
    expect(text()).toContain('A Client')
    expect(text()).toContain('@placeholder_client')
    expect(text()).toContain('talk')
    expect(text()).toContain('42')
    expect(text()).toContain('crm.aside.waiting.yes')
  })

  it('quotes THEIR last words, not ours', async () => {
    await show()
    expect(text()).toContain('а сколько стоит?') // cyrillic-ok: their line
    expect(text()).not.toContain('наш ответ') // cyrillic-ok: our line
  })

  it('says a package exists when one does', async () => {
    await show()
    expect(text()).toContain('crm.aside.package')
  })

  it('says "unavailable" instead of showing an empty card', async () => {
    fail = true
    await show()
    expect(text()).toContain('crm.client.unreachable')
    expect(text()).not.toContain('crm.aside.waiting.yes')
  })

  it('offers the way to the client screen and to Telegram', async () => {
    await show()
    const hrefs = [...host.querySelectorAll('a')].map(a =>
      a.getAttribute('href')
    )
    expect(hrefs).toContain('/crm/900000301')
    expect(hrefs).toContain('tg://user?id=900000301')
  })
})
