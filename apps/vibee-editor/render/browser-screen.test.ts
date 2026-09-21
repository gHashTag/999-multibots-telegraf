import { describe, it, expect } from 'vitest'
import {
  pickFromMenu,
  wantedScreen,
  applyScreen,
  nearbySizes,
  fitDesktop,
  MIN_EDGE,
  MAX_WIDTH,
  MAX_HEIGHT,
  SNAP,
} from './src/browser/screen'

/**
 * THE DESKTOP FOLLOWS THE DEVICE.
 *
 * The bug this answers is visible in a photograph: a phone held upright
 * showing a landscape desktop as a stamp in a black field. The fix is not
 * CSS -- shrinking a picture cannot make the text in it readable -- so the
 * pod's own screen is reshaped, and these pin the arithmetic and the one
 * thing the pod lies about.
 */

describe('the size we ask the pod for', () => {
  it('KEEPS A PHONE PORTRAIT', () => {
    const s = wantedScreen({ width: 390, height: 780 })
    expect(s.height).toBeGreaterThan(s.width)
  })

  it('keeps a laptop landscape', () => {
    const s = wantedScreen({ width: 1440, height: 810 })
    expect(s.width).toBeGreaterThan(s.height)
  })

  it('asks only for widths X will actually build', () => {
    for (const w of [321, 375, 390, 412, 431, 1179, 1440]) {
      expect(wantedScreen({ width: w, height: 800 }).width % SNAP).toBe(0)
    }
  })

  it('never goes below what a page can be used at', () => {
    expect(
      wantedScreen({ width: 40, height: 40 }).width
    ).toBeGreaterThanOrEqual(MIN_EDGE)
    expect(
      wantedScreen({ width: 40, height: 40 }).height
    ).toBeGreaterThanOrEqual(MIN_EDGE)
  })

  it('does not stream somebody a wall', () => {
    const s = wantedScreen({ width: 8000, height: 5000 })
    expect(s.width).toBeLessThanOrEqual(MAX_WIDTH)
    expect(s.height).toBeLessThanOrEqual(MAX_HEIGHT)
  })

  it('survives a viewport it cannot read', () => {
    const s = wantedScreen({ width: NaN, height: 0 })
    expect(s.width).toBeGreaterThanOrEqual(MIN_EDGE)
    expect(s.height).toBeGreaterThanOrEqual(MIN_EDGE)
  })

  /* A frame drawn from a 0-height screen is a frame of infinite ratio. */
  it('is always a rectangle with area', () => {
    const s = wantedScreen({ width: 0, height: 0 })
    expect(s.width * s.height).toBeGreaterThan(0)
  })
})

describe('what the pod says versus what the pod did', () => {
  /**
   * MEASURED ON A LIVE POD: the POST reply is the request echoed back. It
   * said 420x880 while the screen was 416x880, because X snapped the width.
   * Anything that believed the reply would draw its frame at the wrong shape
   * forever, and the letterbox would be back.
   */
  const fetcherThatEchoes = () => {
    const calls: string[] = []
    const fetcher = async (url: string, init?: { method?: string }) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      const ok = (o: unknown) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(o),
      })
      if (url.endsWith('/api/login')) return ok({ token: 'bearer-1' })
      if ((init?.method || 'GET') === 'POST') {
        return ok({ width: 420, height: 880, rate: 30 }) /* the lie */
      }
      return ok({ width: 416, height: 880, rate: 30 }) /* the truth */
    }
    return { fetcher, calls }
  }

  it('BELIEVES THE READ-BACK, NOT THE REPLY', async () => {
    const { fetcher } = fetcherThatEchoes()
    const got = await applyScreen(
      'pod:8080',
      'admin-pw',
      { width: 420, height: 880, rate: 30 },
      fetcher as never
    )
    expect(got.width).toBe(416)
  })

  it('reads back AFTER it asks, not before', async () => {
    const { fetcher, calls } = fetcherThatEchoes()
    await applyScreen(
      'pod:8080',
      'admin-pw',
      { width: 420, height: 880, rate: 30 },
      fetcher as never
    )
    const post = calls.findIndex(c =>
      c.startsWith('POST http://pod:8080/api/room/screen')
    )
    const get = calls.findIndex(c =>
      c.startsWith('GET http://pod:8080/api/room/screen')
    )
    expect(post).toBeGreaterThanOrEqual(0)
    expect(get).toBeGreaterThan(post)
  })

  it('signs in as admin with the session own token', async () => {
    const bodies: string[] = []
    const fetcher = async (
      url: string,
      init?: { method?: string; body?: string }
    ) => {
      if (init?.body) bodies.push(init.body)
      const ok = (o: unknown) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(o),
      })
      if (url.endsWith('/api/login')) return ok({ token: 'bearer-1' })
      return ok({ width: 800, height: 1600, rate: 30 })
    }
    await applyScreen(
      'pod:8080',
      'the-session-admin-token',
      { width: 800, height: 1600, rate: 30 },
      fetcher as never
    )
    expect(bodies[0]).toContain('the-session-admin-token')
  })

  it('says so when the pod refuses, instead of pretending', async () => {
    const fetcher = async (url: string) =>
      url.endsWith('/api/login')
        ? { ok: true, status: 200, text: async () => '{"token":"b"}' }
        : { ok: false, status: 401, text: async () => 'Unauthorized' }
    await expect(
      applyScreen(
        'pod:8080',
        'pw',
        { width: 800, height: 600, rate: 30 },
        fetcher as never
      )
    ).rejects.toThrow(/401/)
  })
})

describe('the pod own menu, when it will not take an exact size', () => {
  /**
   * MEASURED: 352x852 is accepted, 360x852 is refused with 422, 368x852 is
   * refused, 376x852 is accepted. Whatever xrandr is doing when it builds a
   * mode, it is not a modulus, so an exact size is a gamble and the menu is
   * the answer when the gamble loses.
   */
  const MENU = [
    { width: 3840, height: 2160, rate: 60 },
    { width: 1920, height: 1080, rate: 60 },
    { width: 1280, height: 720, rate: 30 },
    { width: 1024, height: 768, rate: 60 },
    { width: 800, height: 1600, rate: 30 },
    { width: 640, height: 360, rate: 30 },
  ]

  it('GIVES A PORTRAIT PHONE A PORTRAIT DESKTOP', () => {
    /* The whole bug, in one assertion. */
    const got = pickFromMenu({ width: 360, height: 664 }, MENU)!
    expect(got.height).toBeGreaterThan(got.width)
  })

  it('does not hand a phone a wall to scale down', () => {
    const got = pickFromMenu({ width: 760, height: 320 }, MENU)!
    expect(got.width).toBeLessThanOrEqual(1280)
  })

  it('SHAPE BEATS SIZE', () => {
    /*
     * 800x1600 is further from a small phone in area than 640x360 is, and it
     * is the right answer anyway: area costs bandwidth, shape costs the
     * letterbox the owner photographed.
     */
    const got = pickFromMenu({ width: 360, height: 664 }, MENU)!
    expect(`${got.width}x${got.height}`).toBe('800x1600')
  })

  it('keeps a laptop landscape and near its own size', () => {
    /*
     * Three entries are exactly 16:9, so shape cannot separate them and area
     * decides. 1280x720 is nearer to 1440x810 than 1920x1080 is, and that is
     * the answer we want for a second reason: a desktop slightly smaller
     * than the box is upscaled a little, while a much larger one is shrunk,
     * and shrinking is what makes text unreadable.
     */
    const got = pickFromMenu({ width: 1440, height: 810 }, MENU)!
    expect(`${got.width}x${got.height}`).toBe('1280x720')
    expect(got.width).toBeGreaterThan(got.height)
  })

  it('has an answer when the pod offers nothing', () => {
    expect(pickFromMenu({ width: 390, height: 780 }, [])).toBeNull()
  })

  it('ignores a nonsense entry instead of dividing by it', () => {
    const got = pickFromMenu({ width: 390, height: 780 }, [
      { width: 0, height: 0, rate: 30 },
      { width: 800, height: 1600, rate: 30 },
    ])!
    expect(got.width).toBe(800)
  })

  it('NEVER RETURNS A SCREEN WITH NO AREA', () => {
    /*
     * Found by mutation: with the filter gone, a menu whose entries are all
     * junk returned a 0x0 "choice" and the pod was asked to become nothing.
     * The earlier case passed anyway because a good entry followed the bad
     * one -- an ordering the pod does not promise.
     */
    expect(
      pickFromMenu({ width: 390, height: 780 }, [
        { width: 0, height: 0, rate: 30 },
        { width: -8, height: 600, rate: 30 },
      ])
    ).toBeNull()
  })
})

describe('what happens when the pod says 422', () => {
  /** A pod that refuses the exact size and accepts one from its own list. */
  const podThatRefusesExact = () => {
    const asked: string[] = []
    let screen = { width: 1280, height: 800, rate: 30 }
    const fetcher = async (
      url: string,
      init?: { method?: string; body?: string }
    ) => {
      const ok = (o: unknown) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(o),
      })
      if (url.endsWith('/api/login')) return ok({ token: 'b' })
      if (url.endsWith('/configurations')) {
        return ok([
          { width: 800, height: 1600, rate: 30 },
          { width: 1280, height: 720, rate: 30 },
        ])
      }
      if ((init?.method || 'GET') === 'POST') {
        const want = JSON.parse(init!.body!)
        asked.push(`${want.width}x${want.height}`)
        if (want.width === 800 && want.height === 1600) {
          screen = { width: 800, height: 1600, rate: 30 }
          return ok(want)
        }
        return {
          ok: false,
          status: 422,
          text: async () => '{"code":422,"message":"cannot set screen size"}',
        }
      }
      return ok(screen)
    }
    return { fetcher, asked, current: () => screen }
  }

  it('TRIES THE NEIGHBOURS, THEN FALLS BACK TO THE MENU', async () => {
    const pod = podThatRefusesExact()
    const got = await applyScreen(
      'pod:8080',
      'pw',
      { width: 360, height: 664, rate: 30 },
      pod.fetcher as never
    )
    expect(`${got.width}x${got.height}`).toBe('800x1600')
    expect(pod.asked[0]).toBe('360x664')
    expect(pod.asked.at(-1)).toBe('800x1600')
    const neighbours = nearbySizes({ width: 360, height: 664, rate: 30 })
    expect(pod.asked.slice(1, -1)).toEqual(
      neighbours.map(n => `${n.width}x${n.height}`)
    )
  })

  it('TAKES A NEIGHBOUR over a menu size of another shape', async () => {
    /* Measured: at 852 high, 360 and 368 refused, 352 and 376 accepted. */
    let screen = { width: 1280, height: 800, rate: 30 }
    const asked: string[] = []
    const fetcher = async (
      url: string,
      init?: { method?: string; body?: string }
    ) => {
      const ok = (o: unknown) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(o),
      })
      if (url.endsWith('/api/login')) return ok({ token: 'b' })
      if (url.endsWith('/configurations'))
        return ok([{ width: 800, height: 1600, rate: 30 }])
      if ((init?.method || 'GET') === 'POST') {
        const want = JSON.parse(init!.body!)
        asked.push(`${want.width}x${want.height}`)
        if (want.width === 352 || want.width === 376) {
          screen = want
          return ok(want)
        }
        return { ok: false, status: 422, text: async () => 'no' }
      }
      return ok(screen)
    }
    const got = await applyScreen(
      'pod:8080',
      'pw',
      { width: 360, height: 852, rate: 30 },
      fetcher as never
    )
    expect(got.height).toBe(852)
    expect([352, 376]).toContain(got.width)
    expect(asked).not.toContain('800x1600')
  })

  it('does not ask twice when the exact size was taken', async () => {
    const pod = podThatRefusesExact()
    await applyScreen(
      'pod:8080',
      'pw',
      { width: 800, height: 1600, rate: 30 },
      pod.fetcher as never
    )
    expect(pod.asked).toEqual(['800x1600'])
  })

  it('reports the screen it really has when nothing was accepted', async () => {
    const fetcher = async (url: string, init?: { method?: string }) => {
      const ok = (o: unknown) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(o),
      })
      if (url.endsWith('/api/login')) return ok({ token: 'b' })
      if (url.endsWith('/configurations')) return ok([])
      if ((init?.method || 'GET') === 'POST') {
        return { ok: false, status: 422, text: async () => 'no' }
      }
      return ok({ width: 1280, height: 800, rate: 30 })
    }
    const got = await applyScreen(
      'pod:8080',
      'pw',
      { width: 360, height: 664, rate: 30 },
      fetcher as never
    )
    /* The truth, not the wish: the frame is drawn from this. */
    expect(`${got.width}x${got.height}`).toBe('1280x800')
  })

  it('TREATS A SILENT NO AS A NO', async () => {
    /*
     * Measured: 393x852 answered 200 and left the screen where it was. A
     * read-back that does not match is a refusal however polite the reply.
     */
    const asked: string[] = []
    const fetcher = async (
      url: string,
      init?: { method?: string; body?: string }
    ) => {
      const ok = (o: unknown) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(o),
      })
      if (url.endsWith('/api/login')) return ok({ token: 'b' })
      if (url.endsWith('/configurations'))
        return ok([{ width: 800, height: 1600, rate: 30 }])
      if ((init?.method || 'GET') === 'POST') {
        asked.push(JSON.parse(init!.body!).width + '')
        return ok(JSON.parse(init!.body!)) /* says yes */
      }
      return ok({ width: 1280, height: 800, rate: 30 }) /* never moves */
    }
    await applyScreen(
      'pod:8080',
      'pw',
      { width: 393, height: 852, rate: 30 },
      fetcher as never
    )
    expect(asked[0]).toBe('393')
    expect(asked.at(-1)).toBe('800')
    /* Every polite no in between was read back and disbelieved too. */
    expect(asked).toHaveLength(
      2 + nearbySizes({ width: 393, height: 852, rate: 30 }).length
    )
  })
})

describe('the neighbours of a refused size', () => {
  const want = { width: 400, height: 800, rate: 30 }

  it('are one or two snaps away, nearest first, twelve at most', () => {
    const near = nearbySizes(want)
    expect(near.length).toBe(12)
    const d = (n: { width: number; height: number }) =>
      (n.width - want.width) ** 2 + (n.height - want.height) ** 2
    for (let i = 1; i < near.length; i++)
      expect(d(near[i])).toBeGreaterThanOrEqual(d(near[i - 1]))
    for (const n of near) {
      expect(Math.abs(n.width - want.width)).toBeLessThanOrEqual(16)
      expect(Math.abs(n.height - want.height)).toBeLessThanOrEqual(16)
      expect(n.width % 8).toBe(0)
    }
    expect(near.map(n => `${n.width}x${n.height}`)).not.toContain('400x800')
  })

  it('never leave the sizes a pod may be asked for', () => {
    for (const n of nearbySizes({ width: 320, height: 1600, rate: 30 })) {
      expect(n.width).toBeGreaterThanOrEqual(320)
      expect(n.height).toBeLessThanOrEqual(1600)
    }
  })
})

describe('the window follows the screen', () => {
  const desk = {
    endpoint: 'pod:8080',
    adminToken: 'pw',
    cdpEndpoint: 'pod:9223',
  }
  const want = { width: 368, height: 536, rate: 30 }

  it('FITS THE WINDOW TO THE SIZE THE SCREEN REALLY GOT', async () => {
    const fitted: unknown[] = []
    const got = await fitDesktop(desk, want, {
      apply: async () => ({ width: 376, height: 536, rate: 30 }),
      fitWindow: async (cdp, size) => {
        fitted.push([cdp, size])
        return 1
      },
    })
    expect(got.width).toBe(376)
    expect(fitted).toEqual([
      ['pod:9223', { width: 376, height: 536, rate: 30 }],
    ])
  })

  it('does not touch a window it has no way to reach', async () => {
    let called = false
    await fitDesktop({ ...desk, cdpEndpoint: null }, want, {
      apply: async () => ({ ...want }),
      fitWindow: async () => {
        called = true
        return 0
      },
    })
    expect(called).toBe(false)
  })

  it('A WINDOW THAT WILL NOT FOLLOW DOES NOT FAIL THE FIT', async () => {
    const got = await fitDesktop(desk, want, {
      apply: async () => ({ ...want }),
      fitWindow: async () => {
        throw new Error('CDP timed out')
      },
    })
    expect(got).toEqual(want)
  })
})
