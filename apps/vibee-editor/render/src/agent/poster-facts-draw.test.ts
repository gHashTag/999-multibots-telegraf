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
  it('darkens the bottom and paints white text there; the top is untouched', async () => {
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
  })

  it('a fact the layout refuses leaves the picture undrawn', async () => {
    const r = await drawPosterFacts(await blank(768, 768), {
      price: 'x'.repeat(400),
    })
    expect(r).toMatchObject({ drawn: false, refused: 'price' })
  })
})

describe('overlayFactsOnPicture', () => {
  const bytes = Buffer.from('picture')
  const kit = (
    width: number
  ): CanvasKit & { toBuffer: ReturnType<typeof vi.fn> } => {
    const toBuffer = vi.fn(() => Buffer.from('drawn'))
    const g = {
      measureText: () => ({ width }),
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
    expect(out.note).toEqual({ drawn: ['25 октября, 19:00', '1 500 ₽'] })
    expect(overlayRefusedHint(out.note)).toBe('')
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
