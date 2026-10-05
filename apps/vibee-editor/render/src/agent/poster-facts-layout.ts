/**
 * Where the exact facts of an event poster go, laid out by code over the
 * generated picture (#3701): the image model is never trusted with "19:00".
 *
 * gHashTag/t27 specs/automation/poster-facts-overlay.t27 owns every number;
 * this file mirrors its functions and imports its values. Pure: it returns
 * line boxes and the plate, and draws nothing -- the drawing step and the
 * wiring into image_generate come later.
 */
import * as SPEC from '../spec/poster-facts-overlay.gen'

export type LineKind = 'title' | 'date_time' | 'venue' | 'price'
export const LINE_ORDER = SPEC.LINE_ORDER.split(',') as LineKind[]

export type PosterFacts = Partial<Record<LineKind, string>>

export interface Canvas {
  width: number
  height: number
}

/** One printed line: its box, top-left origin, in canvas pixels. */
export interface LineBox {
  kind: LineKind
  text: string
  x: number
  y: number
  width: number
  height: number
  fontPx: number
}

export interface Plate {
  x: number
  y: number
  width: number
  height: number
  opacity: number
}

export type PosterLayout =
  | {
      fits: true
      row: 'tall' | 'square'
      margin: number
      plate: Plate
      lines: LineBox[]
    }
  | { fits: false; refused: LineKind | 'block' }

const PER_MILLE = 1000

// ---- Mirrors of the spec's fns ------------------------------------------------

export function rowFor(w: number, h: number): 'tall' | 'square' {
  return h * PER_MILLE >= w * SPEC.TALL_RATIO_PERMILLE ? 'tall' : 'square'
}

export function marginPx(w: number, h: number): number {
  return Math.floor((Math.min(w, h) * SPEC.MARGIN_PERMILLE) / PER_MILLE)
}

export function fontPx(h: number, permille: number): number {
  return Math.floor((h * permille) / PER_MILLE)
}

export function charsPerLine(contentW: number, font: number): number {
  return Math.floor(
    (contentW * PER_MILLE) / (font * SPEC.CHAR_ADVANCE_PERMILLE)
  )
}

export function linesFor(chars: number, perLine: number): number {
  return Math.ceil(chars / perLine)
}

export function lineHeightPx(font: number): number {
  return Math.floor((font * SPEC.LEADING_PERMILLE) / PER_MILLE)
}

/** The spec's character bound: the largest font for `chars` in `maxLines`. */
export function shrinkFont(
  chars: number,
  maxLines: number,
  contentW: number,
  start: number,
  floor: number
): number {
  // The same division read the other way: the font at which a line holds
  // this many chars.
  const font = charsPerLine(contentW, Math.ceil(chars / maxLines))
  if (font >= start) return start
  if (font < floor) return 0
  return font
}

export function plateOk(opacityPermille: number): boolean {
  return opacityPermille >= SPEC.PLATE_MIN_OPACITY_PERMILLE
}

export function blockFits(blockH: number, h: number): boolean {
  return blockH * PER_MILLE <= h * SPEC.BLOCK_MAX_PERMILLE
}

/**
 * Contrast x100 of white text over the plate composited onto a WHITE
 * picture, the worst background, computed on the 8-bit pixel a drawn PNG
 * holds (WCAG 2 relative luminance).
 */
export function plateContrastOverWhiteX100(opacityPermille: number): number {
  const channel = Math.round(255 * (1 - opacityPermille / PER_MILLE)) / 255
  const lum =
    channel <= 0.04045
      ? channel / 12.92
      : Math.pow((channel + 0.055) / 1.055, 2.4)
  return Math.floor((100 * 1.05) / (lum + 0.05))
}

// ---- The layout -----------------------------------------------------------------

/** Greedy word wrap at `perLine` chars; null when one word alone is longer. */
export function wrapWords(text: string, perLine: number): string[] | null {
  const lines: string[] = []
  let line = ''
  for (const word of text.split(' ')) {
    if (word.length > perLine) return null
    if (!line) line = word
    else if (line.length + 1 + word.length <= perLine) line += ` ${word}`
    else {
      lines.push(line)
      line = word
    }
  }
  if (line) lines.push(line)
  return lines
}

/** Wrap first, then shrink a pixel at a time; never below the floor, never cut. */
export function fitFact(
  text: string,
  contentW: number,
  start: number,
  floor: number,
  maxLines: number
): { fontPx: number; lines: string[] } | null {
  for (let font = start; font >= floor && font > 0; font--) {
    const lines = wrapWords(text, charsPerLine(contentW, font))
    if (lines && lines.length <= maxLines) return { fontPx: font, lines }
  }
  return null
}

function levels(row: 'tall' | 'square') {
  return row === 'tall'
    ? {
        title: SPEC.TALL_TITLE_PERMILLE,
        second: SPEC.TALL_SECOND_PERMILLE,
        detail: SPEC.TALL_DETAIL_PERMILLE,
        min: SPEC.TALL_MIN_PERMILLE,
      }
    : {
        title: SPEC.SQUARE_TITLE_PERMILLE,
        second: SPEC.SQUARE_SECOND_PERMILLE,
        detail: SPEC.SQUARE_DETAIL_PERMILLE,
        min: SPEC.SQUARE_MIN_PERMILLE,
      }
}

/**
 * Line boxes and the plate for the facts on this canvas, or which fact was
 * refused. A fact that cannot fit at its floor is refused, never truncated.
 */
export function layoutPosterFacts(
  facts: PosterFacts,
  canvas: Canvas
): PosterLayout {
  const { width: w, height: h } = canvas
  const row = rowFor(w, h)
  const lv = levels(row)
  const margin = marginPx(w, h)
  const contentW = w - 2 * margin
  const second = fontPx(h, lv.second)

  const groups: { kind: LineKind; fontPx: number; lines: string[] }[] = []
  for (const kind of LINE_ORDER) {
    const text = (facts[kind] ?? '').replace(/\s+/g, ' ').trim()
    if (!text) continue
    const isTitle = kind === 'title'
    const permille = isTitle
      ? lv.title
      : kind === 'date_time'
        ? lv.second
        : lv.detail
    const floor =
      isTitle && SPEC.TITLE_FLOOR_IS_SECOND_LEVEL ? second : fontPx(h, lv.min)
    const fit = fitFact(
      text,
      contentW,
      fontPx(h, permille),
      floor,
      isTitle ? SPEC.TITLE_MAX_LINES : SPEC.OTHER_MAX_LINES
    )
    if (!fit) return { fits: false, refused: kind }
    groups.push({ kind, ...fit })
  }

  const gap = Math.floor((second * SPEC.GROUP_GAP_PERMILLE) / PER_MILLE)
  const titleGap = groups[0]?.kind === 'title' && groups.length > 1 ? gap : 0
  const textH =
    groups.reduce((s, g) => s + g.lines.length * lineHeightPx(g.fontPx), 0) +
    titleGap
  const pad = Math.floor((margin * SPEC.PLATE_PAD_PERMILLE) / PER_MILLE)
  const blockH = pad + textH + margin
  if (!blockFits(blockH, h)) return { fits: false, refused: 'block' }

  const lines: LineBox[] = []
  let y = h - margin - textH
  for (const g of groups) {
    const lh = lineHeightPx(g.fontPx)
    for (const text of g.lines) {
      lines.push({
        kind: g.kind,
        text,
        x: margin,
        y,
        width: contentW,
        height: lh,
        fontPx: g.fontPx,
      })
      y += lh
    }
    if (g.kind === 'title') y += titleGap
  }
  return {
    fits: true,
    row,
    margin,
    plate: {
      x: 0,
      y: h - blockH,
      width: w,
      height: blockH,
      opacity: SPEC.PLATE_OPACITY_PERMILLE / PER_MILLE,
    },
    lines,
  }
}
