import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE FEED CARD'S TEXT MUST END BEFORE THE ACTION RAIL.
 *
 * Measured in headless Chrome on the built player at 1723x720, 1440x900,
 * 820x720 (the column the game's TRI tab frames) and 390x844: the blog card's
 * title box was 564px wide inside a 374px card, ran 214px past the card and
 * straight under the Remix / uses / views buttons. Two independent causes, one
 * per half of this file:
 *
 * 1. `.feed-card-creator-link` is a flex item whose min-width defaults to auto
 *    -- "never narrower than my content" -- and its content is a nowrap title.
 *    `.feed-card-meta` already said min-width: 0, but it sits BELOW the link,
 *    so the row grew anyway and the ellipsis on `.feed-card-name` could never
 *    engage: the box was never narrower than the text.
 *
 * 2. The reserve for the rail was written as `padding: 60px 16px 24px` plus a
 *    following `padding-right: 96px`. The 768px rule then set the `padding`
 *    shorthand again, which resets padding-right -- so at every desktop width
 *    the reserve was 24px against a rail that occupies 48px.
 *
 * jsdom has no layout engine, so this file cannot re-measure boxes. It does
 * the next best thing and the thing that actually failed: it resolves the
 * cascade of THIS file at the four measured widths and compares the reserved
 * column against the rail's own geometry. The live browser measurement stays a
 * scratch probe (scratchpad/feedfix/probe.mjs), which is not committed -- this
 * repository has no browser-contract harness that runs without a dev server
 * and live feed data.
 */

const CSS = path.resolve(__dirname, '../components/Panels/FeedPanel.css')

/** Widths measured in Chrome, with the rail box width seen at each. */
const WIDTHS = [
  { width: 1723, railBox: 36, note: "the owner's desktop" },
  { width: 1440, railBox: 36, note: 'desktop' },
  { width: 820, railBox: 36, note: 'the TRI tab embed column' },
  { width: 390, railBox: 44, note: 'phone' },
]

const INFO = '.feed-panel.fullscreen .feed-card-info'
const RAIL = '.feed-panel.fullscreen .feed-card-actions'
const RAIL_ICON = '.feed-panel.fullscreen .action-btn svg'
const PANEL = '.feed-panel.fullscreen'

type Rule = { media: string | null; selector: string; decls: string }

function closingBrace(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return i
  }
  return src.length
}

/** Every style rule in source order, each tagged with its @media condition. */
function parse(css: string): Rule[] {
  const src = css.replace(/\/\*[\s\S]*?\*\//g, '')
  const out: Rule[] = []
  let i = 0
  let media: string | null = null
  let mediaEnd = -1
  while (i < src.length) {
    while (i < src.length && /[\s}]/.test(src[i])) {
      if (src[i] === '}' && mediaEnd >= 0 && i >= mediaEnd) {
        media = null
        mediaEnd = -1
      }
      i++
    }
    const open = src.indexOf('{', i)
    if (open < 0) break
    const head = src.slice(i, open).trim()
    if (head.startsWith('@media')) {
      media = head.slice('@media'.length).trim()
      mediaEnd = closingBrace(src, open)
      i = open + 1
      continue
    }
    if (head.startsWith('@')) {
      i = closingBrace(src, open) + 1
      continue
    }
    const close = src.indexOf('}', open)
    for (const selector of head.split(',')) {
      out.push({
        media,
        selector: selector.trim(),
        decls: src.slice(open + 1, close),
      })
    }
    i = close + 1
  }
  return out
}

/** Last value of `prop` in a declaration block, or null. */
function decl(decls: string, prop: string): string | null {
  let value: string | null = null
  for (const part of decls.split(';')) {
    const m = part.match(/^\s*([a-zA-Z-]+)\s*:\s*(.+?)\s*$/s)
    if (m && m[1].toLowerCase() === prop) value = m[2].replace(/\s+/g, ' ')
  }
  return value
}

/**
 * Does this @media condition hold at `width`? Only the forms this file uses.
 * Anything else throws rather than quietly counting as "no match" -- a media
 * query the resolver cannot read is a hole in the contract, not a pass.
 */
function matches(media: string | null, width: number): boolean {
  if (!media) return true
  const conditions = media.match(/\([^)]*\)/g) || []
  const bare = (s: string) => s.replace(/\s+/g, '')
  if (conditions.length === 0 || bare(conditions.join('and')) !== bare(media)) {
    throw new Error(`media query this test cannot read: @media ${media}`)
  }
  return conditions.every(c => {
    const m = c.match(/^\((min|max)-width:\s*(\d+)px\)$/)
    if (!m) throw new Error(`media condition this test cannot read: ${c}`)
    return m[1] === 'min' ? width >= +m[2] : width <= +m[2]
  })
}

/** px value, resolving the one custom property this file defines. */
function px(value: string | null, vars: Record<string, string>): number | null {
  if (!value) return null
  const v = value.replace(
    /var\(\s*(--[\w-]+)\s*\)/g,
    (_, name) => vars[name] ?? 'NaN'
  )
  const m = v.match(/^(-?\d+(?:\.\d+)?)px$/) || v.match(/^(0)$/)
  return m ? +m[1] : null
}

/** Right value of a padding shorthand: top right bottom left. */
function shorthandRight(value: string): string {
  const parts = value.split(' ').filter(Boolean)
  return parts.length === 1 ? parts[0] : parts[1]
}

/**
 * Resolve `right` and the effective padding-right of a selector at a width.
 * Every rule collected here uses the identical three-class selector, so source
 * order alone decides the winner -- asserted by `singleSpecificity` below.
 */
function resolve(
  rules: Rule[],
  selector: string,
  width: number,
  vars: Record<string, string>
) {
  let right: number | null = null
  let paddingRight: number | null = null
  let iconWidth: number | null = null
  for (const rule of rules) {
    if (rule.selector !== selector || !matches(rule.media, width)) continue
    const shorthand = decl(rule.decls, 'padding')
    if (shorthand) paddingRight = px(shorthandRight(shorthand), vars)
    const longhand = decl(rule.decls, 'padding-right')
    if (longhand) paddingRight = px(longhand, vars)
    const r = decl(rule.decls, 'right')
    if (r !== null) right = px(r, vars)
    const w = decl(rule.decls, 'width')
    if (w) iconWidth = px(w, vars)
  }
  return { right, paddingRight, iconWidth }
}

/** The column, in px from the card's right edge, that each side claims. */
function geometry(css: string) {
  const rules = parse(css)
  const panel = rules.find(r => r.selector === PANEL && !r.media)
  const vars: Record<string, string> = {}
  const reserve = panel && decl(panel.decls, '--feed-rail-reserve')
  if (reserve) vars['--feed-rail-reserve'] = reserve
  return WIDTHS.map(({ width, railBox, note }) => {
    const info = resolve(rules, INFO, width, vars)
    const rail = resolve(rules, RAIL, width, vars)
    const icon = resolve(rules, RAIL_ICON, width, vars)
    // The text stops this far from the card's right edge...
    const textStops = (info.right ?? 0) + (info.paddingRight ?? 0)
    // ...and the rail runs out to here. Its box can be wider than its icon
    // (the "Remix" label, a "1.2K" count), so the measured box wins.
    const railEnds = (rail.right ?? 0) + Math.max(railBox, icon.iconWidth ?? 0)
    return { width, note, textStops, railEnds, clear: textStops >= railEnds }
  })
}

/** Every complaint about the file; empty means the contract holds. */
function problems(css: string): string[] {
  const out: string[] = []
  const rules = parse(css)

  for (const row of geometry(css)) {
    if (!row.clear) {
      out.push(
        `at ${row.width}px the text column ends ${row.textStops}px from the ` +
          `card's right edge but the action rail runs to ${row.railEnds}px`
      )
    }
  }

  // The flex chain from the info box down to the title. A flex item's default
  // min-width: auto is what let the title grow the row past the card.
  for (const selector of [
    '.feed-card-header',
    '.feed-card-creator-link',
    '.feed-card-meta',
  ]) {
    const base = rules.filter(r => r.selector === selector && !r.media)
    if (!base.some(r => decl(r.decls, 'min-width') === '0')) {
      out.push(`${selector} does not declare min-width: 0`)
    }
  }

  // Without these the fix would clip the title instead of ellipsising it.
  const name = rules.filter(r => r.selector === '.feed-card-name' && !r.media)
  for (const [prop, value] of [
    ['white-space', 'nowrap'],
    ['overflow', 'hidden'],
    ['text-overflow', 'ellipsis'],
  ]) {
    if (!name.some(r => decl(r.decls, prop) === value)) {
      out.push(`.feed-card-name no longer sets ${prop}: ${value}`)
    }
  }

  // The three-line clamp on the description is deliberate.
  const clamp = rules.find(
    r =>
      r.selector === '.feed-panel.fullscreen .feed-card-description' && !r.media
  )
  if (!clamp || decl(clamp.decls, '-webkit-line-clamp') !== '3') {
    out.push(
      '.feed-panel.fullscreen .feed-card-description lost its 3-line clamp'
    )
  }

  return out
}

/**
 * The resolver ignores specificity, which is only safe while every rule that
 * touches these boxes uses the same three-class selector.
 */
function singleSpecificity(css: string): string[] {
  const classes = (s: string) => (s.match(/\.[\w-]+/g) || []).length
  return parse(css)
    .filter(r => /\.feed-card-(info|actions)\b/.test(r.selector))
    .filter(
      r =>
        classes(r.selector) !==
        classes(r.selector.includes('fullscreen') ? INFO : '.feed-card-info')
    )
    .map(r => `selector of unexpected specificity: ${r.selector}`)
}

describe('feed card text stays out of the action rail', () => {
  const css = fs.readFileSync(CSS, 'utf8')

  it('the reserved column clears the rail at every measured width', () => {
    expect(problems(css).filter(p => p.startsWith('at '))).toEqual([])
  })

  it('the whole flex chain down to the title can shrink', () => {
    expect(problems(css)).toEqual([])
  })

  it('reserve and rail, in px from the card right edge', () => {
    // Printed as a table so a future change shows the numbers it moved.
    expect(
      geometry(css).map(
        r => `${r.width}: text<=${r.textStops} rail<=${r.railEnds}`
      )
    ).toEqual([
      '1723: text<=96 rail<=48',
      '1440: text<=96 rail<=48',
      '820: text<=96 rail<=48',
      '390: text<=72 rail<=50',
    ])
  })

  it('catches the shorthand that dropped the reserve (negative control)', () => {
    // Exactly the rule as it stood before the fix.
    const broken = css.replace(
      'padding: 100px var(--feed-rail-reserve) 32px 24px;',
      'padding: 100px 24px 32px;'
    )
    expect(broken).not.toEqual(css)
    const found = problems(broken).filter(p => p.startsWith('at '))
    expect(found).toHaveLength(3)
    expect(found[0]).toContain('at 1723px the text column ends 24px')
  })

  it('catches a flex link that may not shrink (negative control)', () => {
    const broken = css.replace(
      /(\.feed-card-creator-link \{[\s\S]*?)\n\s*min-width: 0;/,
      '$1'
    )
    expect(broken).not.toEqual(css)
    expect(problems(broken)).toContain(
      '.feed-card-creator-link does not declare min-width: 0'
    )
  })

  it('every rule on these boxes has the same specificity', () => {
    expect(singleSpecificity(css)).toEqual([])
  })
})
