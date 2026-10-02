/**
 * The 27 facets of the t27 mark, read from the mark itself.
 *
 * The geometry lives in exactly one place, public/t27-mark.svg (the same file
 * BrandLoader shows). The voice visual animates each facet on its own, so it
 * needs them as separate paths -- it reads them out of that file instead of
 * keeping a second copy here that would drift the day the mark is redrawn.
 */

export interface Facet {
  d: string
  /** Centroid of the facet's corners, in the mark's own coordinates. */
  cx: number
  cy: number
  /** Angle around the mark's centre, 0..1, clockwise from the top. */
  angle: number
  /** Distance from the centre, 0 (core) .. 1 (outermost facet). */
  radius: number
}

export interface Mark {
  viewBox: string
  cx: number
  cy: number
  facets: Facet[]
}

/** Corner points of a path made of M/L/H/V/Z, absolute or relative. */
export function corners(d: string): Array<[number, number]> {
  const out: Array<[number, number]> = []
  const tokens = d.match(/[MLHVZmlhvz]|-?\d*\.?\d+(?:e-?\d+)?/g) || []
  let cmd = 'M'
  let x = 0
  let y = 0
  let i = 0
  const num = () => Number(tokens[i++])
  while (i < tokens.length) {
    const t = tokens[i]
    if (/[A-Za-z]/.test(t)) {
      cmd = t
      i++
      if (cmd === 'Z' || cmd === 'z') continue
    }
    switch (cmd) {
      case 'M':
      case 'L':
        x = num()
        y = num()
        break
      case 'm':
      case 'l':
        x += num()
        y += num()
        break
      case 'H':
        x = num()
        break
      case 'h':
        x += num()
        break
      case 'V':
        y = num()
        break
      case 'v':
        y += num()
        break
      default:
        i++ // a command this mark does not use: skip its number
        continue
    }
    if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y])
  }
  return out
}

/** Facets out of the mark's SVG text. Empty when the text is not the mark. */
export function parseMark(svg: string): Mark | null {
  const viewBox = /viewBox="([^"]+)"/.exec(svg)?.[1]
  const ds = [...svg.matchAll(/<path\b[^>]*\sd="([^"]+)"/g)].map(m => m[1])
  if (!viewBox || ds.length === 0) return null
  const raw = ds.map(d => {
    const pts = corners(d)
    const cx = pts.reduce((s, p) => s + p[0], 0) / Math.max(1, pts.length)
    const cy = pts.reduce((s, p) => s + p[1], 0) / Math.max(1, pts.length)
    return { d, cx, cy }
  })
  const cx = raw.reduce((s, f) => s + f.cx, 0) / raw.length
  const cy = raw.reduce((s, f) => s + f.cy, 0) / raw.length
  const far = Math.max(...raw.map(f => Math.hypot(f.cx - cx, f.cy - cy)), 1)
  const facets = raw.map(f => {
    const a = Math.atan2(f.cx - cx, -(f.cy - cy)) / (2 * Math.PI)
    return {
      ...f,
      angle: (a + 1) % 1,
      radius: Math.hypot(f.cx - cx, f.cy - cy) / far,
    }
  })
  return { viewBox, cx, cy, facets }
}
