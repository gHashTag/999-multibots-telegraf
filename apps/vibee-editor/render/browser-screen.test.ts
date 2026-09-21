import { describe, it, expect } from 'vitest'
import {
  pickFromMenu,
  wantedScreen,
  applyScreen,
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
    /* It starts elsewhere, or the fit would rightly ask for nothing. */
    let screen = { width: 1280, height: 800, rate: 30 }
    const fetcher = async (url: string, init?: { method?: string }) => {
      calls.push(`${init?.method || 'GET'} ${url}`)
      const ok = (o: unknown) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(o),
      })
      if (url.endsWith('/api/login')) return ok({ token: 'bearer-1' })
      if ((init?.method || 'GET') === 'POST') {
        screen = { width: 416, height: 880, rate: 30 } /* the truth */
        return ok({ width: 420, height: 880, rate: 30 }) /* the lie */
      }
      return ok(screen)
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
    const get = calls.findLastIndex(c =>
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

  it('FALLS BACK TO THE MENU INSTEAD OF GIVING UP', async () => {
    const pod = podThatRefusesExact()
    const got = await applyScreen(
      'pod:8080',
      'pw',
      { width: 360, height: 664, rate: 30 },
      pod.fetcher as never
    )
    expect(`${got.width}x${got.height}`).toBe('800x1600')
    /*
     * The exact size, once more at one hertz less, then the menu. Nothing
     * else: every ask is a video restart.
     */
    expect(pod.asked).toEqual(['360x664', '360x664', '800x1600'])
  })

  /*
   * A pod that behaves like the real one: a new size is created at the rate
   * asked for and lands at one hertz less; its menu is frozen at start.
   */
  function podThatMakesModesAt29() {
    let screen = { width: 1280, height: 800, rate: 30 }
    const made = new Set<string>()
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
      /* Read once at start: the new mode never appears here. */
      if (url.endsWith('/configurations'))
        return ok([{ width: 800, height: 1600, rate: 30 }])
      if ((init?.method || 'GET') === 'POST') {
        const w = JSON.parse(init!.body!)
        asked.push(`${w.width}x${w.height}@${w.rate}`)
        const size = `${w.width}x${w.height}`
        if (made.has(size) && w.rate === 29) {
          screen = w
          return ok(w)
        }
        made.add(size)
        return { ok: false, status: 422, text: async () => 'no' }
      }
      return ok(screen)
    }
    return { fetcher, asked }
  }

  it('ASKS AGAIN AT ONE HERTZ LESS, not from the menu', async () => {
    /*
     * Photographed by the owner: black edges either side, because the
     * fallback went to the menu -- which never lists a mode made after the
     * pod started -- and landed on 800x1600.
     */
    const pod = podThatMakesModesAt29()
    const got = await applyScreen(
      'pod:8080',
      'pw',
      { width: 368, height: 536, rate: 30 },
      pod.fetcher as never
    )
    expect(`${got.width}x${got.height}`).toBe('368x536')
    expect(pod.asked).toEqual(['368x536@30', '368x536@29'])
  })

  it('does not retry a polite no, which is not a rate problem', async () => {
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
      if (url.endsWith('/configurations')) return ok([])
      if ((init?.method || 'GET') === 'POST') {
        asked.push(JSON.parse(init!.body!).rate + '')
        return ok(JSON.parse(init!.body!))
      }
      return ok({ width: 1280, height: 800, rate: 30 })
    }
    await applyScreen(
      'pod:8080',
      'pw',
      { width: 368, height: 536, rate: 30 },
      fetcher as never
    )
    expect(asked).toEqual(['30'])
  })

  it('DOES NOT TOUCH A SCREEN THAT IS ALREADY THE RIGHT SHAPE', async () => {
    /* Every ask restarts the video, so the cheapest ask is the one not made. */
    const asked: string[] = []
    const fetcher = async (url: string, init?: { method?: string }) => {
      const ok = (o: unknown) => ({
        ok: true,
        status: 200,
        text: async () => JSON.stringify(o),
      })
      if (url.endsWith('/api/login')) return ok({ token: 'b' })
      if ((init?.method || 'GET') === 'POST') {
        asked.push('post')
        return ok({})
      }
      return ok({ width: 368, height: 536, rate: 29 })
    }
    const got = await applyScreen(
      'pod:8080',
      'pw',
      { width: 368, height: 544, rate: 30 },
      fetcher as never
    )
    expect(asked).toEqual([])
    expect(got).toEqual({ width: 368, height: 536, rate: 29 })
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
    expect(asked).toEqual(['393', '800'])
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

describe('one fit at a time', () => {
  it('RUNS TWO FITS FOR ONE POD IN TURN, never side by side', async () => {
    const log: string[] = []
    let release!: () => void
    const gate = new Promise<void>(r => (release = r))
    const io = (name: string, wait?: Promise<void>) => ({
      apply: async () => {
        log.push(`${name} start`)
        if (wait) await wait
        log.push(`${name} end`)
        return { width: 368, height: 536, rate: 29 }
      },
      fitWindow: async () => 1,
    })
    const desk = { endpoint: 'pod:1', adminToken: 'pw', cdpEndpoint: null }
    const want = { width: 368, height: 536, rate: 30 }
    const first = fitDesktop(desk, want, io('app', gate))
    const second = fitDesktop(desk, want, io('window'))
    await new Promise(r => setTimeout(r, 0))
    expect(log).toEqual(['app start'])
    release()
    await Promise.all([first, second])
    expect(log).toEqual(['app start', 'app end', 'window start', 'window end'])
  })

  it('does not hold one pod behind another', async () => {
    const log: string[] = []
    const never = new Promise<void>(() => {})
    const slow = {
      apply: async () => {
        log.push('a')
        await never
        return { width: 1, height: 1, rate: 1 }
      },
      fitWindow: async () => 1,
    }
    const fast = {
      apply: async () => {
        log.push('b')
        return { width: 1, height: 1, rate: 1 }
      },
      fitWindow: async () => 1,
    }
    const want = { width: 368, height: 536, rate: 30 }
    void fitDesktop({ endpoint: 'pod:a', adminToken: 'x' }, want, slow)
    await fitDesktop({ endpoint: 'pod:b', adminToken: 'x' }, want, fast)
    expect(log).toEqual(['a', 'b'])
  })

  it('a failed fit does not block the one queued behind it', async () => {
    const want = { width: 368, height: 536, rate: 30 }
    const desk = { endpoint: 'pod:c', adminToken: 'x' }
    const failing = fitDesktop(desk, want, {
      apply: async () => {
        throw new Error('pod down')
      },
      fitWindow: async () => 1,
    })
    const queued = fitDesktop(desk, want, {
      apply: async () => ({ ...want }),
      fitWindow: async () => 1,
    })
    await expect(failing).rejects.toThrow('pod down')
    expect(await queued).toEqual(want)
  })
})
