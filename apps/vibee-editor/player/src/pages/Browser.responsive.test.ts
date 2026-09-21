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
    const phone = css.slice(css.indexOf(`@media (max-width: ${PHONE_MAX}px)`))
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
    expect(rule![1]).toContain('var(--app-top-inset')
    expect(rule![1]).toMatch(/z-index: calc\(var\(--z-tabbar/)
  })
})
