import { readFileSync } from 'node:fs'
import { describe, expect, it, vi } from 'vitest'
import {
  NO_TEXT_SUFFIX,
  backgroundPrompt,
  drawPlan,
  drawPosterFacts,
  overlayFactsOnPicture,
  overlayOn,
  overlayRefusedHint,
  posterFactsFrom,
  type CanvasKit,
} from './poster-facts-draw'
import { factsIn } from './printed-facts'
import { layoutPosterFacts } from './poster-facts-layout'

const PROMPT = 'jazz poster, 25 октября в 19:00, вход 1 500 ₽'

/*
 * Every test that touches the real canvas gets this budget (#3742). The
 * drawing is ~0.3 s; what blows vitest's 5 s default is the first canvas
 * call in a fresh worker loading cairo and fontconfig, plus importing
 * ./tools -- CPU-bound work whose wall time scales with machine load
 * (8.4 s seen at load average 14.7). Whichever canvas test runs first pays
 * it, so all of them carry the same budget, not only the one that failed.
 */
const CANVAS_TIMEOUT_MS = 30_000

/*
 * Budget for a test that imports ./tools (or ./routes) itself (#3750). That
 * import is CPU-bound -- ~1.5 s cold on an idle machine, 4.4-5.0 s at load
 * ~25 -- and is free only when an earlier test in the file already paid it.
 * Run alone (`-t`, a reorder) the test pays it under vitest's 5 s default.
 */
const SLOW_IMPORT_TIMEOUT_MS = 30_000

async function blank(w: number, h: number): Promise<Buffer> {
  const { createCanvas } = await import('canvas')
  const c = createCanvas(w, h)
  const g = c.getContext('2d')
  g.fillStyle = '#ffffff'
  g.fillRect(0, 0, w, h)
  return c.toBuffer('image/png')
}

async function pixel(png: Buffer, x: number, y: number) {
  const { createCanvas, loadImage } = await import('canvas')
  const img = await loadImage(png)
  const c = createCanvas(img.width, img.height)
  const g = c.getContext('2d')
  g.drawImage(img, 0, 0)
  return Array.from(g.getImageData(x, y, 1, 1).data)
}

describe('the POSTER_FACTS_OVERLAY flag', () => {
  it('is on by default and off only at "0"', () => {
    expect(overlayOn({})).toBe(true)
    expect(overlayOn({ POSTER_FACTS_OVERLAY: '1' })).toBe(true)
    expect(overlayOn({ POSTER_FACTS_OVERLAY: '0' })).toBe(false)
  })
})

describe('facts from the prompt', () => {
  it('dates then times make one line, the price another', () => {
    const pf = posterFactsFrom(factsIn(PROMPT))
    expect(pf.date_time).toBe('25 октября, 19:00')
    expect(pf.price).toContain('1 500')
    expect(pf.title).toBeUndefined()
    expect(pf.venue).toBeUndefined()
  })

  it('a prompt with no fact gives nothing to draw', () => {
    expect(posterFactsFrom(factsIn('a calm sea at dawn'))).toEqual({})
  })
})

describe('the background prompt', () => {
  it('asks for no text when code prints the facts', () => {
    expect(backgroundPrompt(PROMPT, factsIn(PROMPT), {})).toBe(
      PROMPT + NO_TEXT_SUFFIX
    )
  })
  it('is unchanged with no facts or with the flag off', () => {
    expect(backgroundPrompt('a sea', [], {})).toBe('a sea')
    expect(
      backgroundPrompt(PROMPT, factsIn(PROMPT), { POSTER_FACTS_OVERLAY: '0' })
    ).toBe(PROMPT)
  })
})

describe('drawPlan', () => {
  const layout = layoutPosterFacts(
    { date_time: '19:00', price: '50%' },
    { width: 1024, height: 1536 }
  )
  if (!layout.fits) throw new Error('the sample must fit')

  it('a plate, then one white line per box, text as is (19:00, 50%)', () => {
    const plan = drawPlan(layout, () => 1)
    expect(plan.ok).toBe(true)
    if (!plan.ok) return
    expect(plan.ops[0]).toMatchObject({ op: 'plate', fill: 'rgba(0,0,0,0.55)' })
    const texts = plan.ops.filter(o => o.op === 'text')
    expect(texts.map(o => (o as { text: string }).text)).toEqual([
      '19:00',
      '50%',
    ])
    expect(texts.every(o => o.fill === '#ffffff')).toBe(true)
  })

  it('a line exactly as wide as its box is drawn', () => {
    expect(drawPlan(layout, () => layout.lines[0].width).ok).toBe(true)
  })

  it('a line one pixel wider than its box refuses the plan, naming the fact', () => {
    const plan = drawPlan(layout, t =>
      t === '50%' ? layout.lines[1].width + 1 : 1
    )
    expect(plan).toMatchObject({ ok: false, refused: 'price' })
  })

  it('no lines, no plate', () => {
    expect(drawPlan({ plate: layout.plate, lines: [] }, () => 1)).toEqual({
      ok: true,
      ops: [],
    })
  })
})

describe('drawPosterFacts on a real canvas', () => {
  // The first canvas call in a fresh process loads cairo and fontconfig; on
  // a cold tree under load that alone took 7 s once.
  it(
    'darkens the bottom and paints white text there; the top is untouched',
    async () => {
      const r = await drawPosterFacts(await blank(768, 768), {
        date_time: '25 октября, 19:00',
        price: '50%',
      })
      expect(r.drawn).toBe(true)
      if (!r.drawn) return
      expect(r.lines).toEqual(['25 октября, 19:00', '50%'])
      expect(await pixel(r.bytes, 5, 5)).toEqual([255, 255, 255, 255])
      const plate = await pixel(r.bytes, 767, 767)
      expect(plate[0]).toBeLessThan(130)
      expect(plate[0]).toBeGreaterThan(100)
    },
    CANVAS_TIMEOUT_MS
  )

  it(
    'a fact the layout refuses leaves the picture undrawn',
    async () => {
      const r = await drawPosterFacts(await blank(768, 768), {
        price: 'x'.repeat(400),
      })
      expect(r).toMatchObject({ drawn: false, refused: 'price' })
    },
    CANVAS_TIMEOUT_MS
  )
})

describe('overlayFactsOnPicture', () => {
  const bytes = Buffer.from('picture')
  const kit = (
    width: number | ((text: string) => number)
  ): CanvasKit & { toBuffer: ReturnType<typeof vi.fn> } => {
    const toBuffer = vi.fn(() => Buffer.from('drawn'))
    const g = {
      measureText: (text: string) => ({
        width: typeof width === 'number' ? width : width(text),
      }),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
    }
    return {
      toBuffer,
      loadImage: async () => ({ width: 1024, height: 1536 }),
      createCanvas: () => ({ getContext: () => g, toBuffer }),
    }
  }

  it('draws the facts and hands back a png', async () => {
    const k = kit(10)
    const out = await overlayFactsOnPicture(
      factsIn(PROMPT),
      bytes,
      'image/jpeg',
      { env: {}, kit: k }
    )
    expect(out.bytes.toString()).toBe('drawn')
    expect(out.contentType).toBe('image/png')
    expect(out.note).toEqual({
      drawn: ['25 октября, 19:00', '1 500 ₽'],
      title: 'none',
    })
  })

  // #3729: the background is asked for no text, so a poster with facts and
  // no passed title has no title at all -- and the agent must hear that.
  it('no title passed: the note and the hint say the poster has none', async () => {
    const out = await overlayFactsOnPicture(
      factsIn(PROMPT),
      bytes,
      'image/jpeg',
      { env: {}, kit: kit(10) }
    )
    expect(overlayRefusedHint(out.note)).toContain('НЕТ названия')
  })

  it('a passed title is drawn first, above the facts, and the hint is quiet', async () => {
    const out = await overlayFactsOnPicture(
      factsIn(PROMPT),
      bytes,
      'image/jpeg',
      { env: {}, kit: kit(10), title: '  Jazz   Night ' }
    )
    expect(out.note).toEqual({
      drawn: ['Jazz Night', '25 октября, 19:00', '1 500 ₽'],
      title: 'drawn',
    })
    expect(out.contentType).toBe('image/png')
    expect(overlayRefusedHint(out.note)).toBe('')
  })

  it('a title too wide is dropped and named; the facts are still drawn', async () => {
    const wideTitle = (t: string) => (t === 'Jazz Night' ? 5000 : 10)
    const out = await overlayFactsOnPicture(
      factsIn(PROMPT),
      bytes,
      'image/jpeg',
      { env: {}, kit: kit(wideTitle), title: 'Jazz Night' }
    )
    expect(out.bytes.toString()).toBe('drawn')
    expect(out.note).toMatchObject({
      drawn: ['25 октября, 19:00', '1 500 ₽'],
      title: 'refused',
    })
    expect(overlayRefusedHint(out.note)).toContain('Название НЕ напечатано')
  })

  it('a title alone, with no date, time or price, leaves the picture to the model', async () => {
    const k = kit(10)
    const out = await overlayFactsOnPicture([], bytes, 'image/jpeg', {
      env: {},
      kit: k,
      title: 'Jazz Night',
    })
    expect(out).toEqual({ bytes, contentType: 'image/jpeg' })
    expect(k.toBuffer).not.toHaveBeenCalled()
  })

  it('a line wider than its box keeps the picture and says so', async () => {
    const k = kit(5000)
    const out = await overlayFactsOnPicture(
      factsIn(PROMPT),
      bytes,
      'image/jpeg',
      { env: {}, kit: k }
    )
    expect(out.bytes).toBe(bytes)
    expect(out.contentType).toBe('image/jpeg')
    expect(out.note).toMatchObject({ drawn: false, refused: 'date_time' })
    expect(k.toBuffer).not.toHaveBeenCalled()
    expect(overlayRefusedHint(out.note)).toContain('НЕ напечатаны')
    expect(overlayRefusedHint(out.note)).toContain('названия на ней тоже нет')
  })

  it('does nothing with the flag off or with no facts', async () => {
    const k = kit(10)
    const off = await overlayFactsOnPicture(
      factsIn(PROMPT),
      bytes,
      'image/jpeg',
      {
        env: { POSTER_FACTS_OVERLAY: '0' },
        kit: k,
      }
    )
    expect(off).toEqual({ bytes, contentType: 'image/jpeg' })
    const none = await overlayFactsOnPicture([], bytes, 'image/jpeg', {
      env: {},
      kit: k,
    })
    expect(none).toEqual({ bytes, contentType: 'image/jpeg' })
    expect(k.toBuffer).not.toHaveBeenCalled()
  })

  it('a picture that cannot be decoded keeps its bytes and never throws', async () => {
    const broken: CanvasKit = {
      loadImage: async () => {
        throw new Error('unsupported image type')
      },
      createCanvas: () => {
        throw new Error('unreachable')
      },
    }
    const out = await overlayFactsOnPicture(
      factsIn(PROMPT),
      bytes,
      'image/webp',
      { env: {}, kit: broken }
    )
    expect(out.bytes).toBe(bytes)
    expect(out.note).toMatchObject({ drawn: false, refused: 'error' })
  })
})

describe('image_generate is wired to the overlay', () => {
  const src = readFileSync(new URL('./tools.ts', import.meta.url), 'utf8')
  const body = src.slice(
    src.indexOf("name: 'image_generate'"),
    src.indexOf("name: 'audio_generate'")
  )
  it('asks for a text-free background, draws before upload, keeps the self-check', () => {
    expect(body).toMatch(/backgroundPrompt\(String\(args\.prompt\), printed\)/)
    const draw = body.indexOf('overlayFactsOnPicture(')
    expect(draw).toBeGreaterThan(-1)
    expect(draw).toBeLessThan(body.indexOf('/upload`'))
    expect(body).toContain('factsOverlay: drawn.note')
    expect(body).toContain('notOnPicture: look.missing')
    expect(body).toMatch(/lookAtOwnPicture\(String\(args\.prompt\), bytes\)/)
  })
})

/*
 * THE STORED FILE IS THE DRAWN ONE (#3729).
 *
 * Driven through the handler, not read off the source: the provider hands
 * back a picture labelled image/jpeg, the overlay turns it into a PNG, and
 * the upload must carry the PNG's bytes under image/png and a .png name.
 * Taking the content type from the provider's header again would store a
 * PNG as .jpg; uploading the provider's bytes would store a poster with no
 * facts on it.
 */
describe('image_generate uploads the drawn png', () => {
  it(
    'bytes, content type and file name are the drawn picture',
    async () => {
      const source = await blank(768, 1152)
      const uploads: {
        type: string | null
        name: string | null
        body: Buffer
      }[] = []
      const realFetch = globalThis.fetch
      const saved = {
        VISION_API_KEY: process.env.VISION_API_KEY,
        POSTER_FACTS_OVERLAY: process.env.POSTER_FACTS_OVERLAY,
      }
      delete process.env.VISION_API_KEY
      delete process.env.POSTER_FACTS_OVERLAY
      globalThis.fetch = (async (url: string, init: RequestInit = {}) => {
        const u = String(url)
        if (u.endsWith('/api/generate/image'))
          return new Response(
            JSON.stringify({
              url: 'https://provider.test/p.jpg',
              provider: 'kie',
            }),
            { headers: { 'content-type': 'application/json' } }
          )
        if (u === 'https://provider.test/p.jpg')
          return new Response(new Uint8Array(source), {
            headers: { 'content-type': 'image/jpeg' },
          })
        if (u.endsWith('/upload')) {
          const h = new Headers(init.headers)
          uploads.push({
            type: h.get('Content-Type'),
            name: h.get('X-Filename'),
            body: Buffer.from(init.body as Uint8Array),
          })
          return new Response(
            JSON.stringify({ directUrl: 'https://s3.test/agent-image.png' }),
            { headers: { 'content-type': 'application/json' } }
          )
        }
        return new Response('{}', { status: 404 })
      }) as typeof fetch
      const pool = {
        query: async () => ({
          rows: [{ n: 0, id: 7, balance: 50 }],
          rowCount: 1,
        }),
      }
      try {
        const { TOOLS_BY_NAME } = await import('./tools')
        const out: any = await TOOLS_BY_NAME.get('image_generate')!.handler(
          { prompt: PROMPT, title: 'Jazz Night' },
          {
            telegramId: '1',
            pool,
            chargeLater: true,
            heard: 'афиша: Jazz Night, 25 октября в 19:00, вход 1 500 ₽',
          } as never
        )
        expect(out['сделано']).toBe(true)
        expect(out.factsOverlay).toMatchObject({ title: 'drawn' })
        expect(uploads).toHaveLength(1)
        expect(uploads[0].type).toBe('image/png')
        expect(uploads[0].name).toMatch(/\.png$/)
        expect(uploads[0].body.equals(source)).toBe(false)
        expect(uploads[0].body.subarray(1, 4).toString()).toBe('PNG')
        // The bottom is darkened by the plate; the provider's picture was white.
        const bottom = await pixel(uploads[0].body, 5, 1140)
        expect(bottom[0]).toBeLessThan(200)
      } finally {
        globalThis.fetch = realFetch
        for (const [k, v] of Object.entries(saved))
          if (v === undefined) delete process.env[k]
          else process.env[k] = v
      }
    },
    CANVAS_TIMEOUT_MS
  )

  it(
    'a date hidden in the title is asked about before any charge',
    async () => {
      const untouchable = {
        query: () => {
          throw new Error('the database was reached: a charge could follow')
        },
      }
      const { TOOLS_BY_NAME } = await import('./tools')
      const out: any = await TOOLS_BY_NAME.get('image_generate')!.handler(
        { prompt: 'jazz poster', title: 'Jazz Night 8 October 11:30' },
        { telegramId: '1', pool: untouchable, heard: 'сделай афишу' } as never
      )
      expect(out['сделано']).toBe(false)
      expect(String(out['причина'])).toContain('«11:30»')
    },
    SLOW_IMPORT_TIMEOUT_MS
  )
})
