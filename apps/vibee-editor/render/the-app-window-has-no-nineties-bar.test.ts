/**
 * Owner, 2026-09-22: "the header covers the site -- it looks like a browser
 * from the nineties". Framed in the app, the window drops neko's bar and
 * keeps only who-is-watching.
 */
import { describe, it, expect } from 'vitest'
import { injectSkin, FRAMED_SCRIPT, FRAMED_CSS } from './src/browser/skin'

const run = (framed: boolean) => {
  const attrs: Record<string, string> = {}
  const win: { parent?: unknown } = {}
  win.parent = framed ? {} : win
  const document = {
    documentElement: { setAttribute: (k: string, v: string) => (attrs[k] = v) },
  }
  new Function('window', 'document', FRAMED_SCRIPT)(win, document)
  return attrs
}

describe('the window inside the app', () => {
  it('knows it is framed, and only then', () => {
    expect(run(true)).toHaveProperty('data-t27-framed')
    expect(run(false)).toEqual({})
  })

  it('drops the bar and keeps who is watching', () => {
    expect(FRAMED_CSS).toMatch(
      /html\[data-t27-framed\] \.header-container \{ display: none/
    )
    expect(FRAMED_CSS).not.toMatch(/\.members[^{]*\{[^}]*display: none/)
  })

  it('decides before the first paint: first thing in <head>', () => {
    const html = injectSkin(
      '<html><head><title>x</title></head><body></body></html>'
    )
    const headAt = html.indexOf('<head>')
    const headEnd = html.indexOf('</head>')
    expect(headAt).toBeGreaterThan(-1)
    expect(headEnd).toBeGreaterThan(headAt)
    const head = html.slice(headAt, headEnd)
    /*
     * Both markers are required to EXIST before their order is compared.
     * `indexOf` returns -1 for an absent marker, and -1 is less than every
     * real position, so a dropped `data-t27-framed` would have satisfied
     * `toBeLessThan` rather than failing it -- the test would have passed
     * precisely when the decision it guards had stopped being made.
     */
    const framedAt = head.indexOf('data-t27-framed')
    const skinAt = head.indexOf('data-t27-skin')
    expect(framedAt).toBeGreaterThan(-1)
    expect(skinAt).toBeGreaterThan(-1)
    expect(framedAt).toBeLessThan(skinAt)
  })
})
