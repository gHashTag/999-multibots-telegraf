import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))

/**
 * THE MAP TAB: faces by sphere, the owner in the centre, and a tap on a face
 * opening every action for that person. Nothing here writes to anybody; the
 * only switch is AUTO, the same one the card has.
 *
 * Fictional ids only (9000000xx).
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const MAP = {
  nodes: [
    {
      id: '900000401',
      name: 'Ann Content',
      username: 'ann_c',
      avatar_url: null,
      sphere: 'content',
      talk: 12,
    },
    {
      id: '900000402',
      name: 'Bob Tech',
      username: null,
      avatar_url: null,
      sphere: 'tech',
      talk: 3,
    },
    {
      id: '900000403',
      name: 'Cid Other',
      username: null,
      avatar_url: null,
      sphere: 'other',
      talk: 1,
    },
  ],
  edges: [{ a: '900000401', b: '900000402', shared: 1 }],
}
let mapData: unknown = MAP
let fail = false
let lastPick: { lead: unknown; on: unknown } | null = null

vi.stubGlobal(
  'fetch',
  vi.fn(async (_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body ?? '{}'))
    const name = String(body?.params?.name ?? '')
    const args = (body?.params?.arguments ?? {}) as Record<string, unknown>
    if (fail) return new Response('nope', { status: 500 })
    const data =
      name === 'crm_map'
        ? mapData
        : name === 'autopilot_leads'
          ? { leads: ['900000402'] }
          : name === 'autopilot_lead'
            ? (lastPick = { lead: args.lead, on: args.on })
            : {}
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
  mapData = MAP
  fail = false
  lastPick = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function show() {
  const { CrmMap } = await import('./CrmMap')
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/crm?tab=map']}>
        <Routes>
          <Route path="/crm" element={<CrmMap />} />
          <Route path="/crm/:id/chat" element={<p>chat page</p>} />
        </Routes>
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}
const face = (label: string) =>
  host.querySelector<SVGGElement>(`g[aria-label="${label}"]`)!
const tap = async (el: Element) =>
  act(async () => {
    el.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    await new Promise(r => setTimeout(r, 0))
  })
const button = (label: string) =>
  [...host.querySelectorAll('button')].find(b =>
    b.textContent?.startsWith(label)
  )!

describe('the map', () => {
  it('draws every person, a chip per sphere and a line per link', async () => {
    await show()
    expect(host.querySelectorAll('g.crm-map__node')).toHaveLength(3)
    expect(host.textContent).toContain('crm.map.sphere.content · 1')
    expect(host.querySelectorAll('line.crm-map__edge')).toHaveLength(1)
    expect(host.querySelector('g.crm-map__owner')).not.toBeNull()
  })

  it('a tap opens the menu with every action for that person', async () => {
    await show()
    await tap(face('Ann Content'))
    const menu = host.querySelector('.crm-map__menu')!
    expect(menu.textContent).toContain('Ann Content')
    expect(menu.textContent).toContain('crm.map.action.chat')
    expect(menu.textContent).toContain('crm.map.action.card')
    expect(menu.textContent).toContain('crm.map.action.links:1')
    expect(menu.querySelector('a')?.getAttribute('href')).toBe(
      'https://t.me/ann_c'
    )
  })

  it('Chat with the agent opens that client conversation', async () => {
    await show()
    await tap(face('Ann Content'))
    await tap(button('crm.map.action.chat'))
    expect(host.textContent).toContain('chat page')
  })

  it('AUTO in the menu is the same switch as on the card', async () => {
    await show()
    await tap(face('Bob Tech'))
    await tap(button('crm.map.action.autoOff'))
    expect(lastPick).toEqual({ lead: '900000402', on: false })
    expect(button('crm.map.action.autoOn')).toBeTruthy()
  })

  it('a sphere chip dims everybody outside it', async () => {
    await show()
    await tap(button('crm.map.sphere.tech'))
    expect(face('Bob Tech').getAttribute('opacity')).toBe('1')
    expect(face('Ann Content').getAttribute('opacity')).not.toBe('1')
  })

  it('says so when there is nobody yet, and when it could not load', async () => {
    mapData = { nodes: [], edges: [] }
    await show()
    expect(host.textContent).toContain('crm.map.empty')
    act(() => root.unmount())
    root = createRoot(host)
    fail = true
    await show()
    expect(host.textContent).toContain('crm.map.failed')
  })
})
