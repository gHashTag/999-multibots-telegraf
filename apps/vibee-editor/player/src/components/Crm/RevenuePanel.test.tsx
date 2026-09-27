import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RevenuePanel } from './RevenuePanel'
import { toRevenue } from '@/lib/crm'

/**
 * WHAT THE OWNER'S CLIENTS HAVE BROUGHT. Each case is a way the panel could
 * lie: an unknown drawn as zero, a dead server drawn as a quiet month, a
 * refusal drawn as an error, a top client with no way to their card.
 * Fictional ids only (900000xxx).
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/lib/embedGuest', () => ({ markEmbedSignInNeeded: () => {} }))

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
  vi.unstubAllGlobals()
})

const flush = () =>
  act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })

function answer(respond: () => Response) {
  const asked: string[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: unknown, init?: RequestInit) => {
      asked.push(JSON.parse(String(init?.body)).params.name)
      return respond()
    })
  )
  return asked
}
const ok = (content: unknown) =>
  new Response(JSON.stringify({ result: { structuredContent: content } }))

async function draw() {
  await act(async () =>
    root.render(
      <MemoryRouter>
        <RevenuePanel />
      </MemoryRouter>
    )
  )
  await flush()
}

const cell = (id: string) =>
  host.querySelector(`[data-testid="crm-revenue-${id}"]`)?.textContent

describe('the revenue panel', () => {
  it('shows the four numbers and the top clients linking to their cards', async () => {
    const asked = answer(() =>
      ok({
        total: 4500,
        last_30d: 500,
        paying_clients: 2,
        ltv: 2250,
        top: [
          { id: '900000402', name: 'Vera', stars: 3000 },
          { id: '900000403', name: null, stars: 1500 },
        ],
      })
    )
    await draw()
    expect(asked).toEqual(['crm_revenue'])
    expect(cell('total')).toBe('4500')
    expect(cell('last30')).toBe('500')
    expect(cell('paying')).toBe('2')
    expect(cell('ltv')).toBe('2250')
    const links = [
      ...host.querySelectorAll('[data-testid="crm-revenue-top"] a'),
    ] as HTMLAnchorElement[]
    expect(links.map(a => a.textContent)).toEqual(['Vera', '900000403'])
    expect(links.map(a => a.getAttribute('href'))).toEqual([
      '/crm/900000402',
      '/crm/900000403',
    ])
    expect(host.textContent).toContain('3000 ⭐')
  })

  it('an unknown number is a dash, never a zero', async () => {
    answer(() =>
      ok({
        total: null,
        last_30d: null,
        paying_clients: null,
        ltv: null,
        top: [],
      })
    )
    await draw()
    expect(cell('total')).toBe('—')
    expect(cell('ltv')).toBe('—')
    expect(host.textContent).not.toContain('No purchases')
  })

  it('nobody paid yet is said in words', async () => {
    answer(() =>
      ok({ total: 0, last_30d: 0, paying_clients: 0, ltv: null, top: [] })
    )
    await draw()
    expect(cell('total')).toBe('0')
    expect(host.textContent).toContain('No purchases from your clients yet.')
  })

  it('a refusal draws nothing at all', async () => {
    answer(
      () =>
        new Response(
          JSON.stringify({ error: { code: -32000, message: 'not a seller' } })
        )
    )
    await draw()
    expect(host.textContent).toBe('')
  })

  it('an unreachable server says so instead of drawing zeros', async () => {
    answer(() => new Response('boom', { status: 500 }))
    await draw()
    expect(host.querySelector('.crm__unreachable')).toBeTruthy()
    expect(host.querySelector('[data-testid="crm-revenue"]')).toBeNull()
  })
})

describe('toRevenue', () => {
  it('maps the server keys and drops a top row without an id', () => {
    expect(
      toRevenue({
        total: 10,
        last_30d: 'x',
        paying_clients: 1,
        ltv: 10,
        top: [
          { id: '900000404', stars: 10 },
          { name: 'ghost', stars: 5 },
        ],
      })
    ).toEqual({
      total: 10,
      last30: null,
      paying: 1,
      ltv: 10,
      top: [{ telegramId: '900000404', name: null, stars: 10 }],
    })
  })
})
