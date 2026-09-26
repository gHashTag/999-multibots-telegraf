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
 * THE STORY-REEL TEMPLATE ON THE CLIENT'S CARD.
 *
 * Three things, all about not lying and not sending:
 *   1. face and voice are ticked only when the server says so, and what is
 *      missing is shown in the server's words, with no button to press;
 *   2. the button asks `crm_story_reel` to START, for this client, on the
 *      typed topic -- and says what the server answered;
 *   3. a viewer the tool refuses (not a seller) sees no panel at all.
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

const CLIENT = '900000077'
let calls: Array<Record<string, unknown>> = []

function serve(answer: (args: Record<string, unknown>) => unknown) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_u: string, init: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}'))
      const args = body?.params?.arguments ?? {}
      calls.push(args)
      const out = answer(args)
      if (out instanceof Error)
        return {
          ok: true,
          json: async () => ({
            jsonrpc: '2.0',
            id: 1,
            error: { code: -32000, message: out.message },
          }),
        }
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
  await import('./StoryReelPanel')
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
  const { StoryReelPanel } = await import('./StoryReelPanel')
  await act(async () => {
    root.render(<StoryReelPanel clientId={CLIENT} />)
  })
  await act(async () => {
    await new Promise(r => setTimeout(r, 0))
  })
}

const READY = {
  ready: true,
  face: 'https://bucket.example/face.jpg',
  voice: true,
  vip: true,
  one_tap_link: 'https://t.me/example_bot?start=reel',
  jobs: [
    {
      id: 2,
      topic: 'Одна ваза — три комнаты',
      status: 'done',
      url: 'https://bucket.example/reel.mp4',
      created_at: 'x',
    },
  ],
}

describe('the story-reel panel', () => {
  it('ticks face and voice from the server and lists the reels made', async () => {
    serve(() => READY)
    await draw()
    expect(calls[0]).toEqual({ lead: CLIENT })
    const marks = [...host.querySelectorAll('.crm-client__story-marks dd')].map(
      d => d.getAttribute('data-mark')
    )
    expect(marks).toEqual(['yes', 'yes', 'yes'])
    expect(host.textContent).toContain('https://t.me/example_bot?start=reel')
    expect(host.textContent).toContain('Одна ваза — три комнаты')
    expect(host.querySelector('a')?.getAttribute('href')).toBe(
      'https://bucket.example/reel.mp4'
    )
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

  it('starts a reel for THIS client on the typed topic, and says so', async () => {
    serve(a =>
      a.start ? { started: true, topic: String(a.topic ?? '') } : READY
    )
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
      lead: CLIENT,
      start: true,
      topic: 'Букет недели',
    })
    expect(host.textContent).toContain('crm.client.story.started:Букет недели')
  })

  it('is not drawn for a viewer the tool refuses', async () => {
    serve(
      () => new Error('CRM работает с вашим собственным Telegram-аккаунтом')
    )
    await draw()
    expect(host.textContent).toBe('')
  })
})
