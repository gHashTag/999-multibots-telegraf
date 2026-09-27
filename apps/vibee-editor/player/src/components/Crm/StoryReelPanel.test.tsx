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
    // No START button: the palette can still be looked at and kept.
    expect(host.querySelector('.crm-client__duet-start')).toBeNull()
  })

  it('starts a reel for THIS client on the typed topic, and says so', async () => {
    serve(a =>
      a.start ? { started: true, topic: String(a.topic ?? '') } : READY
    )
    await draw()
    const input = host.querySelector(
      '.crm-client__duet-start input'
    ) as HTMLInputElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!
      set.call(input, 'Букет недели')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      ;(
        host.querySelector(
          '.crm-client__duet-start button'
        ) as HTMLButtonElement
      ).click()
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

/*
 * HER PALETTE ON THE CARD (crm-story-reel.t27 v11): what the next reel ends
 * on, where each field comes from, a free check whose verdict is the
 * server's, and "keep" only for the card the last check passed.
 */
describe('her palette on the story panel', () => {
  const KEPT = { bg: '#10182a', title: '#f5f5f5' }
  const WITH_CARD = {
    ...READY,
    end_card: { ...KEPT, text: '#ffffff', button: 'Написать мне' },
    end_card_kept: KEPT,
  }
  const set = async (el: HTMLInputElement, value: string) =>
    act(async () => {
      Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value'
      )!.set!.call(el, value)
      el.dispatchEvent(new Event('input', { bubbles: true }))
    })
  const press = async (action: string) =>
    act(async () => {
      ;(
        host.querySelector(`[data-action="${action}"]`) as HTMLButtonElement
      ).click()
      await new Promise(r => setTimeout(r, 0))
    })
  const openEditor = async () =>
    act(async () => {
      ;[...host.querySelectorAll('button')]
        .find(b => b.textContent === 'crm.client.story.edit')!
        .click()
    })

  it('shows the card field by field, where each field comes from, and that it is kept', async () => {
    serve(() => WITH_CARD)
    await draw()
    const from = (f: string) =>
      host
        .querySelector(`.crm-client__swatches [data-field="${f}"]`)
        ?.getAttribute('data-from')
    expect(from('bg')).toBe('kept')
    expect(from('title')).toBe('kept')
    expect(from('text')).toBe('profile')
    expect(from('accent')).toBe('default')
    expect(host.textContent).toContain('Написать мне')
    expect(
      host.querySelector('[data-testid="story-palette-kept"]')
    ).not.toBeNull()
  })

  it('without a card says the reel ends on its last frame', async () => {
    serve(() => READY)
    await draw()
    expect(host.textContent).toContain('crm.client.story.palette.none')
    expect(host.querySelector('[data-testid="story-palette-kept"]')).toBeNull()
  })

  it('a check is a read: the card goes without start, and the verdict is the server words', async () => {
    serve(a =>
      a.end_card && !a.save_end_card
        ? { ...WITH_CARD, end_card_why: 'призыв цветом #eeeeee читается плохо' }
        : WITH_CARD
    )
    await draw()
    await openEditor()
    await set(
      host.querySelector('input[data-field="title"]') as HTMLInputElement,
      '#eeeeee'
    )
    await press('check')
    const check = calls.find(c => c.end_card && !c.save_end_card)!
    expect(check).toEqual({
      lead: CLIENT,
      end_card: {
        bg: '#10182a',
        title: '#eeeeee',
        text: '#ffffff',
        button: 'Написать мне',
      },
    })
    expect(check).not.toHaveProperty('start')
    expect(
      host.querySelector('[data-testid="story-palette-verdict"]')?.textContent
    ).toBe('призыв цветом #eeeeee читается плохо')
    // panel_keep_offered(checked, edited, clean=false) == false
    expect(
      (host.querySelector('[data-action="keep"]') as HTMLButtonElement).disabled
    ).toBe(true)
  })

  it('keep is offered only for the card the last check passed; an edit takes it back', async () => {
    serve(a =>
      a.save_end_card
        ? {
            ...WITH_CARD,
            end_card_kept: a.end_card,
            end_card_saved: 'палитра сохранена клиенту',
          }
        : WITH_CARD
    )
    await draw()
    await openEditor()
    const keep = () =>
      host.querySelector('[data-action="keep"]') as HTMLButtonElement
    expect(keep().disabled).toBe(true) // never checked
    await press('check')
    expect(keep().disabled).toBe(false) // checked, clean, unedited
    expect(
      host.querySelector('[data-testid="story-palette-verdict"]')?.textContent
    ).toBe('crm.client.story.readable')
    await set(
      host.querySelector('input[data-field="bg"]') as HTMLInputElement,
      '#1a2b3c'
    )
    expect(keep().disabled).toBe(true) // edited after the check
    // The old verdict is about another card: it is not shown for this one.
    expect(
      host.querySelector('[data-testid="story-palette-verdict"]')
    ).toBeNull()
    await press('check')
    await press('keep')
    const saved = calls.find(c => c.save_end_card)!
    expect(saved).toEqual({
      lead: CLIENT,
      end_card: {
        bg: '#1a2b3c',
        title: '#f5f5f5',
        text: '#ffffff',
        button: 'Написать мне',
      },
      save_end_card: true,
    })
    expect(calls.some(c => c.start)).toBe(false)
  })

  it('takes the kept palette off with an empty card, and starts nothing', async () => {
    serve(a =>
      a.save_end_card
        ? { ...READY, end_card_saved: 'палитра клиента снята' }
        : WITH_CARD
    )
    await draw()
    await openEditor()
    await press('clear')
    expect(calls.find(c => c.save_end_card)).toEqual({
      lead: CLIENT,
      end_card: {},
      save_end_card: true,
    })
    expect(calls.some(c => c.start)).toBe(false)
  })
})
