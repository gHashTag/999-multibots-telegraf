import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { BotsCard, type BotState } from './BotsCard'

/**
 * THE CARD THAT ANSWERS "IS MY BOT ALIVE".
 *
 * Every case below is a way this card could lie or become furniture: claiming
 * a bot works because Telegram knows its token, hiding the reason a person
 * would have to quote back to us, showing somebody else's bots, or greeting
 * the majority who own none with an empty box.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      ({
        'bots.card.title': 'Мои боты',
        'bots.card.alive': 'отвечает',
        'bots.card.down': 'не отвечает',
        'bots.card.queue': `отвечает, ${vars?.n} сообщений ждут разбора`,
      })[key] ?? key,
  }),
}))

vi.mock('@/lib/apiFetch', () => ({ authHeaders: () => ({}) }))

const bot = (over: Partial<BotState>): BotState => ({
  bot: 'NeuroLenaAssistant_bot',
  alive: true,
  why: null,
  pendingUpdates: 0,
  ...over,
})

describe('the my-bots card', () => {
  let host: HTMLDivElement
  let root: Root

  beforeEach(() => {
    Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })
    host = document.createElement('div')
    document.body.append(host)
    root = createRoot(host)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    host.remove()
    vi.unstubAllGlobals()
  })

  const show = async (props: Parameters<typeof BotsCard>[0]) =>
    act(async () => root.render(<BotsCard {...props} />))

  it('says a bot answers, and names it', async () => {
    await show({ isOwn: true, bots: [bot({})] })
    expect(host.textContent).toContain('@NeuroLenaAssistant_bot')
    expect(host.textContent).toContain('отвечает')
  })

  it('shows the reason whole when it does not answer', async () => {
    // She has to be able to quote this back to us; a truncated reason is a
    // reason nobody can act on.
    await show({
      isOwn: true,
      bots: [bot({ alive: false, why: 'Not Found', pendingUpdates: null })],
    })
    expect(host.textContent).toContain('не отвечает')
    expect(host.textContent).toContain('Not Found')
    expect(host.querySelector('[data-alive="0"]')?.className).toContain(
      'profile-bots__item--down'
    )
  })

  it('does not call a growing queue "answering" and leave it there', async () => {
    // Alive at Telegram with nobody collecting is the second failure shape,
    // and the whole point of showing the number instead of hiding it.
    await show({ isOwn: true, bots: [bot({ pendingUpdates: 412 })] })
    expect(host.textContent).toContain('412 сообщений ждут разбора')
  })

  it('treats a small queue as ordinary, because it is', async () => {
    await show({ isOwn: true, bots: [bot({ pendingUpdates: 3 })] })
    expect(host.textContent).toContain('отвечает')
    expect(host.textContent).not.toContain('ждут разбора')
  })

  it('renders nothing on somebody else’s profile', async () => {
    // The endpoint answers by the caller's identity, so on a stranger's page
    // this would show the VIEWER's bots under another person's name.
    await show({ isOwn: false, bots: [bot({})] })
    expect(host.textContent).toBe('')
  })

  it('renders nothing for the majority, who own no bot', async () => {
    await show({ isOwn: true, bots: [] })
    expect(host.textContent).toBe('')
  })

  it('stays silent when we could not ask, instead of claiming a failure', async () => {
    // A network error means WE could not ask. Printing "your bot is down" on
    // that basis is the same lie the watchman refuses to tell.
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline')
      })
    )
    await show({ isOwn: true })
    expect(host.textContent).toBe('')
  })

  it('asks the server when nothing was handed to it', async () => {
    const fetchMock = vi.fn(async (_url: string) => ({
      ok: true,
      json: async () => ({ bots: [bot({ bot: 'from_server' })] }),
    }))
    vi.stubGlobal('fetch', fetchMock)
    await show({ isOwn: true })
    expect(String(fetchMock.mock.calls[0]?.[0])).toContain('/api/my-bots')
    expect(host.textContent).toContain('@from_server')
  })
})
