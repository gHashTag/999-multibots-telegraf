import { describe, expect, it } from 'vitest'
import * as SPEC from './poster-facts-overlay.gen'
import {
  LINE_ORDER,
  blockFits,
  charsPerLine,
  fontPx,
  layoutPosterFacts,
  lineHeightPx,
  linesFor,
  marginPx,
  plateContrastOverWhiteX100,
  plateOk,
  rowFor,
  shrinkFont,
  type PosterFacts,
} from '../agent/poster-facts-layout'

/**
 * gHashTag/t27 specs/automation/poster-facts-overlay.t27, vendored beside its
 * `t27c gen-ts` output; its `test` blocks run here against
 * agent/poster-facts-layout.ts, and each one also against the real layout.
 */
const TALL = { width: SPEC.TALL_W, height: SPEC.TALL_H }
const SQUARE = { width: SPEC.SQUARE_W, height: SPEC.SQUARE_H }
// 40 chars exactly, words of a real event title.
const TITLE_40 = 'Spring Jazz Night at the Old River Tower'
const FOUR: PosterFacts = {
  title: TITLE_40,
  date_time: '12 October, 19:00',
  venue: 'Loft Hall, Main Street 5',
  price: '1 500 RUB',
}

function laid(facts: PosterFacts, canvas = TALL) {
  const l = layoutPosterFacts(facts, canvas)
  if (!l.fits) throw new Error(`refused ${l.refused}`)
  return l
}

describe('poster-facts-overlay.t27 against the host', () => {
  it("VERSION says what the header's last note says", () => {
    expect(SPEC.VERSION).toBe(1)
  })

  it('the tall canvas takes the tall row and both squares the square row', () => {
    expect(rowFor(SPEC.TALL_W, SPEC.TALL_H)).toBe('tall')
    expect(rowFor(SPEC.SQUARE_W, SPEC.SQUARE_H)).toBe('square')
    expect(rowFor(1024, 1024)).toBe('square')
    expect(rowFor(1000, 1200)).toBe('tall')
    expect(rowFor(1000, 1199)).toBe('square')
    expect(laid(FOUR, TALL).row).toBe('tall')
    expect(laid(FOUR, SQUARE).row).toBe('square')
  })

  it('margins are six per cent of the short side on both canvases', () => {
    expect(marginPx(SPEC.TALL_W, SPEC.TALL_H)).toBe(61)
    expect(marginPx(SPEC.SQUARE_W, SPEC.SQUARE_H)).toBe(46)
    expect(marginPx(1536, 1024)).toBe(61)
    for (const c of [TALL, SQUARE]) {
      const l = laid(FOUR, c)
      for (const b of l.lines) {
        expect(b.x).toBe(l.margin)
        expect(b.x + b.width).toBe(c.width - l.margin)
      }
      const last = l.lines[l.lines.length - 1]
      expect(last.y + last.height).toBe(c.height - l.margin)
    }
  })

  it('each level is about 1.6x the one below and the floor is under the detail', () => {
    expect(fontPx(SPEC.TALL_H, SPEC.TALL_TITLE_PERMILLE)).toBe(92)
    expect(fontPx(SPEC.TALL_H, SPEC.TALL_SECOND_PERMILLE)).toBe(58)
    expect(fontPx(SPEC.TALL_H, SPEC.TALL_DETAIL_PERMILLE)).toBe(36)
    expect(fontPx(SPEC.TALL_H, SPEC.TALL_MIN_PERMILLE)).toBe(30)
    expect(fontPx(SPEC.SQUARE_H, SPEC.SQUARE_TITLE_PERMILLE)).toBe(61)
    expect(fontPx(SPEC.SQUARE_H, SPEC.SQUARE_SECOND_PERMILLE)).toBe(38)
    expect(fontPx(SPEC.SQUARE_H, SPEC.SQUARE_DETAIL_PERMILLE)).toBe(24)
    expect(fontPx(SPEC.SQUARE_H, SPEC.SQUARE_MIN_PERMILLE)).toBe(21)
    expect(SPEC.TALL_MIN_PERMILLE).toBeLessThan(SPEC.TALL_DETAIL_PERMILLE)
    expect(SPEC.SQUARE_MIN_PERMILLE).toBeLessThan(SPEC.SQUARE_DETAIL_PERMILLE)
    // Short facts keep their level's size, in the spec's order.
    const l = laid({
      price: '500',
      title: 'Jazz',
      venue: 'Loft',
      date_time: '19:00',
    })
    expect(l.lines.map(b => b.kind)).toEqual(LINE_ORDER)
    expect(l.lines.map(b => b.fontPx)).toEqual([92, 58, 36, 36])
  })

  it('max chars per line before a wrap, per level and canvas', () => {
    expect(charsPerLine(902, 92)).toBe(16)
    expect(charsPerLine(902, 58)).toBe(25)
    expect(charsPerLine(902, 36)).toBe(41)
    expect(charsPerLine(676, 61)).toBe(18)
    expect(charsPerLine(676, 38)).toBe(29)
    expect(charsPerLine(676, 24)).toBe(46)
    // 16 chars stay on one title line at full size; 17 do not.
    expect(laid({ title: 'Sixteen chars ab' }).lines).toHaveLength(1)
    const two = laid({ title: 'Seventeen chars a' }).lines
    expect(two.map(b => b.fontPx)).toEqual([92, 92])
  })

  it('a 40-char title wraps to 2 lines after shrinking above the second level', () => {
    expect(TITLE_40).toHaveLength(40)
    expect(linesFor(40, charsPerLine(902, 92))).toBe(3)
    expect(shrinkFont(40, SPEC.TITLE_MAX_LINES, 902, 92, 58)).toBe(75)
    expect(linesFor(40, charsPerLine(902, 75))).toBe(2)
    expect(shrinkFont(40, SPEC.TITLE_MAX_LINES, 676, 61, 38)).toBe(56)
    expect(linesFor(40, charsPerLine(676, 56))).toBe(2)
    // The real word wrap lands on the spec's bound on both canvases.
    const tall = laid({ title: TITLE_40 }, TALL).lines
    expect(tall.map(b => [b.text, b.fontPx])).toEqual([
      ['Spring Jazz Night at', 75],
      ['the Old River Tower', 75],
    ])
    const sq = laid({ title: TITLE_40 }, SQUARE).lines
    expect(sq.map(b => b.fontPx)).toEqual([56, 56])
    // The title never shrinks below the second level: an unfittable title
    // is refused rather than set smaller than the date.
    expect(SPEC.TITLE_FLOOR_IS_SECOND_LEVEL).toBe(true)
    const long = 'Word '.repeat(12).trim() // 59 chars, needs 30 a line
    expect(layoutPosterFacts({ title: long }, TALL)).toEqual({
      fits: false,
      refused: 'title',
    })
    // 49 chars fit at a size just above the second level.
    const fifty = laid({ title: 'Word '.repeat(10).trim() }, TALL).lines
    expect(fifty).toHaveLength(2)
    expect(fifty[0].fontPx).toBeGreaterThanOrEqual(58)
  })

  it('a 9-char price never shrinks below the min', () => {
    expect(shrinkFont(9, 1, 902, 36, 30)).toBe(36)
    expect(shrinkFont(9, 1, 676, 24, 21)).toBe(24)
    expect(linesFor(9, charsPerLine(676, 24))).toBe(1)
    for (const c of [TALL, SQUARE]) {
      const price = laid(FOUR, c).lines.filter(b => b.kind === 'price')
      expect(price).toHaveLength(1)
      expect(price[0].text).toBe('1 500 RUB')
      expect(price[0].fontPx).toBe(
        fontPx(
          c.height,
          c === TALL ? SPEC.TALL_DETAIL_PERMILLE : SPEC.SQUARE_DETAIL_PERMILLE
        )
      )
    }
  })

  it('a fact too long to fit is refused, never cut', () => {
    expect(SPEC.FACT_NEVER_TRUNCATED).toBe(true)
    expect(shrinkFont(90, SPEC.OTHER_MAX_LINES, 676, 24, 21)).toBe(24)
    expect(shrinkFont(100, SPEC.OTHER_MAX_LINES, 676, 24, 21)).toBe(22)
    expect(shrinkFont(120, SPEC.OTHER_MAX_LINES, 676, 24, 21)).toBe(0)
    // 120 chars of venue on the square: refused, not ellipsised.
    const venue = 'Hall '.repeat(24).trim()
    expect(layoutPosterFacts({ venue }, SQUARE)).toEqual({
      fits: false,
      refused: 'venue',
    })
    // A fitting long venue keeps every character across its lines.
    const ok = 'Hall '.repeat(18).trim()
    const lines = laid({ venue: ok }, SQUARE).lines
    expect(lines.length).toBeLessThanOrEqual(SPEC.OTHER_MAX_LINES)
    expect(lines.map(b => b.text).join(' ')).toBe(ok)
    expect(lines[0].fontPx).toBeGreaterThanOrEqual(21)
  })

  it('4 facts fit inside the block limit on both canvases', () => {
    expect(lineHeightPx(75)).toBe(90)
    expect(lineHeightPx(58)).toBe(69)
    expect(lineHeightPx(36)).toBe(43)
    expect(blockFits(460, SPEC.TALL_H)).toBe(true)
    expect(blockFits(691, SPEC.TALL_H)).toBe(true)
    expect(blockFits(692, SPEC.TALL_H)).toBe(false)
    expect(blockFits(326, SPEC.SQUARE_H)).toBe(true)
    expect(blockFits(345, SPEC.SQUARE_H)).toBe(true)
    expect(blockFits(346, SPEC.SQUARE_H)).toBe(false)
    // The real layout of four facts is exactly those blocks.
    for (const [c, block] of [
      [TALL, 460],
      [SQUARE, 326],
    ] as const) {
      const l = laid(FOUR, c)
      expect(l.lines.map(b => b.kind)).toEqual([
        'title',
        'title',
        'date_time',
        'venue',
        'price',
      ])
      expect(l.plate).toMatchObject({
        x: 0,
        width: c.width,
        height: block,
        y: c.height - block,
      })
      // The title group sits apart: a gap after it, none inside it.
      const [t1, t2, date] = l.lines
      expect(t2.y).toBe(t1.y + t1.height)
      expect(date.y).toBeGreaterThan(t2.y + t2.height)
      // The text block starts inside the plate.
      expect(t1.y).toBeGreaterThan(l.plate.y)
    }
    // Missing facts leave no empty line and no title gap.
    const one = laid({ price: '500 RUB' }, SQUARE)
    expect(one.lines).toHaveLength(1)
    expect(one.plate.height).toBe(23 + lineHeightPx(24) + 46)
    expect(layoutPosterFacts({ title: '  ', venue: '' }, SQUARE)).toMatchObject(
      {
        fits: true,
        lines: [],
      }
    )
  })

  it('white on the plate keeps 4.5:1 over a white picture', () => {
    expect(SPEC.PLATE_IS_BLACK).toBe(true)
    expect(SPEC.TEXT_IS_WHITE).toBe(true)
    expect(plateOk(SPEC.PLATE_OPACITY_PERMILLE)).toBe(true)
    expect(plateOk(536)).toBe(true)
    expect(plateOk(535)).toBe(false)
    expect(SPEC.MIN_CONTRAST_X100).toBe(450)
    // The floor is the measured one: the first opacity whose 8-bit pixel
    // holds 4.5:1 over white is exactly the spec's floor.
    let first = 0
    for (let p = 0; p <= 1000 && !first; p++)
      if (plateContrastOverWhiteX100(p) >= SPEC.MIN_CONTRAST_X100) first = p
    expect(first).toBe(SPEC.PLATE_MIN_OPACITY_PERMILLE)
    expect(laid(FOUR).plate.opacity).toBe(SPEC.PLATE_OPACITY_PERMILLE / 1000)
  })
})
