import { describe, expect, it, vi } from 'vitest'
import {
  announceStorageBlockedFrom,
  detectEmbed,
  embedLangOf,
  postErrorToParentFrom,
  postToParentFrom,
  widgetFrameAllowedFor,
  type EmbedWindow,
} from './embed'

/**
 * Fake windows. `framed` gives the page a parent that is a different object;
 * `ancestors: null` models Firefox, which has no location.ancestorOrigins.
 */
function win({
  framed = true,
  search = '',
  name = '',
  ancestors = ['https://t27.ai'] as string[] | null,
  referrer = '',
  session = {} as Record<string, string>,
} = {}): EmbedWindow & {
  sessionStorage: { getItem(k: string): string | null }
} {
  const top = {}
  const self = framed ? {} : top
  return {
    self,
    top,
    name,
    location: {
      search,
      ...(ancestors ? { ancestorOrigins: ancestors } : {}),
    },
    document: { referrer },
    sessionStorage: { getItem: k => session[k] ?? null },
  }
}

describe('detectEmbed: the app is in embed mode only inside the game frame', () => {
  it('a top-level visit is never embed, whatever the address says', () => {
    const w = win({ framed: false, search: '?embed=1&lang=ru', ancestors: [] })
    expect(detectEmbed(w)).toBeNull()
    expect(w.name).toBe('')
  })

  it('framed by t27.ai with ?embed=1 is embed, and the marker lands in window.name', () => {
    const w = win({ search: '?embed=1&lang=ru' })
    expect(detectEmbed(w)).toEqual({ parent: 'https://t27.ai', lang: 'ru' })
    expect(w.name.startsWith('t27-embed:')).toBe(true)
  })

  it('a reload or full navigation of the same frame keeps embed through window.name', () => {
    const first = win({ search: '?embed=1&lang=ru' })
    detectEmbed(first)
    // <a href="/feed"> or location.reload() after a pushState: no ?embed=1.
    const again = win({ search: '', name: first.name })
    expect(detectEmbed(again)).toEqual({ parent: 'https://t27.ai', lang: 'ru' })
  })

  it('framed with neither the parameter nor the marker is not embed', () => {
    expect(detectEmbed(win({ search: '?lang=ru' }))).toBeNull()
  })

  it('Telegram Web framing the app is never embed, even with a leftover session flag', () => {
    // The critic's case: an older design kept the flag in sessionStorage,
    // which a later Mini App launch in the same partition would have read.
    const w = win({
      search: '',
      ancestors: ['https://web.telegram.org'],
      session: { 'trinity.embed': '1' },
    })
    expect(detectEmbed(w)).toBeNull()
  })

  it('Telegram Web cannot switch embed on with ?embed=1', () => {
    const w = win({
      search: '?embed=1',
      ancestors: ['https://web.telegram.org'],
    })
    expect(detectEmbed(w)).toBeNull()
    expect(w.name).toBe('')
  })

  it('a marker written under t27.ai is refused when the live parent is someone else', () => {
    const first = win({ search: '?embed=1' })
    detectEmbed(first)
    const other = win({
      name: first.name,
      ancestors: ['https://web.telegram.org'],
    })
    expect(detectEmbed(other)).toBeNull()
  })

  it('an unknown parent origin is refused', () => {
    expect(
      detectEmbed(
        win({ search: '?embed=1', ancestors: ['https://evil.example'] })
      )
    ).toBeNull()
  })

  it('a forged marker naming an unknown parent is refused', () => {
    const name =
      't27-embed:' + JSON.stringify({ parent: 'https://evil.example' })
    expect(detectEmbed(win({ name, ancestors: null }))).toBeNull()
  })

  it('the game served at app.t27.ai/game/ is an allowed parent', () => {
    expect(
      detectEmbed(
        win({ search: '?embed=1', ancestors: ['https://app.t27.ai'] })
      )
    ).toEqual({ parent: 'https://app.t27.ai', lang: null })
  })

  describe('without ancestorOrigins (Firefox)', () => {
    it('the first load takes the parent from the referrer', () => {
      const w = win({
        search: '?embed=1&lang=en',
        ancestors: null,
        referrer: 'https://t27.ai/',
      })
      expect(detectEmbed(w)).toEqual({ parent: 'https://t27.ai', lang: 'en' })
    })

    it('a later load keeps the captured parent, not the new referrer', () => {
      const first = win({
        search: '?embed=1',
        ancestors: null,
        referrer: 'https://t27.ai/',
      })
      detectEmbed(first)
      // After an in-frame full navigation the referrer is the app itself.
      const later = win({
        name: first.name,
        ancestors: null,
        referrer: 'https://app.t27.ai/feed',
      })
      expect(detectEmbed(later)?.parent).toBe('https://t27.ai')
      // Even when the address still carries ?embed=1 (a reload before any
      // pushState), the captured parent wins over the referrer.
      const reload = win({
        search: '?embed=1',
        name: first.name,
        ancestors: null,
        referrer: 'https://app.t27.ai/feed',
      })
      expect(detectEmbed(reload)?.parent).toBe('https://t27.ai')
    })
  })
})

describe('embed language', () => {
  it('ru stays ru, any other game language is en, absent is null', () => {
    expect(embedLangOf('ru')).toBe('ru')
    expect(embedLangOf('de')).toBe('en')
    expect(embedLangOf('zh')).toBe('en')
    expect(embedLangOf(null)).toBeNull()
    expect(embedLangOf('')).toBeNull()
  })

  it('a later load without ?lang= keeps the stored language', () => {
    const first = win({ search: '?embed=1&lang=ru' })
    detectEmbed(first)
    expect(detectEmbed(win({ name: first.name }))?.lang).toBe('ru')
    expect(
      detectEmbed(win({ search: '?embed=1', name: first.name }))?.lang
    ).toBe('ru')
  })
})

describe('widgetFrameAllowedFor: Telegram only lets its widget load under app.t27.ai', () => {
  const state = (parent: string) => ({ parent, lang: null })

  it('a t27.ai ancestor blocks the widget', () => {
    expect(
      widgetFrameAllowedFor(
        state('https://t27.ai'),
        win({ ancestors: ['https://t27.ai'] })
      )
    ).toBe(false)
  })

  it('app.t27.ai all the way up allows it', () => {
    expect(
      widgetFrameAllowedFor(
        state('https://app.t27.ai'),
        win({ ancestors: ['https://app.t27.ai'] })
      )
    ).toBe(true)
  })

  it('app.t27.ai/game/ framed in turn by t27.ai blocks it', () => {
    expect(
      widgetFrameAllowedFor(
        state('https://app.t27.ai'),
        win({ ancestors: ['https://app.t27.ai', 'https://t27.ai'] })
      )
    ).toBe(false)
  })

  it('outside embed nothing changes', () => {
    expect(
      widgetFrameAllowedFor(null, win({ ancestors: ['https://t27.ai'] }))
    ).toBe(true)
  })

  it('without ancestorOrigins it goes by the captured parent', () => {
    expect(
      widgetFrameAllowedFor(state('https://t27.ai'), win({ ancestors: null }))
    ).toBe(false)
    expect(
      widgetFrameAllowedFor(
        state('https://app.t27.ai'),
        win({ ancestors: null })
      )
    ).toBe(true)
  })
})

describe('postToParentFrom', () => {
  it('posts nothing outside embed', () => {
    const postMessage = vi.fn()
    postToParentFrom(null, { parent: { postMessage } }, 'ready', '/feed')
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('posts a structured object to the exact parent origin', () => {
    const postMessage = vi.fn()
    postToParentFrom(
      { parent: 'https://t27.ai', lang: 'ru' },
      { parent: { postMessage } },
      'route',
      '/chat'
    )
    expect(postMessage).toHaveBeenCalledWith(
      { v: 1, type: 't27-app', kind: 'route', path: '/chat' },
      'https://t27.ai'
    )
  })
})

describe('postErrorToParentFrom: a screen that cannot work says why', () => {
  it('posts nothing outside embed', () => {
    const postMessage = vi.fn()
    postErrorToParentFrom(null, { parent: { postMessage } }, 'boundary')
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('posts {v:1, type:t27-app, kind:error, code} to the exact parent origin', () => {
    const postMessage = vi.fn()
    postErrorToParentFrom(
      { parent: 'https://t27.ai', lang: 'en' },
      { parent: { postMessage } },
      'boundary'
    )
    expect(postMessage).toHaveBeenCalledTimes(1)
    expect(postMessage).toHaveBeenCalledWith(
      { v: 1, type: 't27-app', kind: 'error', code: 'boundary' },
      'https://t27.ai'
    )
  })
})

describe('announceStorageBlockedFrom: storage whose getter throws is reported', () => {
  const STATE = { parent: 'https://t27.ai', lang: 'en' as const }

  function frame(blocked: Array<'localStorage' | 'sessionStorage'>) {
    const postMessage = vi.fn()
    const w = { parent: { postMessage } } as Record<string, unknown> & {
      parent: { postMessage: typeof postMessage }
    }
    for (const name of ['localStorage', 'sessionStorage'] as const) {
      Object.defineProperty(w, name, {
        get() {
          if (blocked.includes(name)) {
            throw new DOMException(
              'The operation is insecure.',
              'SecurityError'
            )
          }
          return {}
        },
      })
    }
    return { w, postMessage }
  }

  it.each([['localStorage'], ['sessionStorage']] as const)(
    'in embed, a %s getter that throws posts storage_blocked once',
    name => {
      const { w, postMessage } = frame([name])
      expect(announceStorageBlockedFrom(STATE, w)).toBe(true)
      expect(postMessage).toHaveBeenCalledTimes(1)
      expect(postMessage).toHaveBeenCalledWith(
        { v: 1, type: 't27-app', kind: 'error', code: 'storage_blocked' },
        'https://t27.ai'
      )
    }
  )

  it('control: storage that works posts nothing', () => {
    const { w, postMessage } = frame([])
    expect(announceStorageBlockedFrom(STATE, w)).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })

  it('control: outside embed nothing is posted, blocked or not', () => {
    const { w, postMessage } = frame(['localStorage', 'sessionStorage'])
    expect(announceStorageBlockedFrom(null, w)).toBe(false)
    expect(postMessage).not.toHaveBeenCalled()
  })
})
