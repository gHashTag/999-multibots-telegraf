import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { corners, parseMark } from './logoFacets'

// The real mark, read from the one file that holds it.
const svg = readFileSync(
  path.join(__dirname, '..', '..', '..', 'public', 't27-mark.svg'),
  'utf8'
)

describe('logoFacets', () => {
  it('reads absolute and relative corners', () => {
    expect(corners('M0 0 L10 0 V10 H0 Z')).toEqual([
      [0, 0],
      [10, 0],
      [10, 10],
      [0, 10],
    ])
    expect(corners('m5 5 l5 0 v5 h-5 z')).toEqual([
      [5, 5],
      [10, 5],
      [10, 10],
      [5, 10],
    ])
  })

  it('finds all 27 facets of the t27 mark, spread around its centre', () => {
    const mark = parseMark(svg)
    expect(mark).not.toBeNull()
    expect(mark!.facets).toHaveLength(27)
    for (const f of mark!.facets) {
      expect(f.angle).toBeGreaterThanOrEqual(0)
      expect(f.angle).toBeLessThan(1)
      expect(f.radius).toBeGreaterThanOrEqual(0)
      expect(f.radius).toBeLessThanOrEqual(1)
    }
    expect(Math.max(...mark!.facets.map(f => f.radius))).toBeCloseTo(1)
  })

  it('is null for text that is not a mark', () => {
    expect(parseMark('<html></html>')).toBeNull()
  })
})
