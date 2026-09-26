import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/* Keeper or not, and which trainees earned the market: the test sets them. */
let keeperAnswer: boolean | null = false
let verdictsAnswer: Record<string, { earned?: boolean }> | null = null
vi.mock('@/hooks/useIsKeeper', () => ({ useIsKeeper: () => keeperAnswer }))
vi.mock('@/hooks/useAgentAcceptance', () => ({
  useAgentAcceptance: () => verdictsAnswer,
}))

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    lang: 'ru',
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))

/**
 * THE ROW OF CIRCLES.
 *
 * Owner, 2026-09-23, two sentences: the connected agents should be visible in
 * the chat with a conversation of their own, and people should be circles with
 * their avatar and their name underneath.
 *
 * What is pinned: a specialist has a seat and it leads to ITS thread; a person
 * with a stored picture shows it; a person without one shows initials and not
 * a grey hole; and the caption is always there, because a circle with no name
 * is a guessing game.
 *
 * Fictional ids only (9000000xx).
 */
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

const clients = [
  {
    telegram_id: '900000401',
    name: 'Anna Petrova',
    username: 'placeholder_anna',
    stage: 'client',
    paid: true,
    has_profile: false,
    has_soul: false,
    duets: 0,
    last_seen: new Date().toISOString(),
    avatar_url: 'https://example.invalid/a.jpg',
  },
  {
    telegram_id: '900000402',
    name: 'Boris',
    username: null,
    stage: 'new',
    paid: false,
    has_profile: false,
    has_soul: false,
    duets: 0,
    last_seen: new Date(Date.now() - 1000).toISOString(),
    avatar_url: null,
  },
]

vi.stubGlobal(
  'fetch',
  vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          result: { structuredContent: { clients, paid_known: true } },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
  )
)

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  keeperAnswer = false
  verdictsAnswer = null
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

async function rail(current: string | null = null) {
  const { ChatThreads } = await import('./ChatThreads')
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ChatThreads current={current} />
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

const dots = () => [...host.querySelectorAll('.chat-threads__dot')]
const hrefs = () => dots().map(d => d.getAttribute('href'))

describe('the rail', () => {
  it('seats every agent, and a live one leads to its own thread', async () => {
    await rail()
    expect(hrefs()).toContain('/agents/blogger/work')
    // Still in training: the circle is there and leads to its card, because
    // a thread with no harness behind it would be a promise the product does
    // not keep -- and hiding it would answer the question with silence.
    const habr = dots().find(
      d =>
        d.textContent?.includes('Scientist') ||
        d.textContent?.includes('Учёный') // cyrillic-ok: the agent's ru name
    )
    expect(habr, 'the Scientist has no seat').toBeTruthy()
    expect(habr?.getAttribute('data-status')).toBe('training')
    expect(habr?.getAttribute('href')).toBe('/agents')
    // And it says who they are, in the interface language.
    expect(host.textContent).toContain('Блогер') // cyrillic-ok: the agent's name
  })

  it("the owner's circles open each agent's OWN chat, never the market page", async () => {
    /* Owner, 24.09: "I switch between agents in the chat and get an advert". */
    keeperAnswer = true
    await rail()
    for (const id of [
      'blogger',
      'job',
      'google',
      'tiktok',
      'scientist',
      'fpga',
      'rtl',
    ])
      expect(hrefs(), id).toContain(`/agents/${id}/work`)
    expect(hrefs()).not.toContain('/agents')
  })

  it('a trainee that earned the market opens for anybody', async () => {
    keeperAnswer = false
    verdictsAnswer = { scientist: { earned: true } }
    await rail()
    expect(hrefs()).toContain('/agents/scientist/work')
    /* The others, not yet: their card. */
    expect(hrefs()).not.toContain('/agents/google/work')
  })

  it('draws a person with a stored picture as that picture', async () => {
    await rail()
    const img = host.querySelector('.chat-threads__circle img')
    expect(img?.getAttribute('src')).toBe('https://example.invalid/a.jpg')
  })

  it('draws a person without one as initials, never an empty circle', async () => {
    await rail()
    const circles = [...host.querySelectorAll('.chat-threads__circle')]
    const boris = circles.find(c => (c.textContent ?? '').trim() === 'B')
    expect(
      boris,
      'no initials circle for a person without an avatar'
    ).toBeTruthy()
  })

  it('captions every circle with the name', async () => {
    await rail()
    const captions = [...host.querySelectorAll('.chat-threads__caption')].map(
      c => c.textContent
    )
    expect(captions).toContain('Anna Petrova')
    expect(captions).toContain('Boris')
    expect(captions.every(c => (c ?? '').length > 0)).toBe(true)
  })

  it('rings the conversation being read', async () => {
    await rail('900000402')
    const current = host.querySelector('.chat-threads__dot.is-current')
    expect(current?.getAttribute('href')).toBe('/crm/900000402/chat')
  })
})

describe('initials', () => {
  it('take the first letters of the words, and never digits', async () => {
    const { initialsOf } = await import('./ChatThreads')
    expect(initialsOf('Anna Petrova')).toBe('AP')
    expect(initialsOf('@placeholder_name')).toBe('PN')
    expect(initialsOf('Гея')).toBe('Г') // cyrillic-ok: a name
    expect(initialsOf('900000401')).toBe('•')
    expect(initialsOf('')).toBe('•')
  })
})
