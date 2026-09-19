import qrcode from 'qrcode-generator'

/**
 * THE QR CODE, AS A GRID AND AS ONE SVG PATH.
 *
 * Drawn by us rather than by the library's own `createSvgTag()`: that returns
 * a string of markup, and the only way to put a string of markup on a React
 * screen is `dangerouslySetInnerHTML`. A grid of booleans becomes one <path>,
 * and nothing on the login screen is ever parsed as HTML.
 *
 * Error correction M: a login link is about seventy characters, the code is
 * shown on a lit screen and scanned from a hand's distance, so the quarter of
 * the modules that level H spends on recovery only makes them smaller.
 */

/** Light border around the code, in modules. Scanners need it to find the */
/** finder patterns; four is what the standard asks for. */
export const QUIET_ZONE = 4

export function qrModules(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text)
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, row) =>
    Array.from({ length: n }, (_, col) => qr.isDark(row, col))
  )
}

/** One sub-path per dark module, offset by the quiet zone. */
export function qrPath(modules: boolean[][]): string {
  let d = ''
  modules.forEach((row, y) =>
    row.forEach((dark, x) => {
      if (dark) d += `M${x + QUIET_ZONE} ${y + QUIET_ZONE}h1v1h-1z`
    })
  )
  return d
}
