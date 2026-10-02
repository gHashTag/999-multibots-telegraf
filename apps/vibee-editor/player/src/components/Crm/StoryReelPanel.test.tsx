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
vi.mock('@/lib/s3Upload', () => ({
  uploadToS3: vi.fn(async () => 'https://cdn.example/own.jpg'),
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
    const marks = [...host.querySelectorAll('.story-reel__chips li')].map(d =>
      d.getAttribute('data-mark')
    )
    expect(marks).toEqual(['yes', 'yes', 'vip'])
    expect(host.textContent).toContain('https://t.me/example_bot?start=reel')
    expect(host.textContent).toContain('Одна ваза — три комнаты')
    expect(host.querySelector('a')?.getAttribute('href')).toBe(
      'https://bucket.example/reel.mp4'
    )
  })

  /*
   * v16: the seller's own press is paid from the seller's balance -- the
   * answer carried its price and the card showed none.
   */
  it("names the seller's price above the start button (v16)", async () => {
    serve(() => ({ ...READY, price_tokens: 218 }))
    await draw()
    const price = host.querySelector('[data-testid="story-reel-price"]')
    expect(price?.textContent).toBe('crm.client.story.price:218')
    const press = host.querySelector('.story-reel__go')!
    expect(
      Boolean(
        price!.compareDocumentPosition(press) & Node.DOCUMENT_POSITION_FOLLOWING
      )
    ).toBe(true)
  })

  /*
   * Owner 2026-10-02: the count of frames is the seller's to set -- three by
   * default, the server's range, the price of the chosen count above the
   * press, and the count sent with the start.
   */
  it('sets the number of frames, prices it and sends it', async () => {
    serve(a =>
      a.start
        ? { started: true, topic: '' }
        : {
            ...READY,
            price_tokens: 270,
            scenes: {
              default: 3,
              min: 1,
              max: 4,
              price_tokens: { 1: 100, 2: 185, 3: 270, 4: 355 },
            },
          }
    )
    await draw()
    const count = () =>
      host.querySelector('[data-testid="story-reel-count"]')?.textContent
    const tiles = () => host.querySelectorAll('.story-reel__frame').length
    expect(count()).toBe('3')
    expect(tiles()).toBe(4) // three frames and the call
    const [less, more] = [
      ...host.querySelectorAll('.story-reel__stepper button'),
    ] as HTMLButtonElement[]
    await act(async () => more.click())
    expect(count()).toBe('4')
    expect(more.disabled).toBe(true)
    expect(tiles()).toBe(5)
    expect(
      host.querySelector('[data-testid="story-reel-price"]')?.textContent
    ).toBe('crm.client.story.price:355')
    await act(async () => {
      less.click()
      less.click()
    })
    await act(async () => {
      ;(host.querySelector('.story-reel__go') as HTMLButtonElement).click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(calls).toContainEqual({
      lead: CLIENT,
      start: true,
      scene_count: 2,
      to: 'dm',
    })
  })

  it('"watch" is a finger-sized link (tri shot: it was 17 px)', async () => {
    serve(() => READY)
    await draw()
    expect(host.querySelector('a')?.className).toBe('crm-client__watch')
  })

  it('names no price when the answer carries none', async () => {
    serve(() => READY)
    await draw()
    expect(host.querySelector('[data-testid="story-reel-price"]')).toBeNull()
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
    expect(host.querySelector('.story-reel__go')).toBeNull()
  })

  it('starts a reel for THIS client on the typed topic, and says so', async () => {
    serve(a =>
      a.start ? { started: true, topic: String(a.topic ?? '') } : READY
    )
    await draw()
    const input = host.querySelector(
      '.story-reel__topic'
    ) as HTMLTextAreaElement
    await act(async () => {
      const set = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value'
      )!.set!
      set.call(input, 'Букет недели')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })
    await act(async () => {
      ;(host.querySelector('.story-reel__go') as HTMLButtonElement).click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(calls).toContainEqual({
      lead: CLIENT,
      start: true,
      topic: 'Букет недели',
      to: 'dm',
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

  // v12: the server names the shade of her colour that reads; the panel
  // computes none, takes it by a press, and checks that card again.
  const REFUSED = {
    ...WITH_CARD,
    end_card_why:
      'призыв цветом #eeeeee на фоне #fafafa читается плохо; читается #5a5a5a',
    end_card_fix: { title: '#5a5a5a' },
  }
  const fixRow = () => host.querySelector('[data-testid="story-palette-fix"]')

  it('take the shade: a refused check names it, the press fills the field and checks again', async () => {
    serve(a =>
      a.end_card && !a.save_end_card
        ? (a.end_card as { title?: string }).title === '#eeeeee'
          ? REFUSED
          : WITH_CARD
        : WITH_CARD
    )
    await draw()
    expect(fixRow()).toBeNull() // the loaded card reads: nothing to take
    await openEditor()
    await set(
      host.querySelector('input[data-field="title"]') as HTMLInputElement,
      '#eeeeee'
    )
    await press('check')
    expect(fixRow()?.textContent).toContain('#5a5a5a')
    const keep = () =>
      host.querySelector('[data-action="keep"]') as HTMLButtonElement
    expect(keep().disabled).toBe(true)
    await press('take')
    const checks = calls.filter(c => c.end_card && !c.save_end_card)
    expect(checks.at(-1)).toEqual({
      lead: CLIENT,
      end_card: {
        bg: '#10182a',
        title: '#5a5a5a',
        text: '#ffffff',
        button: 'Написать мне',
      },
    })
    expect(
      (host.querySelector('input[data-field="title"]') as HTMLInputElement)
        .value
    ).toBe('#5a5a5a')
    // The new check passed: keep is offered -- and was not pressed for him.
    expect(
      host.querySelector('[data-testid="story-palette-verdict"]')?.textContent
    ).toBe('crm.client.story.readable')
    expect(keep().disabled).toBe(false)
    expect(calls.some(c => c.save_end_card || c.start)).toBe(false)
  })

  it('take the shade: an edit after the check takes the named shade back', async () => {
    serve(a => (a.end_card && !a.save_end_card ? REFUSED : WITH_CARD))
    await draw()
    await openEditor()
    await press('check')
    expect(fixRow()).not.toBeNull()
    await set(
      host.querySelector('input[data-field="bg"]') as HTMLInputElement,
      '#1a2b3c'
    )
    // panel_take_offered(checked, edited, has_fix) == false
    expect(fixRow()).toBeNull()
  })

  it('take the shade: a loaded card that does not read offers it before the editor opens', async () => {
    serve(a => (a.end_card ? WITH_CARD : REFUSED))
    await draw()
    expect(fixRow()?.textContent).toContain('#5a5a5a')
    await press('take')
    expect(calls.find(c => c.end_card)).toEqual({
      lead: CLIENT,
      end_card: {
        bg: '#10182a',
        title: '#5a5a5a',
        text: '#ffffff',
        button: 'Написать мне',
      },
    })
    // The editor is open on the taken card, and the load's row is gone.
    expect(host.querySelector('.crm-client__palette-edit')).not.toBeNull()
    expect(
      host.querySelector('[data-testid="story-palette-verdict"]')?.textContent
    ).toBe('crm.client.story.readable')
    expect(
      host.querySelectorAll('[data-testid="story-palette-fix"]').length
    ).toBe(0)
    expect(calls.some(c => c.save_end_card || c.start)).toBe(false)
  })

  // v13: beside the shade, her own colour and her ground -- each a press.
  const OPTIONS = {
    ...REFUSED,
    end_card_fix_palette: { title: '#5a4a10' },
    end_card_fix_bg: { bg: '#45433f' },
  }
  const lastCheck = () =>
    calls.filter(c => c.end_card && !c.save_end_card).at(-1)

  it('take her own colour: the press fills the call with it and checks again', async () => {
    serve(a =>
      a.end_card && !a.save_end_card
        ? (a.end_card as { title?: string }).title === '#eeeeee'
          ? OPTIONS
          : WITH_CARD
        : WITH_CARD
    )
    await draw()
    await openEditor()
    await set(
      host.querySelector('input[data-field="title"]') as HTMLInputElement,
      '#eeeeee'
    )
    await press('check')
    for (const id of ['fix', 'fix-palette', 'fix-bg'])
      expect(
        host.querySelector(`[data-testid="story-palette-${id}"]`)
      ).not.toBeNull()
    await press('take-palette')
    expect(lastCheck()).toEqual({
      lead: CLIENT,
      end_card: {
        bg: '#10182a',
        title: '#5a4a10',
        text: '#ffffff',
        button: 'Написать мне',
      },
    })
    expect(calls.some(c => c.save_end_card || c.start)).toBe(false)
  })

  it('take the ground: only the background changes, then the card is checked again', async () => {
    serve(a =>
      a.end_card && !a.save_end_card
        ? (a.end_card as { bg?: string }).bg === '#45433f'
          ? WITH_CARD
          : OPTIONS
        : WITH_CARD
    )
    await draw()
    await openEditor()
    await press('check')
    await press('take-bg')
    expect(lastCheck()).toEqual({
      lead: CLIENT,
      end_card: {
        bg: '#45433f',
        title: '#f5f5f5',
        text: '#ffffff',
        button: 'Написать мне',
      },
    })
    // The new check read clean: no options left, keep is offered.
    expect(
      host.querySelector('[data-testid="story-palette-fix-bg"]')
    ).toBeNull()
    expect(
      (host.querySelector('[data-action="keep"]') as HTMLButtonElement).disabled
    ).toBe(false)
    expect(calls.some(c => c.save_end_card || c.start)).toBe(false)
  })

  it('a loaded card that does not read offers every option before the editor opens', async () => {
    serve(a => (a.end_card ? WITH_CARD : OPTIONS))
    await draw()
    expect(host.querySelectorAll('.crm-client__palette-fix').length).toBe(3)
    await press('take-bg')
    expect(lastCheck()?.end_card).toMatchObject({ bg: '#45433f' })
    expect(host.querySelector('.crm-client__palette-edit')).not.toBeNull()
  })

  /*
   * v15: shot on a phone, the card printed the same refusal twice -- the
   * load's reason above and the check's verdict below, for the same card.
   */
  it('one reason at a time: the load speaks until a check has spoken for the fields', async () => {
    serve(() => REFUSED)
    await draw()
    const why = () => host.querySelector('[data-testid="story-palette-why"]')
    const verdict = () =>
      host.querySelector('[data-testid="story-palette-verdict"]')
    expect(why()?.textContent).toBe(REFUSED.end_card_why)
    // Open, nothing checked yet: the load's reason is still the only one.
    await openEditor()
    expect(why()).not.toBeNull()
    expect(verdict()).toBeNull()
    // Checked: the verdict is the reason, and the words stand once.
    await press('check')
    expect(verdict()?.textContent).toBe(REFUSED.end_card_why)
    expect(why()).toBeNull()
    expect(host.textContent!.split(REFUSED.end_card_why).length - 1).toBe(1)
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

describe('the face of the reel', () => {
  it('is the avatar by default, a chosen photo over it, and the avatar back', async () => {
    let own = ''
    serve(a => {
      if (typeof a.face_url === 'string') own = a.face_url
      if (a.ideas) return { lead: CLIENT, ideas: [] }
      return {
        ...READY,
        face: own || READY.face,
        face_custom: own !== '',
        avatar: READY.face,
      }
    })
    await draw()
    const picker = () =>
      host.querySelector('[data-testid="story-face-picker"]') as HTMLElement
    expect(picker().textContent).toContain('crm.client.story.photo.avatar')
    expect(picker().querySelector('button')).toBeNull()

    const input = picker().querySelector(
      'input[type="file"]'
    ) as HTMLInputElement
    const file = new File(['x'], 'me.jpg', { type: 'image/jpeg' })
    Object.defineProperty(input, 'files', { value: [file] })
    await act(async () => {
      input.dispatchEvent(new Event('change', { bubbles: true }))
      await new Promise(r => setTimeout(r, 0))
    })
    expect(calls).toContainEqual({
      lead: CLIENT,
      face_url: 'https://cdn.example/own.jpg',
    })
    expect(picker().textContent).toContain('crm.client.story.photo.own')
    const tile = host.querySelector(
      '.story-reel__frame img'
    ) as HTMLImageElement
    expect(tile.src).toBe('https://cdn.example/own.jpg')

    await act(async () => {
      ;(picker().querySelector('button') as HTMLButtonElement).click()
      await new Promise(r => setTimeout(r, 0))
    })
    expect(calls).toContainEqual({ lead: CLIENT, face_url: '' })
    expect(picker().textContent).toContain('crm.client.story.photo.avatar')
  })
})
