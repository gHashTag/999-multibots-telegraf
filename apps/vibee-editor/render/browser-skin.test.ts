import { describe, it, expect } from 'vitest'
import {
  injectSkin,
  shouldDress,
  BRAND_CSS,
  PAGE_TITLE,
  LOGO_URL,
  BRAND_NAME,
  BOOT_HTML,
  BOOT_SCRIPT,
  BOOT_GIVE_UP_MS,
  FACE_SCRIPT,
  AVATAR_PATH,
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

  it('SHOWS NO ENGINE NAME, and does not link to one', () => {
    /*
     * Owner's decision, 2026-09-21, and permitted: Apache-2.0 hangs its
     * notice duties on distributing the work, not on hosting it. The link
     * matters as much as the text -- the anchor points at the engine's
     * repository and CSS cannot change an href, so the credit is only truly
     * gone once the click is gone too.
     */
    const css = BRAND_CSS.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(css).not.toMatch(/content:\s*'[^']*n\.eko/)
    expect(css).toMatch(/pointer-events:\s*none/)
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

describe('the loader, while the browser comes up', () => {
  it('is IN THE FIRST PAINT, not built by a script', () => {
    /*
     * A loader a bundle has to run before it appears is a black rectangle
     * for exactly as long as it matters. It goes in as markup, after <body>.
     */
    const out = injectSkin(PAGE)
    const body = out.indexOf('<body>')
    expect(body).toBeGreaterThan(-1)
    expect(out.indexOf('id="t27-boot"')).toBeGreaterThan(body)
    expect(out.indexOf('id="t27-boot"')).toBeLessThan(
      out.indexOf('<div id="neko">')
    )
  })

  it('shows our mark and says what is happening', () => {
    expect(BOOT_HTML).toContain(LOGO_URL)
    expect(BOOT_HTML).toMatch(/class="said"/)
  })

  it('LEAVES WHEN A REAL FRAME PLAYS, not when a socket opens', () => {
    /*
     * A connected socket with no picture is precisely the state worth
     * seeing, so the loader must not treat it as success.
     */
    expect(BOOT_SCRIPT).toContain("'playing'")
    expect(BOOT_SCRIPT).not.toContain("'open'")
  })

  it('LEAVES EVEN WHEN NOTHING ARRIVES', () => {
    /*
     * The failure this prevents: a browser that never starts, hidden behind
     * a ring that spins forever, with the real error underneath it.
     */
    expect(BOOT_SCRIPT).toContain(String(BOOT_GIVE_UP_MS))
    expect(BOOT_SCRIPT).toMatch(/setTimeout\(done/)
    expect(BOOT_GIVE_UP_MS).toBeGreaterThan(20_000)
    expect(BOOT_GIVE_UP_MS).toBeLessThanOrEqual(60_000)
  })

  it('takes itself out of the way once and only once', () => {
    expect(BOOT_SCRIPT).toContain('if (gone) return')
  })

  it('stops spinning for somebody who asked motion to stop', () => {
    expect(BRAND_CSS).toContain('prefers-reduced-motion')
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

describe('the row along the bottom is ours too', () => {
  const css = BRAND_CSS.replace(/\/\*[\s\S]*?\*\//g, '')

  it('LEAVES NO DISCORD GREY BEHIND', () => {
    /*
     * The colours neko ships: #36393f on the open toggle, #2f3136 on the
     * switch, #202225 on the language select, and a teal slider. Painting
     * the top bar and stopping there is how a window ends up half dressed.
     */
    for (const stray of ['#36393f', '#2f3136', '#202225', '#97d18b']) {
      expect(css.toLowerCase()).not.toContain(stray)
    }
    expect(css).toContain('.controls')
    expect(css).toContain('.members')
    expect(css).toContain('.settings select')
  })

  it('takes the grey slab off the hamburger', () => {
    expect(css).toMatch(
      /\.header \.menu \.toggle[\s\S]{0,120}background: transparent/
    )
  })

  it('HAS ONE NUMBER FOR THE BAR, so nothing can disagree with it', () => {
    /*
     * The bar, the footer pinned into it and the height left for the
     * picture were three separate literals, and they drifted 3px apart --
     * the moved controls centred on 24 while the bar's own icons centred on
     * 22. One custom property, read by all three.
     */
    expect(css).toMatch(/--t27-bar:\s*\d+px/)
    expect(css).toMatch(/\.header \{[^}]*height: var\(--t27-bar\)/)
    expect(css).toMatch(
      /\.room-container \{[^}]*height: calc\(var\(--t27-bar\) - 1px\)/
    )
    /* Border-box, or padding pushes the two apart again. */
    expect(css).toMatch(/\.header \{[^}]*box-sizing: border-box/)
  })

  it('CENTRES BOTH SIDES AGAINST THE BAR, not by eye', () => {
    /*
     * The bar's height is neko's and changes with the window; a hand-picked
     * offset lines up at one size and slips at the next.
     */
    expect(css).toMatch(/\.header \{[^}]*align-items: center/)
  })

  it('colours the volume with the accent, not a stranger teal', () => {
    expect(css).toMatch(/accent-color: #00ff88/)
  })

  it('NEVER USES THE FONT SHORTHAND ON THE AVATAR', () => {
    /*
     * neko centres the initials with an INLINE style on the element:
     * width 50, height 50, line-height 50, font-size 25. The shorthand
     * resets everything it does not name, and with !important it beat that
     * inline rule -- the initials came out at 13px on a 13px line and sat
     * outside the top of the circle. Photographed by the owner.
     */
    const rule = css.match(/\.avatar[^{]*\{[^}]*\}/)
    expect(rule, 'no avatar rule').toBeTruthy()
    expect(rule![0]).not.toMatch(/(^|[^-])font:/)
  })

  it('KEEPS LINE-HEIGHT EQUAL TO HEIGHT ON THE AVATAR', () => {
    /*
     * That equality IS the centring. The avatar is resized for the bar now,
     * so "do not touch line-height" is no longer the rule -- "never let it
     * disagree with the height" is, and it is the same defect either way.
     */
    const rule = css.match(/\.avatar[^{]*\{[^}]*\}/)![0]
    const h = rule.match(/[^-]height:\s*(\d+)px/)
    const lh = rule.match(/line-height:\s*(\d+)px/)
    expect(h, 'height not set').toBeTruthy()
    expect(lh, 'line-height not set').toBeTruthy()
    expect(lh![1]).toBe(h![1])
  })

  it('MOVES THE FOOTER INTO THE BAR, and gives the player the rest', () => {
    /*
     * neko's footer is 126px of chrome under the thing the person came to
     * look at, and a second place to hunt for controls. CSS cannot move a
     * node; it can take one out of flow.
     */
    expect(css).toMatch(/\.room-container \{[^}]*position: fixed/)
    expect(css).toMatch(/\.neko-main[^{]*\{[^}]*height: 100vh/)
  })

  it('CENTRES THE AVATAR AT EVERY LEVEL, not just the top one', () => {
    /*
     * Measured otherwise: .members centred with the rest of the bar, but
     * .members-container was a block, so the list sat at its top, and the
     * member inside carried a 10px top margin of neko's. The avatar came
     * out 5px above everything else -- one round thing out of line, which
     * is what the eye catches first.
     */
    expect(css).toMatch(/\.members-list \{[^}]*align-items: center/)
    expect(css).toMatch(/\.member, \.self\.member \{[^}]*margin: 0/)
    expect(css).toMatch(/\.members-list li[^{]*\{[^}]*align-items: center/)
  })

  it('MATCHES THE CONTENT BOXES so there is ONE axis', () => {
    /*
     * The bar is border-box with a 1px hairline, so its content box is one
     * pixel shorter than its height. A pinned row of the full height
     * centres half a pixel lower, and half a pixel is still crooked.
     */
    expect(css).toMatch(
      /\.room-container \{[^}]*calc\(var\(--t27-bar\) - 1px\)/
    )
  })

  it('LETS CLICKS THROUGH THE GLASS', () => {
    /*
     * The bar covers the top strip of the person's own browser -- their
     * tabs, their address bar. Showing them through frosted glass and then
     * swallowing the click would be worse than an opaque bar.
     */
    expect(css).toMatch(/\.header \{[^}]*backdrop-filter/)
    expect(css).toMatch(/\.header \{[^}]*pointer-events: none/)
    expect(css).toMatch(
      /\.room-container \{[\s\S]*?pointer-events: auto|\.header \.menu[^{]*\{[^}]*pointer-events: auto/
    )
  })

  it('PAINTS ONLY THE WATCHER OWN FACE, never anybody else', () => {
    /*
     * The other discs in the bar belong to other viewers. Painting this
     * person's photo on them would be worse than initials -- it would be a
     * lie about who is watching.
     */
    expect(FACE_SCRIPT).toContain('.self')
    expect(FACE_SCRIPT).toContain(AVATAR_PATH)
    /* Loaded first, applied second: a 404 leaves the initials alone. */
    expect(FACE_SCRIPT).toMatch(/img\.onload[\s\S]{0,200}backgroundImage/)
  })

  it('KEEPS THE SIGN THAT SOMEBODY ELSE IS WATCHING', () => {
    /*
     * The avatars are the only thing on screen that says a second viewer is
     * present. Tidying them away would be removing a safety signal to save
     * space, so they move into the bar instead.
     */
    expect(css).not.toMatch(/\.members[^{]*\{[^}]*display: none/)
    expect(css).toMatch(/\.members-list li[^{]*\{/)
  })

  it('PUTS THE WHOLE ROW ON ONE AXIS', () => {
    /*
     * The items are different heights by nature -- a 15px question mark, a
     * 24px toggle, a 20px slider -- so a row that only lines them up
     * sideways lets each sit on its own baseline. Measured before the fix:
     * centres at 675, 678 and 683.
     */
    expect(css).toMatch(/\.room-menu \{[^}]*align-items: center/)
    expect(css).toMatch(/\.settings > ul > li[^{]*\{[^}]*align-items: center/)
    expect(css).toMatch(/\.controls \.volume \{[^}]*align-items: center/)
  })

  it('says who is in the room in the accent, and reads on it', () => {
    /* Black on the accent: the one pairing the app uses for a filled thing. */
    expect(css).toMatch(/\.avatar[\s\S]{0,200}#00ff88/)
    expect(css).toMatch(/\.avatar[\s\S]{0,200}color: #000/)
  })

  it('makes unavailable look unavailable, not merely dim', () => {
    expect(css).toMatch(/\.controls i\.faded/)
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

  it('IS A WHOLE STYLESHEET, not one cut in half', () => {
    /*
     * The stylesheet is a template literal, so a backtick inside it ends it
     * early. One slipped into a comment and truncated the sheet; that time
     * the leftovers were a syntax error and the compiler caught it, but a
     * PAIR of backticks would have compiled fine and shipped half a design.
     * Braces are the cheap, honest check that the sheet is entire.
     */
    const open = (BRAND_CSS.match(/\{/g) || []).length
    const close = (BRAND_CSS.match(/\}/g) || []).length
    expect(open).toBe(close)
    expect(open).toBeGreaterThan(10)
    expect(BRAND_CSS).not.toContain('`')
    expect(BRAND_CSS.trimEnd().endsWith('}')).toBe(true)
  })

  it('leaves the icon font alone', () => {
    /*
     * Forcing the family on every node overrode Font Awesome, and every
     * icon in the bar became a row of little bars.
     */
    expect(BRAND_CSS).toContain(':not(i)')
  })

  it('answers a phone', () => {
    expect(BRAND_CSS).toContain('@media (max-width: 480px)')
  })
})
