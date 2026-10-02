import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SocialPanel } from './SocialPanel'
import { toSocial } from '@/lib/crm'

/**
 * THE OWNER'S NETWORKS. Each case is a way the panel could lie: an expired
 * token drawn as connected, a network we know nothing about drawn as fine, a
 * refusal (not the owner) drawn as an error, a link that leaves the app.
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
        <SocialPanel />
      </MemoryRouter>
    )
  )
  await flush()
}

const row = (n: string) =>
  host.querySelector(`[data-testid="crm-social-${n}"]`) as HTMLElement | null

const STATUS = {
  apps: { threads: true, facebook: true, linkedin: false, x: true },
  networks: [
    {
      network: 'facebook',
      account: 'Trinity S³AI',
      instagram: 'trinity_ig',
      daysLeft: 55,
      usable: true,
    },
    { network: 'x', account: 'trinity', daysLeft: 0, usable: false },
  ],
  todo: {},
  connect: 'https://t.me/t27ai_bot?start=app_profile',
}

describe('the social panel', () => {
  it('names each network with its own state, and links to connect', async () => {
    const asked = answer(() => ok(STATUS))
    await draw()
    expect(asked).toEqual(['social_status'])
    expect(row('facebook')?.dataset['state']).toBe('connected')
    expect(row('facebook')?.textContent).toContain('Trinity S³AI')
    expect(row('facebook')?.textContent).toContain('IG trinity_ig')
    expect(row('facebook')?.textContent).toContain('55 days left')
    expect(row('x')?.dataset['state']).toBe('expired')
    expect(row('x')?.textContent).not.toContain('days left')
    expect(row('linkedin')?.dataset['state']).toBe('noApp')
    expect(row('threads')?.dataset['state']).toBe('off')
    const link = host.querySelector('[data-testid="crm-social-connect"]')
    expect(link?.getAttribute('href')).toBe('/profile')
  })

  it('all four connected: no connect link', async () => {
    answer(() =>
      ok({
        apps: {},
        networks: ['threads', 'facebook', 'linkedin', 'x'].map(network => ({
          network,
          usable: true,
        })),
      })
    )
    await draw()
    expect(host.querySelector('[data-testid="crm-social-connect"]')).toBeNull()
  })

  it('a refusal (not the owner) draws nothing at all', async () => {
    answer(
      () =>
        new Response(
          JSON.stringify({ error: { code: -32000, message: 'owner only' } })
        )
    )
    await draw()
    expect(host.textContent).toBe('')
  })

  it('an unreachable server says so instead of drawing "not connected"', async () => {
    answer(() => new Response('boom', { status: 500 }))
    await draw()
    expect(host.querySelector('.crm__unreachable')).toBeTruthy()
    expect(host.querySelector('[data-testid="crm-social"]')).toBeNull()
  })
})

describe('toSocial', () => {
  it('always lists the four networks, in one order', () => {
    expect(toSocial({}).rows.map(r => [r.network, r.state])).toEqual([
      ['threads', 'off'],
      ['facebook', 'off'],
      ['linkedin', 'off'],
      ['x', 'off'],
    ])
  })

  it('a held token that is not usable is expired, never connected', () => {
    const s = toSocial({ networks: [{ network: 'x', usable: 'yes' }] })
    expect(s.rows.find(r => r.network === 'x')?.state).toBe('expired')
  })

  it('keeps only an https connect link', () => {
    expect(toSocial({ connect: 'javascript:alert(1)' }).connect).toBeNull()
    expect(toSocial({ connect: STATUS.connect }).connect).toBe(STATUS.connect)
  })
})
