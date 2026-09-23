/**
 * CHROME IS PLACED OFF WHAT IS ON THE SCREEN, NOT OFF WHAT USED TO BE.
 *
 * Two offsets were written down from a screen that no longer looks like that,
 * both measured in the live board frame on 2026-09-23:
 *
 *  - The profile's section strip started 781px down on somebody else's
 *    profile and 1253px down on the owner's own, because the header, the SOUL
 *    card, the top-up card and the CRM card all come first. On a phone the
 *    sections now come before those two cards, and the SOUL preview is capped
 *    by its drawn height rather than by a count of source lines.
 *  - The feed's Recent/Popular chips float at 70px (65px below 480px) to
 *    clear the app's 56/48px header. Inside the frame no header is drawn, so
 *    the chips hung 65px below nothing; the board shell lifts them.
 *
 * The numbers are read from the stylesheets rather than restated, so a change
 * there reaches this file instead of going quiet.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (...p: string[]) =>
  readFileSync(join(__dirname, '..', ...p), 'utf8')
const PROFILE = read('components', 'Profile', 'Profile.css')
const BOARD = read('styles', 'board-shell.css')
const FEED = read('components', 'Panels', 'FeedPanel.css')
const SEARCH = read('pages', 'Search.css')

/** Every block that starts with `head`, brace-balanced, joined. */
function block(css: string, head: string): string {
  const found: string[] = []
  for (let at = css.indexOf(head); at > -1; at = css.indexOf(head, at + 1)) {
    let depth = 0
    for (let i = css.indexOf('{', at); i < css.length; i++) {
      if (css[i] === '{') depth++
      else if (css[i] === '}' && --depth === 0) {
        found.push(css.slice(at, i + 1))
        break
      }
    }
  }
  // A stylesheet may carry the same head more than once (Profile.css has
  // several 480px blocks). Missing is missing; more than one is joined, so a
  // rule moved between two of them does not read as deleted.
  expect(found.length, `${head} is gone from the stylesheet`).toBeGreaterThan(0)
  return found.join('\n')
}

/** Every `top:` value in a chunk of CSS, in pixels. */
const tops = (css: string) =>
  [...css.matchAll(/(?:^|[;{\s])top:\s*(-?\d+(?:\.\d+)?)px/g)].map(m =>
    Number(m[1])
  )

describe('the profile sections follow the thumb on a phone', () => {
  const phone = block(PROFILE, '@media (max-width: 480px)')

  it('the sections come before the cards that are not the sections', () => {
    // Order only works in a flex (or grid) container, and the container is a
    // plain block everywhere else; without the display line the order lines
    // are inert and the strip stays where it was.
    expect(block(phone, '.profile-page__container {')).toMatch(
      /display:\s*flex/
    )
    const sections = Number(
      block(phone, '.profile-tabs {').match(/order:\s*(\d+)/)?.[1]
    )
    const cards = Number(
      block(phone, '.profile-topup {').match(/order:\s*(\d+)/)?.[1]
    )
    expect(sections).toBeLessThan(cards)
  })

  it('and nothing else is reordered: SOUL stays above them on purpose', () => {
    // The owner put SOUL.md right under the header because that is how people
    // and a2a agents read who somebody is. Only the two cards move, so this
    // lists every rule in the phone block that carries an order.
    const moved = [
      ...phone.matchAll(/([.#][\w-]+)\s*\{[^{}]*order:\s*\d+/g),
    ].map(m => m[1])
    expect(moved.sort()).toEqual(['.profile-tabs', '.profile-topup'])
  })

  it('the SOUL preview is capped by drawn height, and opening lifts the cap', () => {
    const text = block(phone, '.soul-card__text {')
    expect(text).toMatch(/max-height:\s*[\d.]+em/)
    expect(text).toMatch(/overflow:\s*hidden/)
    expect(block(phone, ".soul-card__text[data-open='1'] {")).toMatch(
      /max-height:\s*none/
    )
  })
})

describe('the feed chips clear the frame, not a header that is not there', () => {
  it('the app places them below its own header', () => {
    const own = [
      ...tops(block(FEED, '.feed-panel.fullscreen .feed-sort {')),
      ...tops(block(FEED, '@media (max-width: 480px)')),
    ]
    // If these ever drop to the top edge by themselves, the board override
    // below stops being needed and this test says so.
    expect(Math.min(...own)).toBeGreaterThanOrEqual(48)
  })

  it('the board lifts them to the top of the frame', () => {
    const rule = block(
      BOARD,
      "html[data-shell='board'] .feed-panel.fullscreen .feed-sort {"
    )
    const [top] = tops(rule)
    expect(top).toBeLessThanOrEqual(16)
  })

  it('the board selector outranks the app phone rules, which carry no media query here', () => {
    // App: .feed-panel.fullscreen .feed-sort = (0,3,0).
    // Board: html[data-shell='board'] .feed-panel.fullscreen .feed-sort =
    // (0,4,1). A media query adds nothing to specificity, so the board wins at
    // every width. Shortening the board selector would silently lose.
    const selector =
      "html[data-shell='board'] .feed-panel.fullscreen .feed-sort"
    expect(BOARD).toContain(selector)
  })
})

/**
 * A page that ends under the bar cannot be read to the end. The owner sent a
 * screenshot of exactly that on 2026-09-23, and it was measured on
 * app.t27.ai at 390px: the profile's last row sat 7px under the bar, and the
 * Search screen's own tab strip -- Events / Leads / Statistics -- was behind
 * it entirely, all 57px of it.
 *
 * Both reserves are keyed on `body[data-tabbar='visible']`, which
 * TelegramTabBar writes only while the bar is up, so a desktop window and the
 * board frame gain no empty strip.
 */
describe('nothing ends under the tab bar', () => {
  const reserve = /var\(\s*--app-tabbar-total/

  it('the profile reserves the bar, after the paddings that would reset it', () => {
    const rule = block(PROFILE, "body[data-tabbar='visible'] .profile-page {")
    expect(rule).toMatch(reserve)
    // Four `padding` shorthands set .profile-page by breakpoint, and each one
    // resets padding-bottom. The reserve has to come after the last of them.
    const shorthands = [
      ...PROFILE.matchAll(/^[ \t]*\.profile-page \{[^}]*padding:/gm),
    ]
    expect(shorthands.length).toBeGreaterThan(1)
    const last = shorthands[shorthands.length - 1].index
    expect(
      PROFILE.indexOf("body[data-tabbar='visible'] .profile-page {")
    ).toBeGreaterThan(last)
  })

  it('the leads sections no longer own a fixed shell of their own', () => {
    // They were a position:fixed screen whose own tab row was pinned to the
    // bottom, under the app's bar. They are sections of /crm now, on the
    // page's normal scroll, so the bar is reserved once by the page and the
    // old shell must not come back.
    expect(SEARCH).not.toContain('.leads-dashboard {')
    expect(SEARCH).not.toContain('.leads-bottom-tab')
    expect(SEARCH).not.toContain('.leads-sidebar')
  })
})
