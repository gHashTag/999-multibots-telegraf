import { describe, it, expect } from 'vitest'
import {
  injectSkin,
  shouldDress,
  BRAND_CSS,
  PAGE_TITLE,
  LOGO_URL,
  BRAND_NAME,
} from './src/browser/skin'

/**
 * THE WINDOW LOOKS LIKE OURS, BECAUSE IT IS OURS.
 *
 * Paint, not a fork: only the document's head is rewritten, and a page that
 * cannot be painted is served exactly as it came.
 */

const PAGE =
  '<!doctype html><html><head><meta charset="utf-8">' +
  '<title>n.eko</title>' +
  '<link rel="icon" type="image/png" sizes="32x32" href="favicon-32x32.png">' +
  '<link rel="icon" type="image/png" sizes="16x16" href="favicon-16x16.png">' +
  '</head><body><div id="neko"></div><script src="app.js"></script></body></html>'

describe('dressing the window', () => {
  it('puts OUR NAME in the tab, not somebody else product', () => {
    expect(injectSkin(PAGE)).toContain(`<title>${PAGE_TITLE}</title>`)
    expect(injectSkin(PAGE)).not.toContain('<title>n.eko</title>')
  })

  it('puts OUR LOGO in the bar', () => {
    expect(injectSkin(PAGE)).toContain(LOGO_URL)
  })

  it('replaces EVERY favicon, not just the first', () => {
    const out = injectSkin(PAGE)
    expect(out).not.toContain('favicon-32x32.png')
    expect(out).not.toContain('favicon-16x16.png')
  })

  it('KEEPS THE ENGINE CREDITED', () => {
    /*
     * neko is Apache-2.0. Its marks may not be used, so the cat goes; its
     * name in words is a credit, and taking that off a window it renders
     * would be both unnecessary and shabby.
     */
    expect(BRAND_CSS).toContain('n.eko')
  })

  it('leaves the page body and its scripts alone', () => {
    const out = injectSkin(PAGE)
    expect(out).toContain('<div id="neko"></div>')
    expect(out).toContain('<script src="app.js"></script>')
  })

  it('inserts the style INSIDE the head', () => {
    const out = injectSkin(PAGE)
    expect(out.indexOf('data-t27-skin')).toBeLessThan(out.indexOf('</head>'))
  })

  it('HANDS BACK ANYTHING IT CANNOT DRESS, UNCHANGED', () => {
    /* A window that looks plain works. A mangled one does not. */
    const odd = '302 moved'
    expect(injectSkin(odd)).toBe(odd)
    expect(injectSkin('')).toBe('')
  })

  it('does not run twice into a doubled style block', () => {
    const once = injectSkin(PAGE)
    const twice = injectSkin(once)
    expect(twice.split('data-t27-skin').length - 1).toBe(2)
    /* Idempotent in effect even if applied twice: same title, same logo. */
    expect(twice).toContain(`<title>${PAGE_TITLE}</title>`)
  })
})

describe('what gets dressed and what streams', () => {
  it('dresses the document', () => {
    expect(shouldDress({ 'content-type': 'text/html; charset=utf-8' })).toBe(
      true
    )
  })

  it('NEVER touches the video or the scripts', () => {
    expect(shouldDress({ 'content-type': 'application/javascript' })).toBe(
      false
    )
    expect(shouldDress({ 'content-type': 'video/webm' })).toBe(false)
    expect(shouldDress({ 'content-type': 'image/svg+xml' })).toBe(false)
    expect(shouldDress({})).toBe(false)
  })

  it('LEAVES A COMPRESSED DOCUMENT ALONE', () => {
    /*
     * Reading a gzip body as utf8 returns mojibake with the gzip header
     * still on it, and the page does not load at all. A blank window is far
     * worse than an unpainted one.
     */
    expect(
      shouldDress({
        'content-type': 'text/html',
        'content-encoding': 'gzip',
      })
    ).toBe(false)
  })
})

describe('the palette is the app palette', () => {
  it('uses the brand green', () => {
    expect(BRAND_CSS).toContain('#00ff88')
  })

  it('SAYS THE NAME THE APP HEADER SAYS', () => {
    /*
     * The product is Trinity / t27.ai. An earlier pass dressed this window
     * in a different project's wordmark, which is how a person learns their
     * browser belongs to something else.
     */
    expect(BRAND_NAME).toContain('Trinity')
    expect(LOGO_URL).toBe('/t27-mark.svg')
    expect(BRAND_CSS).toContain(BRAND_NAME)
    expect(PAGE_TITLE).toContain(BRAND_NAME)
  })

  it('answers a phone', () => {
    expect(BRAND_CSS).toContain('@media (max-width: 480px)')
  })
})
