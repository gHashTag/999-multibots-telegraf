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
    root.render(<StoryPage />)
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

  it('says a gift is a gift instead of naming a price', async () => {
    serve(() => ({ ...READY, price_tokens: undefined, gift: true }))
    await draw()
    expect(host.textContent).toContain('story.gift')
    expect(host.textContent).not.toContain('story.price')
  })

  it('starts HER reel on the typed topic and says so', async () => {
    serve(a => (a.start ? { started: true, topic: String(a.topic) } : READY))
    await draw()
    const input = host.querySelector('input')!
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
