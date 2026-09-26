import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TrafficPanel } from './TrafficPanel'
import { toTraffic } from '@/lib/crm'

/**
 * WHERE PEOPLE COME FROM (tick 9). Each case is a way the panel could lie:
 * another owner shown our numbers or a refusal, a dead server drawn as a
 * quiet week, bot starts lost, or an older server's answer drawn empty.
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

function answer(respond: (days: number) => Response) {
  const asked: number[] = []
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: unknown, init?: RequestInit) => {
      const days = JSON.parse(String(init?.body)).params.arguments.days
      asked.push(days)
      return respond(days)
    })
  )
  return asked
}
const ok = (content: unknown) =>
  new Response(JSON.stringify({ result: { structuredContent: content } }))

const rows = () =>
  [...host.querySelectorAll('[data-testid="crm-traffic-row"]')].map(
    li => li.textContent
  )

describe('where people come from', () => {
  it('each channel with its visits and bot starts, most first', async () => {
    answer(days =>
      ok({
        days,
        total: 9,
        totalStarts: 4,
        sources: [
          { source: 'x', arrivals: 7, starts: 1 },
          { source: 'telegram', arrivals: 0, starts: 3 },
          { source: 'reddit', arrivals: 2, starts: 0 },
        ],
      })
    )
    await act(async () => root.render(<TrafficPanel />))
    await flush()
    expect(rows()).toEqual([
      'Xvisits: 7 · bot starts: 1 · 14 starts per 100 visits',
      'Telegramvisits: 0 · bot starts: 3',
      'Redditvisits: 2 · bot starts: 0 · 0 starts per 100 visits',
    ])
    expect(host.textContent).toContain('visits 9, bot starts 4')
  })

  it('another owner sees no panel at all: the tool refused', async () => {
    answer(
      () =>
        new Response(
          JSON.stringify({ error: { code: -32000, message: 'owner only' } })
        )
    )
    await act(async () => root.render(<TrafficPanel />))
    await flush()
    expect(host.innerHTML).toBe('')
  })

  it('a server that could not be reached says so, never a row of zeros', async () => {
    answer(() => new Response('', { status: 502 }))
    await act(async () => root.render(<TrafficPanel />))
    await flush()
    expect(host.querySelector('.crm__unreachable')).not.toBeNull()
    expect(rows()).toEqual([])
  })

  it('30 days asks again for 30 days', async () => {
    const asked = answer(days =>
      ok({ days, total: 0, totalStarts: 0, sources: [] })
    )
    await act(async () => root.render(<TrafficPanel />))
    await flush()
    expect(
      host.querySelector('[data-testid="crm-traffic-empty"]')
    ).not.toBeNull()
    const thirty = [...host.querySelectorAll('button')].find(b =>
      b.textContent?.startsWith('30')
    )!
    await act(async () => thirty.click())
    await flush()
    expect(asked).toEqual([7, 30])
    expect(thirty.getAttribute('aria-pressed')).toBe('true')
  })
})

describe("an older server's answer", () => {
  it('channels without sources are summed per source, with no starts', () => {
    expect(
      toTraffic({
        days: 7,
        total: 5,
        channels: [
          { source: 'x', medium: 'social', campaign: 'blog', arrivals: 2 },
          { source: 'x', medium: 'social', campaign: 'reel', arrivals: 1 },
          { source: 'reddit', medium: 'social', campaign: 'blog', arrivals: 2 },
        ],
      }).sources
    ).toEqual([
      { source: 'x', arrivals: 3, starts: 0 },
      { source: 'reddit', arrivals: 2, starts: 0 },
    ])
  })
})
