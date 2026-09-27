import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const queued: Array<{ text: string; options: Record<string, unknown> }> = []
vi.mock('@/lib/agentStream', () => ({
  sendOrQueue: (text: string, _a: unknown, options: Record<string, unknown>) =>
    queued.push({ text, options }),
}))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    lang: 'en',
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => new Headers() }))
vi.mock('@/lib/embedGuest', () => ({ markEmbedSignInNeeded: () => {} }))

import { WinbackPanel } from './WinbackPanel'
import { toWinback, type WinbackList } from '@/lib/crm'

/**
 * WIN BACK. The list must carry the server's Russian keys through intact,
 * and "Return" must ask our agent in the client's own thread -- never send
 * anything to the client. Fictional ids only (900000xxx).
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

// The tool's real answer shape (render crm-tools.ts `crm_winback`).
const SERVER = {
  ['порог_дней']: 30, // cyrillic-ok: server keys
  ['найдено']: 2, // cyrillic-ok: server keys
  ['показано']: 2, // cyrillic-ok: server keys
  ['люди']: [
    // cyrillic-ok: server keys
    {
      telegram_id: '900000101',
      ['имя']: 'QuietBuyerOnly', // cyrillic-ok: server keys
      ['ссылка']: 'https://t.me/quietbuyer', // cyrillic-ok: server keys
      ['бот']: 'bot_a', // cyrillic-ok: server keys
      ['молчит_дней']: 64, // cyrillic-ok: server keys
      ['с_нами_дней']: 200, // cyrillic-ok: server keys
    },
    {
      telegram_id: '900000102',
      ['имя']: null, // cyrillic-ok: server keys
      ['ссылка']: null, // cyrillic-ok: server keys
      ['бот']: null, // cyrillic-ok: server keys
      ['молчит_дней']: 31, // cyrillic-ok: server keys
    },
  ],
  ['что_делать']: 'x', // cyrillic-ok: server keys
}

let host: HTMLDivElement
let root: Root
beforeEach(() => {
  queued.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

function Where() {
  // Shows where a navigation landed, so the test can read it.
  return <p data-testid="landed">{useLocation().pathname}</p>
}

const draw = (list: WinbackList) =>
  act(() =>
    root.render(
      <MemoryRouter initialEntries={['/crm']}>
        <Routes>
          <Route path="/crm" element={<WinbackPanel list={list} />} />
          <Route path="/crm/:id/chat" element={<Where />} />
        </Routes>
      </MemoryRouter>
    )
  )

describe('toWinback', () => {
  it('translates the server keys once, at the boundary', () => {
    const w = toWinback(SERVER)
    expect(w.thresholdDays).toBe(30)
    expect(w.found).toBe(2)
    expect(w.shown).toBe(2)
    expect(w.rows[0]).toEqual({
      telegramId: '900000101',
      name: 'QuietBuyerOnly',
      link: 'https://t.me/quietbuyer',
      bot: 'bot_a',
      daysQuiet: 64,
      bought: true,
    })
    expect(w.rows[1].name).toBeNull()
    expect(w.rows[1].link).toBeNull()
  })

  it('an empty or foreign answer is an empty list, not a crash', () => {
    expect(toWinback({})).toEqual({
      thresholdDays: null,
      found: 0,
      shown: 0,
      rows: [],
    })
  })
})

describe('the win-back list', () => {
  it('each former buyer links to their own page with face and quiet days', async () => {
    await draw(toWinback(SERVER))
    const hrefs = [...host.querySelectorAll('a')].map(a =>
      a.getAttribute('href')
    )
    expect(hrefs).toContain('/crm/900000101')
    expect(hrefs).toContain('/crm/900000102')
    expect(hrefs).toContain('https://t.me/quietbuyer')
    expect(host.querySelectorAll('.crm-avatar').length).toBe(2)
    expect(host.textContent).toContain('QuietBuyerOnly')
    expect(host.textContent).toContain('crm.winback.quiet:64')
    expect(host.textContent).toContain('crm.winback.counts:30,2')
  })

  it('nobody gone quiet is said, not left blank', async () => {
    await draw(toWinback({}))
    expect(host.textContent).toContain('crm.winback.none')
  })

  it('Return queues an ask in the client thread, opens it, and sends nothing', async () => {
    const fetched: string[] = []
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_u: unknown, init?: RequestInit) => {
        fetched.push(
          String(JSON.parse(String(init?.body ?? '{}'))?.params?.name)
        )
        return new Response('{}')
      })
    )
    await draw(toWinback(SERVER))
    const btn = host.querySelector<HTMLButtonElement>('.crm__return')!
    expect(btn.textContent).toBe('crm.winback.return')
    await act(async () => {
      btn.click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(queued).toHaveLength(1)
    expect(queued[0].options).toEqual({ client: '900000101' })
    expect(queued[0].text).toBe('crm.winback.returnAsk:QuietBuyerOnly,64')
    expect(host.querySelector('[data-testid="landed"]')?.textContent).toBe(
      '/crm/900000101/chat'
    )
    for (const forbidden of ['tg_send', 'tg_forward', 'crm_send', 'crm_touch'])
      expect(fetched).not.toContain(forbidden)
  })
})
