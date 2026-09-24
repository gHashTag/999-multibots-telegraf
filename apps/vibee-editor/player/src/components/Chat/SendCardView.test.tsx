import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SendCard } from '@/atoms/agentChat'

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => ({}) }))
vi.mock('@/config', async importOriginal => ({
  ...(await importOriginal<Record<string, unknown>>()),
  API_BASE: '',
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

/**
 * A MESSAGE FOR A CLIENT, APPROVED IN THE CHAT THAT PREPARED IT.
 *
 * Owner, 2026-09-24: Farisha's portrait was ready and the only way to send
 * it was the bot. Pinned: the stream's proposal becomes a card (a malformed
 * one does not), the card shows the picture and the recipient, the press
 * goes to the bot's own confirm door with the card's id AND secret, a
 * refusal is shown, and an expired card offers no send button.
 */
let posted: Array<{ url: string; body: unknown }> = []
let answer = { status: 200, body: { ok: true } as Record<string, unknown> }
vi.stubGlobal(
  'fetch',
  vi.fn(async (url: string, init?: RequestInit) => {
    posted.push({ url, body: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify(answer.body), { status: answer.status })
  })
)

import { toSendCard } from '@/lib/agentStream'
import { SendCardView } from './SendCardView'

const card = (over: Partial<SendCard> = {}): SendCard => ({
  ...toSendCard({
    id: 'p1',
    secret: 's3cr3t',
    action: 'send-photo',
    target: '900000031',
    display: 'Farisha',
    what: 'A portrait for you',
    media: { kind: 'photo', url: 'https://example.test/p.jpg' },
    expiresAt: Date.now() + 3600_000,
  })!,
  ...over,
})

let host: HTMLDivElement
let root: Root
let last: SendCard | null = null
beforeEach(() => {
  posted = []
  answer = { status: 200, body: { ok: true } }
  last = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function show(c: SendCard) {
  const render = (x: SendCard) =>
    root.render(
      <SendCardView
        card={x}
        onChange={n => {
          last = n
          render(n)
        }}
      />
    )
  act(() => render(c))
}

describe('toSendCard', () => {
  it('turns the stream proposal into a card, and drops one without a secret', () => {
    expect(card()).toMatchObject({
      id: 'p1',
      secret: 's3cr3t',
      display: 'Farisha',
      media: { kind: 'photo' },
      state: 'waiting',
    })
    expect(toSendCard({ id: 'p1' })).toBeNull()
    expect(toSendCard(null)).toBeNull()
  })
})

describe('SendCardView', () => {
  it('shows the picture, the words and whom it goes to', () => {
    show(card())
    expect(host.querySelector('img')?.getAttribute('src')).toContain('p.jpg')
    expect(host.textContent).toContain('A portrait for you')
    expect(host.textContent).toContain('Farisha')
  })

  it('Send posts id and secret to the confirm door, then says sent', async () => {
    show(card())
    const send = host.querySelector('.send-card__send') as HTMLButtonElement
    await act(async () => send.click())
    expect(posted).toEqual([
      { url: '/api/tg/proposal/confirm', body: { id: 'p1', secret: 's3cr3t' } },
    ])
    expect(last?.state).toBe('sent')
    expect(host.textContent).toContain('sendCard.sent')
  })

  it('Don’t send goes to the cancel door', async () => {
    show(card())
    const cancel = host.querySelector('.send-card__cancel') as HTMLButtonElement
    await act(async () => cancel.click())
    expect(posted[0].url).toBe('/api/tg/proposal/cancel')
    expect(last?.state).toBe('cancelled')
  })

  it('a refusal (the card was answered in the bot) is shown, not hidden', async () => {
    answer = { status: 409, body: { ok: false, error: 'already answered' } }
    show(card())
    await act(async () =>
      (host.querySelector('.send-card__send') as HTMLButtonElement).click()
    )
    expect(last?.state).toBe('failed')
    expect(host.textContent).toContain('already answered')
  })

  it('an expired card has no send button', () => {
    show(card({ expiresAt: Date.now() - 1000 }))
    expect(host.querySelector('.send-card__send')).toBeNull()
    expect(host.textContent).toContain('sendCard.expired')
  })
})
