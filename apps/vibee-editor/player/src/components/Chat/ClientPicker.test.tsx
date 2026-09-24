import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({ t: (key: string) => key }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

/**
 * EVERY CLIENT, NOT ONLY THE TWELVE IN THE ROW.
 *
 * Pinned: the picker asks for the long list (not the rail's twelve), finds
 * a person by name, @username or id, filters paid vs not yet, shows faces,
 * and a press opens THAT person's conversation.
 */
const rows = Array.from({ length: 30 }, (_, i) => ({
  telegram_id: String(900000001 + i),
  name: i === 25 ? 'Farisha' : `Person ${i}`,
  username: i === 25 ? 'farishka' : null,
  stage: i % 3 === 0 ? 'client' : 'talking',
  paid: i % 3 === 0,
  last_seen: `2026-09-${String(1 + (i % 20)).padStart(2, '0')}T10:00:00Z`,
  avatar_url: i === 25 ? 'https://example.test/f.jpg' : null,
}))
let askedLimit: unknown = null
vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    askedLimit = body?.params?.arguments?.limit
    return new Response(
      JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        result: { structuredContent: { clients: rows, paid_known: true } },
      }),
      { status: 200, headers: { 'content-type': 'application/json' } }
    )
  })
)

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

async function show() {
  const { ClientPicker } = await import('./ClientPicker')
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/chat']}>
        <Routes>
          <Route path="/chat" element={<ClientPicker onClose={() => {}} />} />
          <Route path="/crm/:id/chat" element={<p id="opened">opened</p>} />
        </Routes>
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}
const type = async (value: string) => {
  const input = host.querySelector('input') as HTMLInputElement
  const set = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    'value'
  )!.set!
  await act(async () => {
    set.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('ClientPicker', () => {
  it('lists everybody the server has, not only twelve', async () => {
    await show()
    expect(askedLimit).toBe(200)
    expect(host.querySelectorAll('.client-picker__row')).toHaveLength(30)
  })

  it('finds a person by @username and shows their face', async () => {
    await show()
    await type('farish')
    const found = host.querySelectorAll('.client-picker__row')
    expect(found).toHaveLength(1)
    expect(found[0].textContent).toContain('Farisha')
    expect(found[0].querySelector('img')?.getAttribute('src')).toBe(
      'https://example.test/f.jpg'
    )
  })

  it('filters to those who paid', async () => {
    await show()
    const paid = [...host.querySelectorAll('.client-picker__filters button')][1]
    await act(async () => (paid as HTMLButtonElement).click())
    expect(host.querySelectorAll('.client-picker__row')).toHaveLength(10)
  })

  it('a press opens that person’s conversation', async () => {
    await show()
    await type('900000026')
    await act(async () =>
      (host.querySelector('.client-picker__row') as HTMLButtonElement).click()
    )
    expect(host.querySelector('#opened')).not.toBeNull()
  })
})
