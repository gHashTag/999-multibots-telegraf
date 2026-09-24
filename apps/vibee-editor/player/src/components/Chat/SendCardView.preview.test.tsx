/**
 * THE ONE CARD WHERE HIDING A BROKEN PICTURE IS THE WRONG ANSWER.
 *
 * Everywhere else in this app a picture that will not load is quietly
 * replaced -- by initials, or by nothing. This card is different in kind:
 * the picture IS the thing being approved. An attachment that fails to
 * render and says nothing leaves the owner pressing Send on a message whose
 * contents he cannot see.
 *
 * So it speaks, and carefully: it does not promise the send will work,
 * because a preview failing in this browser says nothing certain about what
 * the server holds. It says the preview did not open and offers the link --
 * the one thing he can act on before deciding.
 */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

vi.mock('@/lib/agentStream', () => ({ answerSendCard: vi.fn() }))
vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    lang: 'ru',
    t: (k: string, v?: Record<string, unknown>) =>
      v ? `${k}:${Object.values(v).join(',')}` : k,
  }),
}))

beforeAll(async () => {
  await import('./SendCardView')
}, 60_000)

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

const card = {
  id: 'c1',
  secret: 's1',
  state: 'waiting' as const,
  to: '900000077',
  what: 'Привет', // cyrillic-ok: fixture copy
  media: { kind: 'photo' as const, url: 'https://example.com/p.jpg' },
}

const show = async () => {
  const { SendCardView } = await import('./SendCardView')
  act(() =>
    root.render(<SendCardView card={card as never} onChange={vi.fn()} />)
  )
  return host
}

describe('a preview that did not open says so', () => {
  it('shows the picture while it is fine, and no warning', async () => {
    const el = await show()
    expect(el.querySelector('img')).toBeTruthy()
    expect(el.querySelector('.send-card__broken')).toBeNull()
  })

  it('on failure: the warning AND a link to the file, not silence', async () => {
    const el = await show()
    const img = el.querySelector('img')!
    act(() => {
      img.dispatchEvent(new Event('error'))
    })
    expect(el.querySelector('img'), 'the dead frame goes').toBeNull()
    const warn = el.querySelector('.send-card__broken')
    expect(warn, 'and it is NOT hidden silently').toBeTruthy()
    const link = warn!.querySelector('a') as HTMLAnchorElement
    expect(link?.href).toBe(card.media.url)
  })

  it('the two presses are still there: the decision is not blocked', async () => {
    // A warning that also removed the buttons would replace one bad state
    // with a worse one -- a card the owner can neither see nor answer.
    const el = await show()
    const img = el.querySelector('img')!
    act(() => {
      img.dispatchEvent(new Event('error'))
    })
    expect(el.querySelectorAll('button').length).toBeGreaterThan(1)
  })
})
