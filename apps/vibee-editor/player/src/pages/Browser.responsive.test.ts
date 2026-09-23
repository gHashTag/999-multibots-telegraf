import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { PHONE_MAX } from '@/lib/browserFit'

/**
 * THE STYLESHEET AND THE MEASURING CODE HAVE TO AGREE.
 *
 * The layout lives in CSS and there is no browser here to run it, so this
 * reads the stylesheet. That is legitimate exactly where the literal IS the
 * artifact: if `PHONE_MAX` says 700 and the media query says 600, then
 * between those two widths the code asks for a tall desktop while the page
 * is still laid out wide, and the letterbox comes back in a band nobody
 * thinks to test at.
 *
 * The path is absolute, on purpose. A relative one passes from the package
 * and fails from the repository root, which is how the pre-push guard runs.
 */
const raw = readFileSync(join(__dirname, 'Browser.css'), 'utf8')

/*
 * Comments are stripped before anything is asserted. The first version of
 * this file failed on its own explanation: the comment above the fix quotes
 * the rule the fix removed. Grepping a stylesheet only means anything if it
 * greps the RULES.
 */
const css = raw.replace(/\/\*[\s\S]*?\*\//g, '')

describe('the phone layout and the phone measurement agree', () => {
  it('uses the SAME width as the code that asks the pod', () => {
    expect(css).toContain(`@media (max-width: ${PHONE_MAX}px)`)
  })

  it('has no leftover hard-coded desktop shape', () => {
    /*
     * `aspect-ratio: 16 / 10` was the bug: a frame pinned to a pod that
     * always ran 1280x800, so a portrait phone got a letterbox.
     */
    expect(css).not.toMatch(/aspect-ratio:\s*16\s*\/\s*10/)
  })

  it('gives the picture the window on a phone, minus the tab bar', () => {
    /* Padding below a fixed-height page puts its buttons under the bar. */
    expect(css).toContain('--app-tabbar-total')
    expect(css).toContain('--app-vh-stable')
  })

  it('keeps the sentence that stops somebody wiping their logins', () => {
    /* It may shrink on a phone. It may not disappear. */
    /*
     * The anchor is checked before the slice, and that check is the whole
     * point here: the assertion below is NEGATIVE. With a missing anchor
     * `indexOf` returns -1, `slice(-1)` hands back the file's last character,
     * and `not.toMatch` over one character passes for ever -- the phone rule
     * could be deleted outright and this test would still be green.
     */
    const phoneAt = css.indexOf(`@media (max-width: ${PHONE_MAX}px)`)
    expect(phoneAt).toBeGreaterThan(-1)
    const phone = css.slice(phoneAt)
    expect(phone).not.toMatch(
      /\.remote-browser--live \.remote-browser__muted \{[^}]*display:\s*none/
    )
  })

  it('answers a phone lying on its side', () => {
    expect(css).toContain('orientation: landscape')
  })

  it('lets full screen actually fill the screen, above the tab bar', () => {
    const rule = css.match(
      /\.remote-browser--full \.remote-browser__stage \{([^}]*)\}/
    )
    expect(rule).not.toBeNull()
    expect(rule![1]).toContain('position: fixed')
    /*
     * Not the inset: the transformed, already-moved body is what it is
     * positioned against in Telegram fullscreen (styles/telegram.css).
     */
    expect(rule![1]).toMatch(/top: 0;/)
    expect(rule![1]).not.toContain('--app-top-inset')
    expect(rule![1]).toMatch(/z-index: calc\(var\(--z-tabbar/)
  })
})

describe('the button to open the browser', () => {
  it('HAS ITS OWN HEIGHT, so its words sit inside it', () => {
    /* The design system fixes every button's height; padding alone did not fit. */
    const rule = css.match(/\.remote-browser__cta \{([^}]*)\}/)
    expect(rule).not.toBeNull()
    expect(rule![1]).toMatch(/height: 48px/)
    expect(rule![1]).toMatch(/line-height: 1/)
    expect(rule![1]).toMatch(/align-items: center/)
  })

  it('is the app pill: green with black on it', () => {
    const rule = css.match(/\.remote-browser__cta \{([^}]*)\}/)
    expect(rule![1]).toContain('background: #00ff88')
    expect(rule![1]).toContain('color: #000')
  })
})

describe('the fullscreen body is a containing block', () => {
  it('telegram.css still moves and transforms the body, which the zero relies on', () => {
    const tg = readFileSync(
      join(__dirname, '..', 'styles', 'telegram.css'),
      'utf8'
    )
    const body = tg.match(
      /html\[data-tg='1'\]\[data-tg-fullscreen='1'\] body \{([^}]*)\}/
    )
    expect(body).not.toBeNull()
    expect(body![1]).toContain('top: var(--app-top-inset)')
    expect(body![1]).toMatch(/transform:/)
  })
})

describe('nothing under the picture runs off the screen (owner, 2026-09-22)', () => {
  it('the controls are a grid, not a row that scrolls sideways', () => {
    expect(css).toMatch(
      /\.remote-browser--live \.remote-browser__actions \{[^}]*display: grid/
    )
    expect(css).not.toMatch(
      /\.remote-browser--live \.remote-browser__actions \{[^}]*overflow-x: auto/
    )
  })

  it('every block under the picture takes the full width, not its content width', () => {
    expect(css).toMatch(
      /\.remote-browser__live > \* \{[^}]*align-self: stretch[^}]*min-width: 0/
    )
  })
})

describe('the live screen scrolls instead of clipping the cards (owner, 2026-09-22)', () => {
  it('the fixed-height phone column scrolls vertically', () => {
    expect(css).toMatch(/\.remote-browser--live \{[^}]*overflow-y: auto/)
    expect(css).not.toMatch(/\.remote-browser--live \{[^}]*overflow: hidden/)
  })

  it('only the picture flexes; cards, keys and buttons keep their height', () => {
    expect(css).toMatch(
      /\.remote-browser__live > :not\(\.remote-browser__stage\) \{\s*flex: 0 0 auto/
    )
  })
})
