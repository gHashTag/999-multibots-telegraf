import { describe, expect, it } from 'vitest'
import { QUIET_ZONE, qrModules, qrPath } from './qrMatrix'

/**
 * THE CODE ON SCREEN HAS TO BE A QR CODE, NOT A PICTURE OF ONE.
 *
 * Nothing here can scan. What can be checked without a camera is what every
 * scanner looks for first: a square grid with the three finder patterns in
 * their corners -- and that the path we draw is that grid, module for module,
 * with the quiet zone a scanner needs around it.
 */

/**
 * A login link of the real length, built from a short seed: a long literal
 * that looks like a token is exactly what the secret guard is there to stop,
 * and a made-up one should not need an exemption from it.
 */
const link = (seed: string) => `tg://login?token=${seed.repeat(16)}`
const LOGIN = link('AQJm')

/** 7x7: dark ring, light ring, dark 3x3 heart. */
function isFinder(m: boolean[][], top: number, left: number): boolean {
  for (let r = 0; r < 7; r++) {
    for (let c = 0; c < 7; c++) {
      const ring = Math.max(Math.abs(r - 3), Math.abs(c - 3))
      const dark = ring !== 2
      if (m[top + r][left + c] !== dark) return false
    }
  }
  return true
}

describe('the grid', () => {
  it('is square, and big enough for a login link', () => {
    const m = qrModules(LOGIN)
    expect(m.length).toBeGreaterThanOrEqual(33)
    for (const row of m) expect(row).toHaveLength(m.length)
    // Every version is 17 + 4n modules wide: anything else is not a QR code.
    expect((m.length - 17) % 4).toBe(0)
  })

  it('has a finder pattern in three corners, and not in the fourth', () => {
    const m = qrModules(LOGIN)
    const far = m.length - 7
    expect(isFinder(m, 0, 0)).toBe(true)
    expect(isFinder(m, 0, far)).toBe(true)
    expect(isFinder(m, far, 0)).toBe(true)
    expect(isFinder(m, far, far)).toBe(false)
  })

  it('is the right way round: the one fixed dark module sits where the standard puts it', () => {
    /*
     * The three finder patterns look the same in a grid mirrored along its
     * diagonal, so they cannot tell rows from columns. One module can: the
     * standard fixes a dark one at row n-8, column 8, and its mirror image
     * lands in the format bits, which vary with the mask. Several links, so
     * that at least one of them picks a mask whose format bit there is light.
     */
    const links = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'].map(x =>
      link(`AQ${x}m`)
    )
    const mirrored: boolean[] = []
    for (const link of links) {
      const m = qrModules(link)
      expect(m[m.length - 8][8], link).toBe(true)
      mirrored.push(m[8][m.length - 8])
    }
    // If every mirror cell were dark too, this test could not see a swap.
    expect(mirrored).toContain(false)
  })

  it('changes when the token changes: the renewed code is a different code', () => {
    const a = JSON.stringify(qrModules(LOGIN))
    const b = JSON.stringify(qrModules(link('AQJn')))
    expect(a).not.toBe(b)
  })
})

describe('the path', () => {
  it('draws exactly the dark modules, each moved in by the quiet zone', () => {
    const m = [
      [true, false],
      [false, true],
    ]
    expect(qrPath(m)).toBe(
      `M${QUIET_ZONE} ${QUIET_ZONE}h1v1h-1z` +
        `M${QUIET_ZONE + 1} ${QUIET_ZONE + 1}h1v1h-1z`
    )
  })

  it('has one square per dark module of a real code, no more and no fewer', () => {
    const m = qrModules(LOGIN)
    const dark = m.flat().filter(Boolean).length
    expect(qrPath(m).split('M').length - 1).toBe(dark)
    // A code is roughly half dark; "all" or "none" would mean a broken grid.
    expect(dark).toBeGreaterThan(m.length * m.length * 0.3)
    expect(dark).toBeLessThan(m.length * m.length * 0.7)
  })
})
