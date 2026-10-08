import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

/**
 * MY REELS: the person's own story-reel page (?start=app_story).
 *
 * What is pinned, all of it about not lying and not charging by surprise:
 *   1. face and voice are ticked from the server's answer only;
 *   2. the price is named BEFORE the press -- or, for a gift, that it is one;
 *   3. the button asks `my_story_reel` to START with the typed topic, and
 *      names no person (the server knows who is asking);
 *   4. a page that could not load says so instead of an empty list.
 */

vi.mock('@/hooks/useLanguage', () => ({
  useLanguage: () => ({
    t: (key: string, vars?: Record<string, unknown>) =>
      vars ? `${key}:${Object.values(vars).join(',')}` : key,
  }),
}))
;(
  globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }
).IS_REACT_ACT_ENVIRONMENT = true

let calls: Array<{ name: string; args: Record<string, unknown> }> = []

function serve(answer: (args: Record<string, unknown>) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const args = body?.params?.arguments ?? {}
      calls.push({ name: body?.params?.name, args })
      const out = answer(args)
      if (out === 500) return { ok: false, status: 500, json: async () => ({}) }
      return {
        ok: true,
        json: async () => ({
          jsonrpc: '2.0',
          id: 1,
          result: { structuredContent: out },
        }),
      }
    })
  )
}

let host: HTMLDivElement
let root: Root

beforeAll(async () => {
  await import('./Story')
}, 60_000)
beforeEach(() => {
  calls = []
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

async function draw() {
  const { default: StoryPage } = await import('./Story')
  await act(async () => {
    root.render(
      <MemoryRouter>
        <StoryPage />
      </MemoryRouter>
    )
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

const READY = {
  ready: true,
  face: 'https://bucket.example/face.jpg',
  voice: true,
  next_topic: 'Ваза в интерьере',
  price_tokens: 270,
  jobs: [
    {
      id: 1,
      topic: 'Одна ваза — три комнаты',
      status: 'done',
      url: 'https://bucket.example/reel.mp4',
      created_at: 'x',
    },
  ],
}

describe('my reels', () => {
  it('asks my_story_reel about HERSELF: no person is named', async () => {
    serve(() => READY)
    await draw()
    expect(calls[0]).toEqual({ name: 'my_story_reel', args: {} })
  })

  it('shows face, voice, the next plan topic and the price before the press', async () => {
    serve(() => READY)
    await draw()
    const marks = [...host.querySelectorAll('.crm-client__story-marks dd')].map(
      d => d.getAttribute('data-mark')
    )
    expect(marks).toEqual(['yes', 'yes'])
    const text = String(host.textContent)
    expect(text).toContain('story.next:Ваза в интерьере')
    expect(text).toContain('story.price:270')
    expect(text).toContain('Одна ваза — три комнаты')
  })

  /*
   * v16: "before the press" is a place, not a word. The title above said it
   * and the test only checked the price was SOMEWHERE -- shot on a phone, it
   * stood below "make a reel". Document order is reading order here.
   */
  const priceThenPress = () => {
    const price = host.querySelector('[data-testid="story-price"]')!
    const press = host.querySelector('button')!
    return Boolean(
      price.compareDocumentPosition(press) & Node.DOCUMENT_POSITION_FOLLOWING
    )
  }

  it('the price stands above the button, read before the press (v16)', async () => {
    serve(() => READY)
    await draw()
    expect(host.querySelector('[data-testid="story-price"]')?.textContent).toBe(
      'story.price:270'
    )
    expect(priceThenPress()).toBe(true)
  })

  it('a gift is named above the button too (v16)', async () => {
    serve(() => ({ ...READY, price_tokens: undefined, gift: true }))
    await draw()
    expect(host.querySelector('[data-testid="story-price"]')?.textContent).toBe(
      'story.gift'
    )
    expect(priceThenPress()).toBe(true)
  })

  it('a reel that came out is its own picture, bigger than a finger, opening it (plan-reel)', async () => {
    serve(() => READY)
    await draw()
    const pic = host.querySelector<HTMLAnchorElement>('a.reel-preview')!
    expect(pic.getAttribute('href')).toBe(READY.jobs[0].url)
    expect(pic.querySelector('video')?.getAttribute('src')).toBe(
      `${READY.jobs[0].url}#t=1`
    )
    expect(parseInt(pic.style.width)).toBeGreaterThanOrEqual(44)
    expect(parseInt(pic.style.height)).toBeGreaterThanOrEqual(44)
  })

  it('a reel whose poster the server kept shows it, and the video is not fetched (plan-reel v3)', async () => {
    serve(() => ({
      ...READY,
      jobs: [
        { ...READY.jobs[0], poster: 'https://shelf.example/s3/reel.jpg' },
        { ...READY.jobs[0], id: 2, poster: '' },
      ],
    }))
    await draw()
    const [kept, tried] = [
      ...host.querySelectorAll<HTMLAnchorElement>('a.reel-preview'),
    ]
    expect(kept.querySelector('img')?.getAttribute('src')).toBe(
      'https://shelf.example/s3/reel.jpg'
    )
    expect(kept.querySelector('video')).toBeNull()
    expect(tried.querySelector('img')).toBeNull()
    expect(tried.querySelector('video')).not.toBeNull()
  })

  it('says a gift is a gift instead of naming a price', async () => {
    serve(() => ({ ...READY, price_tokens: undefined, gift: true }))
    await draw()
    expect(host.textContent).toContain('story.gift')
    expect(host.textContent).not.toContain('story.price')
  })

  it('starts HER reel on the typed topic and says so', async () => {
    serve(a => (a.start ? { started: true, topic: String(a.topic) } : READY))
    await draw()
    const input = host.querySelector('input[type="text"]')!
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!
      set.call(input, 'Букет недели')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      host.querySelector('button')!.click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(calls).toContainEqual({
      name: 'my_story_reel',
      args: { start: true, topic: 'Букет недели' },
    })
    expect(host.textContent).toContain('story.started:Букет недели')
  })

  it('names what is missing and offers no button', async () => {
    serve(() => ({
      ready: false,
      why: 'для рилса не хватает: голос',
      voice: false,
      jobs: [],
    }))
    await draw()
    expect(host.textContent).toContain('для рилса не хватает: голос')
    expect(host.querySelector('button')).toBeNull()
  })

  it('a page that could not load says so, not an empty list', async () => {
    serve(() => 500)
    await draw()
    expect(host.textContent).toContain('story.unreachable')
    expect(host.textContent).not.toContain('story.none')
  })
})

/*
 * The chat with the agent shows the same widget (owner, 2026-10-02) -- but
 * only to someone whose template is ready, and folded once the talk began.
 */
describe('her reels inside the chat', () => {
  it('the page leads to the chat with the agent', async () => {
    serve(() => READY)
    await draw()
    expect(
      host.querySelector('[data-testid="story-to-chat"]')?.getAttribute('href')
    ).toBe('/chat')
  })

  async function drawWidget(foldedIn: boolean) {
    const { MyStoryWidget } = await import('@/components/Story/MyStoryWidget')
    await act(async () => {
      root.render(<MyStoryWidget onlyReady foldedIn={foldedIn} />)
    })
    await act(async () => {
      await new Promise(r => setTimeout(r, 0))
    })
  }

  it('a ready template shows the widget, open before the talk', async () => {
    serve(() => READY)
    await drawWidget(false)
    const box = host.querySelector('[data-testid="chat-story"]')
    expect(box).not.toBeNull()
    expect(box!.hasAttribute('open')).toBe(true)
    expect(String(host.textContent)).toContain('story.price:270')
  })

  it('folds once the conversation has started', async () => {
    serve(() => READY)
    await drawWidget(true)
    const box = host.querySelector('[data-testid="chat-story"]')
    expect(box!.hasAttribute('open')).toBe(false)
  })

  it('no template ready -- the chat draws nothing at all', async () => {
    serve(() => ({ ...READY, ready: false }))
    await drawWidget(false)
    expect(host.innerHTML).toBe('')
  })
})
