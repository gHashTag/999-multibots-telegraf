/*
 * POSTER FACTS ARE DRAWN BY CODE, NOT BY THE PICTURE MODEL (#3717, #3701).
 *
 * A picture model asked for "19:00, 1 500 ₽" prints "19:0O" or nothing at
 * all, and the vision self-check (#3660) can only say so afterwards. So the
 * background is asked for no text, and the facts the person confirmed are
 * drawn on top: a dark plate across the bottom, white bold lines, placed by
 * poster-facts-layout.ts (the t27 spec poster-facts-overlay).
 *
 * The layout counts characters at an average advance; the drawer measures
 * the real glyphs. A line wider than its box is REFUSED here, never cut and
 * never squeezed past the box: the spec's "a fact is never truncated" holds
 * for the font that actually paints, not only for the average.
 *
 * The title is drawn only when the agent passes it explicitly (#3729): the
 * background is asked for no text at all, so a poster with facts and no
 * passed title has NO title, and the tool result says so instead of letting
 * the agent describe one. A title too wide to fit is dropped and named; the
 * facts are still drawn.
 *
 * Font: Liberation Sans Bold (fonts-liberation in render/Dockerfile), falling
 * back to DejaVu Sans for glyphs Liberation 1.07 lacks (the rouble sign).
 */
import type { Fact } from './printed-facts'
import {
  layoutPosterFacts,
  type LineBox,
  type Plate,
  type PosterFacts,
} from './poster-facts-layout'

export const POSTER_FONT_FAMILY = '"Liberation Sans", "DejaVu Sans", sans-serif'
export const fontFor = (px: number) => `bold ${px}px ${POSTER_FONT_FAMILY}`

/** Off only when POSTER_FACTS_OVERLAY is exactly "0". */
export function overlayOn(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.POSTER_FACTS_OVERLAY !== '0'
}

/** Appended to the background prompt while code draws the facts. */
export const NO_TEXT_SUFFIX =
  '\n\nNo text, letters, digits or logos anywhere on the picture. ' +
  'Keep the bottom third calm and uncluttered: the poster text is added on top later.'

/**
 * The lines the overlay can print from what factsIn found in the prompt:
 * dates then times as one date_time line, prices as the price line, and the
 * title the agent passed explicitly. The title is never guessed from the
 * prompt; venue has no confirmed source yet.
 */
export function posterFactsFrom(facts: Fact[], title?: string): PosterFacts {
  const of = (kind: Fact['kind']) =>
    facts.filter(f => f.kind === kind).map(f => f.text.trim())
  const dateTime = [...of('date'), ...of('time')].filter(Boolean).join(', ')
  const price = of('price').filter(Boolean).join(' / ')
  const out: PosterFacts = {}
  const t = (title ?? '').replace(/\s+/g, ' ').trim()
  if (t) out.title = t
  if (dateTime) out.date_time = dateTime
  if (price) out.price = price
  return out
}

export type DrawOp =
  | {
      op: 'plate'
      x: number
      y: number
      width: number
      height: number
      fill: string
    }
  | {
      op: 'text'
      text: string
      x: number
      y: number
      font: string
      fill: string
    }

export type DrawPlan =
  | { ok: true; ops: DrawOp[] }
  | { ok: false; refused: string; reason: string }

/**
 * Pure: the draw operations for a layout, given a measure for the real
 * font. A line whose measured width exceeds its box refuses the whole plan.
 */
export function drawPlan(
  layout: { plate: Plate; lines: LineBox[] },
  measure: (text: string, font: string) => number
): DrawPlan {
  const { plate, lines } = layout
  if (!lines.length) return { ok: true, ops: [] }
  const ops: DrawOp[] = [
    {
      op: 'plate',
      x: plate.x,
      y: plate.y,
      width: plate.width,
      height: plate.height,
      fill: `rgba(0,0,0,${plate.opacity})`,
    },
  ]
  for (const l of lines) {
    const font = fontFor(l.fontPx)
    const real = measure(l.text, font)
    if (real > l.width)
      return {
        ok: false,
        refused: l.kind,
        reason: `"${l.text}" is ${Math.ceil(real)} px wide at ${l.fontPx} px, the box is ${l.width} px`,
      }
    ops.push({
      op: 'text',
      text: l.text,
      x: l.x,
      y: l.y,
      font,
      fill: '#ffffff',
    })
  }
  return { ok: true, ops }
}

export type DrawResult =
  | { drawn: true; bytes: Buffer; contentType: 'image/png'; lines: string[] }
  | { drawn: false; refused: string; reason: string }

/** The canvas surface drawPosterFacts needs; node-canvas in production. */
export interface CanvasKit {
  loadImage(src: Buffer): Promise<{ width: number; height: number }>
  createCanvas(
    w: number,
    h: number
  ): {
    getContext(kind: '2d'): any
    toBuffer(mime: 'image/png'): Buffer
  }
}

const nodeCanvas = async (): Promise<CanvasKit> =>
  (await import('canvas')) as unknown as CanvasKit

/**
 * The picture with the facts drawn on it, or why nothing was drawn. The
 * picture's own size picks the layout row; a refused fact leaves the
 * picture untouched.
 */
export async function drawPosterFacts(
  picture: Buffer,
  facts: PosterFacts,
  kit?: CanvasKit
): Promise<DrawResult> {
  const k = kit ?? (await nodeCanvas())
  const img = await k.loadImage(picture)
  const layout = layoutPosterFacts(facts, {
    width: img.width,
    height: img.height,
  })
  if (!layout.fits)
    return {
      drawn: false,
      refused: layout.refused,
      reason:
        layout.refused === 'block'
          ? 'the facts together need more than the bottom of the picture'
          : `${layout.refused} does not fit even at the smallest size`,
    }
  if (!layout.lines.length)
    return { drawn: false, refused: 'none', reason: 'no fact to draw' }
  const c = k.createCanvas(img.width, img.height)
  const g = c.getContext('2d')
  const plan = drawPlan(layout, (text, font) => {
    g.font = font
    return g.measureText(text).width
  })
  if (!plan.ok)
    return { drawn: false, refused: plan.refused, reason: plan.reason }
  g.drawImage(img, 0, 0, img.width, img.height)
  g.textAlign = 'left'
  g.textBaseline = 'top'
  for (const op of plan.ops) {
    g.fillStyle = op.fill
    if (op.op === 'plate') g.fillRect(op.x, op.y, op.width, op.height)
    else {
      g.font = op.font
      g.fillText(op.text, op.x, op.y)
    }
  }
  return {
    drawn: true,
    bytes: c.toBuffer('image/png'),
    contentType: 'image/png',
    lines: layout.lines.map(l => l.text),
  }
}

/**
 * What image_generate reports about the overlay; absent when it did not run.
 * `title` says whether the poster carries one: 'none' = no title was passed,
 * so the text-free background has no title at all.
 */
export type OverlayNote =
  | {
      drawn: string[]
      title: 'drawn' | 'none' | 'refused'
      titleReason?: string
    }
  | { drawn: false; refused: string; reason: string }

/**
 * The prompt the background is drawn from: with the no-text line when code
 * is going to print the facts, unchanged otherwise.
 */
export function backgroundPrompt(
  prompt: string,
  facts: Fact[],
  env: NodeJS.ProcessEnv = process.env
): string {
  if (!overlayOn(env)) return prompt
  const pf = posterFactsFrom(facts)
  return pf.date_time || pf.price ? prompt + NO_TEXT_SUFFIX : prompt
}

/**
 * The picture image_generate stores: the facts drawn on it when the overlay
 * is on and the prompt carries any, the picture as it came otherwise. Never
 * throws -- a picture that cannot be decoded keeps its bytes and says why.
 */
export async function overlayFactsOnPicture(
  facts: Fact[],
  bytes: Buffer,
  contentType: string,
  opts: { env?: NodeJS.ProcessEnv; kit?: CanvasKit; title?: string } = {}
): Promise<{ bytes: Buffer; contentType: string; note?: OverlayNote }> {
  const pf = posterFactsFrom(facts, opts.title)
  if (!overlayOn(opts.env) || !(pf.date_time || pf.price))
    return { bytes, contentType }
  try {
    let r = await drawPosterFacts(bytes, pf, opts.kit)
    let titleReason: string | undefined
    // A title that does not fit is dropped, never cut; the facts it crowded
    // out are drawn without it.
    if (
      !r.drawn &&
      pf.title &&
      (r.refused === 'title' || r.refused === 'block')
    ) {
      titleReason = r.reason
      const { title: _dropped, ...rest } = pf
      r = await drawPosterFacts(bytes, rest, opts.kit)
    }
    if (r.drawn)
      return {
        bytes: r.bytes,
        contentType: r.contentType,
        note: {
          drawn: r.lines,
          title: titleReason ? 'refused' : pf.title ? 'drawn' : 'none',
          ...(titleReason ? { titleReason } : {}),
        },
      }
    return {
      bytes,
      contentType,
      note: { drawn: false, refused: r.refused, reason: r.reason },
    }
  } catch (e) {
    return {
      bytes,
      contentType,
      note: {
        drawn: false,
        refused: 'error',
        reason: `the picture could not be drawn on: ${String((e as Error)?.message ?? e).slice(0, 200)}`,
      },
    }
  }
}

/**
 * The hint sentence about what the poster lacks; empty only when the facts
 * and the title were all drawn.
 */
export function overlayRefusedHint(note?: OverlayNote): string {
  if (!note) return ''
  if (note.drawn === false)
    // cyrillic-ok: the tool's hint to the agent is Russian like the rest
    return `Дата, время и цена НЕ напечатаны на картинке (${note.reason}), названия на ней тоже нет: фон рисуется без текста. Скажи человеку честно и предложи короче формулировку.`
  if (note.title === 'none')
    // cyrillic-ok: the tool's hint to the agent is Russian like the rest
    return 'На картинке НЕТ названия: при дате и цене фон рисуется без текста. Не описывай название, которого нет; нужно — повтори с title.'
  if (note.title === 'refused')
    // cyrillic-ok: the tool's hint to the agent is Russian like the rest
    return `Название НЕ напечатано (${note.titleReason}), дата, время и цена напечатаны. Скажи человеку честно и предложи короче название.`
  return ''
}
