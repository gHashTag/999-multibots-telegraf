import { describe, it, expect } from 'vitest'
import { FACE_SCRIPT, AVATAR_PATH } from './src/browser/skin'

/**
 * ONE DISC PER PERSON, AND IT IS THEIR FACE.
 *
 * Runs the window's face script against a small stand-in page: the photo
 * goes on the root once it has really loaded, and the person's other
 * screens become a number on their own disc instead of copies of it.
 */

const ID = 'sessAbCd1234'

function world() {
  const rootProps: Record<string, string> = {}
  const rootAttrs: Record<string, string> = {}
  const selfAttrs: Record<string, string> = {}
  let members = 0
  let hasSelf = false
  let observer: (() => void) | null = null
  const images: { src: string; onload?: () => void }[] = []

  const root = {
    style: { setProperty: (k: string, v: string) => void (rootProps[k] = v) },
    setAttribute: (k: string, v: string) => void (rootAttrs[k] = v),
  }
  const self = {
    getAttribute: (k: string) => selfAttrs[k] ?? null,
    setAttribute: (k: string, v: string) => void (selfAttrs[k] = v),
    removeAttribute: (k: string) => void delete selfAttrs[k],
  }
  const document = {
    documentElement: root,
    querySelector: (sel: string) =>
      sel === '.members .self' && hasSelf ? self : null,
    querySelectorAll: (sel: string) =>
      sel === '.members-list > li' ? new Array(members).fill({}) : [],
  }
  class Image {
    src = ''
    onload?: () => void
    constructor() {
      images.push(this)
    }
  }
  class MutationObserver {
    constructor(fn: () => void) {
      observer = fn
    }
    observe() {}
  }

  new Function(
    'document',
    'location',
    'Image',
    'MutationObserver',
    FACE_SCRIPT
  )(document, { pathname: `/live/${ID}/` }, Image, MutationObserver)

  return {
    rootProps,
    rootAttrs,
    selfAttrs,
    images,
    room(n: number) {
      hasSelf = n > 0
      members = n
      observer?.()
    },
  }
}

describe('the face', () => {
  it('asks for this window own avatar', () => {
    const w = world()
    expect(w.images[0].src).toBe(`/live/${ID}${AVATAR_PATH}`)
  })

  it('PUTS NOTHING ON THE DISC UNTIL THE PICTURE HAS LOADED', () => {
    const w = world()
    expect(w.rootAttrs['data-t27-face']).toBeUndefined()
    expect(w.rootProps['--t27-face']).toBeUndefined()
    w.images[0].onload?.()
    expect(w.rootAttrs['data-t27-face']).toBe('1')
    expect(w.rootProps['--t27-face']).toBe(`url("/live/${ID}${AVATAR_PATH}")`)
  })

  it('is set on the root, so a re-rendered disc keeps it', () => {
    /* Nothing is written to the disc itself except the count. */
    const w = world()
    w.room(1)
    w.images[0].onload?.()
    expect(Object.keys(w.selfAttrs)).toEqual([])
  })
})

describe('the other screens', () => {
  it('says nothing when this is the only screen', () => {
    const w = world()
    w.room(1)
    expect(w.selfAttrs['data-t27-more']).toBeUndefined()
  })

  it('COUNTS THEM on the person own disc', () => {
    const w = world()
    w.room(3)
    expect(w.selfAttrs['data-t27-more']).toBe('+2')
  })

  it('follows the room as screens come and go', () => {
    const w = world()
    w.room(3)
    w.room(2)
    expect(w.selfAttrs['data-t27-more']).toBe('+1')
    w.room(1)
    expect(w.selfAttrs['data-t27-more']).toBeUndefined()
  })

  it('waits for the person own disc before counting', () => {
    const w = world()
    w.room(0)
    expect(w.selfAttrs['data-t27-more']).toBeUndefined()
  })
})

describe('the window sounds like the product', () => {
  it('ANSWERS THE ENGINE CHAT CHIME WITH OUR SOUND', async () => {
    const { pipeHttp } = await import('./src/browser/live-pipe')
    const { BRAND_SOUND_URL } = await import('./src/browser/skin')
    const head: { status?: number; headers?: Record<string, string> } = {}
    let ended = false
    pipeHttp(
      {
        endpoint: '127.0.0.1:1',
        upstreamPath: '/chat.mp3',
        sessionId: 'sessAbCd1234',
        viewToken: 'x',
      },
      { method: 'GET', headers: {} } as never,
      {
        writeHead(status: number, headers: Record<string, string>) {
          head.status = status
          head.headers = headers
        },
        end() {
          ended = true
        },
      } as never
    )
    expect(head.status).toBe(302)
    expect(head.headers?.Location).toBe(BRAND_SOUND_URL)
    expect(ended).toBe(true)
  })
})
