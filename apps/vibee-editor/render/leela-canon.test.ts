import { describe, it, expect } from 'vitest'
import {
  ARROWS,
  BOARD_COLUMNS,
  BOARD_ROWS,
  LEELA_CTA_EN,
  LEELA_CTA_RU,
  PLANS,
  PLAN_COUNT,
  ROWS,
  SNAKES,
  START_LOKA,
  WIN_LOKA,
  boardCell,
  canonQuote,
  planInfo,
  violatesLeelaVoice,
} from './src/agent/leela-canon'

/**
 * THE BOARD IS THE ENGINE'S BOARD, NOT A DRAWING OF ONE.
 *
 * The reel draws 72 cells from these functions. A boustrophedon that starts
 * on the wrong side puts 68 in the wrong column and 72 in the wrong corner --
 * the two facts the brand brief calls out by name. So the geometry is pinned
 * here to the corners the brief names, and the texts are pinned to the file
 * they were copied from.
 */
describe('board geometry', () => {
  it('72 is the top-left corner', () => {
    expect(boardCell(72)).toEqual({ col: 0, row: 7 })
  })
  it('68 is the centre column of the top row', () => {
    expect(boardCell(68)).toEqual({ col: 4, row: 7 })
  })
  it('1 is bottom-left, 9 bottom-right', () => {
    expect(boardCell(1)).toEqual({ col: 0, row: 0 })
    expect(boardCell(9)).toEqual({ col: 8, row: 0 })
  })
  it('10 is the rightmost cell of the second row (boustrophedon)', () => {
    expect(boardCell(10)).toEqual({ col: 8, row: 1 })
    expect(boardCell(18)).toEqual({ col: 0, row: 1 })
  })
  it('every plan lands on a distinct cell inside 9x8', () => {
    const seen = new Set<string>()
    for (let p = 1; p <= PLAN_COUNT; p++) {
      const { col, row } = boardCell(p)
      expect(col).toBeGreaterThanOrEqual(0)
      expect(col).toBeLessThan(BOARD_COLUMNS)
      expect(row).toBeGreaterThanOrEqual(0)
      expect(row).toBeLessThan(BOARD_ROWS)
      seen.add(`${col},${row}`)
    }
    expect(seen.size).toBe(72)
  })
  it('constants match the engine', () => {
    expect(WIN_LOKA).toBe(68)
    expect(START_LOKA).toBe(6)
    expect(Object.keys(SNAKES)).toHaveLength(10)
    expect(Object.keys(ARROWS)).toHaveLength(10)
    // A snake head is never also an arrow foot.
    for (const k of Object.keys(SNAKES)) expect(ARROWS[Number(k)]).toBeUndefined()
  })
  it('rows cover 1..72 bottom to top', () => {
    expect(ROWS).toHaveLength(8)
    expect(ROWS[0].plans).toEqual([1, 9])
    expect(ROWS[7].plans).toEqual([64, 72])
    expect(ROWS[0].chakraRu).toBe('Муладхара')
  })
})

describe('plan texts', () => {
  it('loads 72 plans in ru and en with non-empty titles and descriptions', () => {
    for (const lang of ['ru', 'en'] as const) {
      expect(PLANS[lang]).toHaveLength(72)
      for (let p = 1; p <= 72; p++) {
        const rec = PLANS[lang][p - 1]
        expect(rec.plan).toBe(p)
        expect(rec.title.trim().length).toBeGreaterThan(0)
        expect(rec.description.trim().length).toBeGreaterThan(0)
      }
    }
  })
  it('plan 6 is Delusion (moha), row 1, Muladhara, no event', () => {
    const p = planInfo(6)
    expect(p.title).toBe('Заблуждение (моха)')
    expect(p.row).toBe(1)
    expect(p.chakra).toBe('Муладхара')
    expect(p.event).toBe('none')
    expect(p.to).toBeUndefined()
    expect(p.hooks.length).toBeGreaterThan(0)
  })
  it('plan 12 is a snake to 8; plan 17 an arrow to 69', () => {
    const s = planInfo(12)
    expect(s.event).toBe('snake')
    expect(s.to).toBe(8)
    const a = planInfo(17, 'en')
    expect(a.event).toBe('arrow')
    expect(a.to).toBe(69)
    expect(a.title).toBe('Compassion (daya)')
  })
  it('68 sits in row 8, beyond the chakras', () => {
    expect(planInfo(68).row).toBe(8)
    expect(planInfo(68, 'en').chakra).toBe('beyond the chakras')
  })
  it('hooks are at most 12 words', () => {
    for (const lang of ['ru', 'en'] as const) {
      for (let p = 1; p <= 72; p++) {
        for (const h of planInfo(p, lang).hooks) {
          expect(h.split(/\s+/).length, `${lang} ${p}: ${h}`).toBeLessThanOrEqual(12)
        }
      }
    }
  })
  it('canonQuote never exceeds the budget and ends at a sentence when possible', () => {
    for (let p = 1; p <= 72; p++) {
      const q = canonQuote(planInfo(p).description, 220)
      expect(q.length).toBeLessThanOrEqual(220)
      expect(q.length).toBeGreaterThan(0)
    }
    expect(canonQuote('Раз. Два. Три.', 10)).toBe('Раз. Два.')
  })
})

describe('voice check', () => {
  it('flags urgency, praise and a Stars price', () => {
    const hits = violatesLeelaVoice('Срочно! Вы молодец, 150 ⭐')
    expect(hits.length).toBeGreaterThanOrEqual(3)
  })
  it('accepts the approved CTA', () => {
    expect(violatesLeelaVoice(LEELA_CTA_RU)).toEqual([])
    expect(violatesLeelaVoice(LEELA_CTA_EN)).toEqual([])
  })
  it('flags forbidden claims and XTR prices', () => {
    expect(violatesLeelaVoice('единственный настоящий оракул').length).toBe(1)
    expect(violatesLeelaVoice('150 XTR month').length).toBe(1)
  })
})
