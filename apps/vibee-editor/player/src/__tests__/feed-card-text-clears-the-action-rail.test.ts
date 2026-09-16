import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE FEED CARD'S TEXT MUST END BEFORE THE ACTION RAIL -- AND THE RESERVE THAT
 * KEEPS IT THERE MUST NOT EAT THE CARD.
 *
 * Measured in headless Chrome on the built player: the blog card's title box
 * was 564px wide inside a 374px card, ran 214px past the card and straight
 * under the Remix / uses / views buttons. Two independent causes, one per half
 * of the stylesheet:
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
 * TWO AXES, because the first version of this contract only had one. It asked
 * "does the text stop before the rail?" and pinned four tall portrait
 * viewports. A reserve of 96px -- double the 48px the rail actually occupies --
 * passed that question at every one of them while leaving 68px of title at
 * 844x390, because the card is sized from the viewport HEIGHT
 * (`.feed-card-inner { max-width: calc((100dvh - 56px) * 0.5625) }`), not its
 * width. So this file now resolves the card width too and asks both questions:
 * the text must clear the rail (gap >= 0) and the reserve must not claim much
 * more than the rail needs (gap <= MAX_GAP). The printed table carries the
 * resulting column so any future change shows what it costs the text.
 *
 * WHAT THIS RESOLVER CAN AND CANNOT READ. jsdom has no layout engine, so this
 * file re-resolves the cascade of ONE stylesheet instead of measuring boxes:
 *
 * - It parses FeedPanel.css only. The rail's width on phones comes from
 *   src/index.css (`.feed-card-actions .action-btn { min-width: 44px }`), which
 *   this test never opens -- hence railBox below is pinned from Chrome by hand.
 *   Widen the rail there (a bigger touch target, a label longer than "Remix")
 *   and these numbers must be re-measured; the test cannot see it happen.
 * - `matches()` reads min/max-width and min/max-height conditions, joined by
 *   `and`. Any other media form throws rather than quietly counting as "no
 *   match": a query the resolver cannot read is a hole in the contract, not a
 *   pass.
 * - `shorthandSide()` splits on spaces, so a padding shorthand containing a
 *   function with spaces mis-parses -- see the note on that function. It fails
 *   loudly, never silently.
 *
 * The live browser measurement stays a scratch probe
 * (scratchpad/feedfix/probe-col.mjs), which is not committed -- this repository
 * has no browser-contract harness that runs without a dev server and live feed
 * data.
 */

const CSS = path.resolve(__dirname, '../components/Panels/FeedPanel.css')

type Viewport = {
  width: number
  height: number
  railBox: number
  note: string
}

/**
 * Viewports measured in headless Chrome on the built player, each with the rail
 * box width seen there. The heights are load-bearing, not decoration: from
 * 768px up the card is the 9:16 column derived from the viewport height, so the
 * reserve is a share of a width the HEIGHT decides. Every row was measured; the
 * rail occupied exactly 48px from the card's right edge at all five desktop
 * rows and 50px on the phone.
 */
const VIEWPORTS: Viewport[] = [
  { width: 1723, height: 720, railBox: 36, note: "the owner's desktop" },
  { width: 1440, height: 900, railBox: 36, note: 'desktop' },
  { width: 1280, height: 500, railBox: 36, note: 'a short desktop window' },
  { width: 844, height: 390, railBox: 36, note: 'a phone in landscape' },
  { width: 820, height: 720, railBox: 36, note: 'the TRI tab embed column' },
  { width: 390, height: 844, railBox: 44, note: 'phone' },
]

/**
 * How much clearance beyond the rail's own extent the reserve may claim.
 *
 * The reserve exists to keep text off the buttons. Past that it is margin, and
 * the card pays for it out of the one column it has for text -- a column sized
 * by viewport height, so short windows pay in full. 96px against a 48px rail
 * was 48px of such margin, more than the rail itself, and it left 68px of title
 * at 844x390 where 104px was clear of the buttons. Today: 12px of gap on the
 * desktop band, 22px on phones (they reserve with `right:` and their rail is
 * 50px wide). This bound is what the first version of the contract lacked.
 */
const MAX_GAP = 24

const INFO = '.feed-panel.fullscreen .feed-card-info'
const RAIL = '.feed-panel.fullscreen .feed-card-actions'
const RAIL_ICON = '.feed-panel.fullscreen .action-btn svg'
const INNER = '.feed-panel.fullscreen .feed-card-inner'
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
 * Does this @media condition hold at this viewport? Only the forms this file
 * uses: min/max-width and min/max-height, joined by `and`. Anything else throws
 * rather than quietly counting as "no match" -- a media query the resolver
 * cannot read is a hole in the contract, not a pass.
 */
function matches(media: string | null, vp: Viewport): boolean {
  if (!media) return true
  const conditions = media.match(/\([^)]*\)/g) || []
  const bare = (s: string) => s.replace(/\s+/g, '')
  if (conditions.length === 0 || bare(conditions.join('and')) !== bare(media)) {
    throw new Error(`media query this test cannot read: @media ${media}`)
  }
  return conditions.every(c => {
    const m = c.match(/^\((min|max)-(width|height):\s*(\d+)px\)$/)
    if (!m) throw new Error(`media condition this test cannot read: ${c}`)
    const seen = m[2] === 'width' ? vp.width : vp.height
    return m[1] === 'min' ? seen >= +m[3] : seen <= +m[3]
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

/**
 * One side of a `padding` shorthand: 1 value = all four, 2 = block/inline,
 * 3 = top/inline/bottom, 4 = top/right/bottom/left.
 *
 * It splits on spaces, so a shorthand carrying a function with spaces --
 * `calc(96px + 4px)`, `max(60px, 30%)` -- mis-parses. The mis-parse yields a
 * non-px token, px() returns null and the side reads as 0, which fails the
 * geometry test loudly. A false failure, never a false pass: teach this
 * function about parens before putting a function into these paddings.
 */
function shorthandSide(value: string, side: 'right' | 'left'): string {
  const parts = value.split(' ').filter(Boolean)
  if (parts.length === 1) return parts[0]
  if (parts.length < 4) return parts[1]
  return side === 'right' ? parts[1] : parts[3]
}

/**
 * Resolve the offsets and paddings of a selector at a viewport. Every rule
 * collected here uses the identical three-class selector, so source order alone
 * decides the winner -- asserted by `singleSpecificity` below.
 */
function resolve(
  rules: Rule[],
  selector: string,
  vp: Viewport,
  vars: Record<string, string>
) {
  let left: number | null = null
  let right: number | null = null
  let paddingLeft: number | null = null
  let paddingRight: number | null = null
  let iconWidth: number | null = null
  for (const rule of rules) {
    if (rule.selector !== selector || !matches(rule.media, vp)) continue
    const shorthand = decl(rule.decls, 'padding')
    if (shorthand) {
      paddingRight = px(shorthandSide(shorthand, 'right'), vars)
      paddingLeft = px(shorthandSide(shorthand, 'left'), vars)
    }
    const right0 = decl(rule.decls, 'padding-right')
    if (right0) paddingRight = px(right0, vars)
    const left0 = decl(rule.decls, 'padding-left')
    if (left0) paddingLeft = px(left0, vars)
    const r = decl(rule.decls, 'right')
    if (r !== null) right = px(r, vars)
    const l = decl(rule.decls, 'left')
    if (l !== null) left = px(l, vars)
    const w = decl(rule.decls, 'width')
    if (w) iconWidth = px(w, vars)
  }
  return { left, right, paddingLeft, paddingRight, iconWidth }
}

/**
 * The card's own width at a viewport -- the box every padding below is taken
 * out of. Above 768px it is the 9:16 column derived from the viewport HEIGHT,
 * which is the whole reason the heights are pinned. Only the two forms this
 * stylesheet uses; anything else throws.
 */
function innerWidth(
  rules: Rule[],
  vp: Viewport,
  vars: Record<string, string>
): number {
  let value: string | null = null
  for (const rule of rules) {
    if (rule.selector !== INNER || !matches(rule.media, vp)) continue
    const maxWidth = decl(rule.decls, 'max-width')
    if (maxWidth) value = maxWidth
  }
  if (!value || value === '100%') return vp.width
  const m = value.match(/^calc\(\(100dvh - (\d+)px\) \* ([\d.]+)\)$/)
  if (!m) {
    throw new Error(
      `.feed-card-inner max-width this test cannot read: ${value}`
    )
  }
  return Math.min(vp.width, (vp.height - +m[1]) * +m[2])
}

const round = (n: number) => +n.toFixed(3)

/** What each side claims, and what is left over for the text. */
function geometry(css: string) {
  const rules = parse(css)
  const panel = rules.find(r => r.selector === PANEL && !r.media)
  const vars: Record<string, string> = {}
  const reserve = panel && decl(panel.decls, '--feed-rail-reserve')
  if (reserve) vars['--feed-rail-reserve'] = reserve
  return VIEWPORTS.map(vp => {
    const info = resolve(rules, INFO, vp, vars)
    const rail = resolve(rules, RAIL, vp, vars)
    const icon = resolve(rules, RAIL_ICON, vp, vars)
    const card = innerWidth(rules, vp, vars)
    // The text stops this far from the card's right edge...
    const textStops = (info.right ?? 0) + (info.paddingRight ?? 0)
    // ...and the rail runs out to here. Its box can be wider than its icon
    // (the "Remix" label, a "1.2K" count), so the measured box wins.
    const railEnds =
      (rail.right ?? 0) + Math.max(vp.railBox, icon.iconWidth ?? 0)
    // ...which leaves this much for the title, the author and the description.
    const column = round(
      card - (info.left ?? 0) - (info.paddingLeft ?? 0) - textStops
    )
    return {
      at: `${vp.width}x${vp.height}`,
      note: vp.note,
      card: round(card),
      column,
      textStops,
      railEnds,
      gap: round(textStops - railEnds),
    }
  })
}

/** Every complaint about the file; empty means the contract holds. */
function problems(css: string): string[] {
  const out: string[] = []
  const rules = parse(css)

  for (const row of geometry(css)) {
    if (row.gap < 0) {
      out.push(
        `at ${row.at} the text column ends ${row.textStops}px from the ` +
          `card's right edge but the action rail runs to ${row.railEnds}px`
      )
    } else if (row.gap > MAX_GAP) {
      out.push(
        `at ${row.at} the reserve stops ${row.textStops}px from the card's ` +
          `right edge for a rail that ends at ${row.railEnds}px -- ${row.gap}px ` +
          `of gap, leaving ${row.column}px of text in a ${row.card}px card`
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
    .filter(r => /\.feed-card-(info|actions|inner)\b/.test(r.selector))
    .filter(
      r =>
        classes(r.selector) !==
        classes(r.selector.includes('fullscreen') ? INFO : '.feed-card-info')
    )
    .map(r => `selector of unexpected specificity: ${r.selector}`)
}

describe('feed card text stays out of the action rail', () => {
  const css = fs.readFileSync(CSS, 'utf8')

  it('the reserve clears the rail without eating the card', () => {
    expect(problems(css).filter(p => p.startsWith('at '))).toEqual([])
  })

  it('the whole flex chain down to the title can shrink', () => {
    expect(problems(css)).toEqual([])
  })

  it('card, text column, reserve and rail at every measured viewport', () => {
    // Printed as a table so a future change shows the numbers it moved. The
    // column is what the title, the author line and the description share;
    // text<= and rail<= are px from the card's right edge.
    expect(
      geometry(css).map(
        r =>
          `${r.at}: card=${r.card} column=${r.column} ` +
          `text<=${r.textStops} rail<=${r.railEnds}`
      )
    ).toEqual([
      '1723x720: card=373.5 column=289.5 text<=60 rail<=48',
      '1440x900: card=474.75 column=390.75 text<=60 rail<=48',
      '1280x500: card=249.75 column=165.75 text<=60 rail<=48',
      '844x390: card=187.875 column=103.875 text<=60 rail<=48',
      '820x720: card=373.5 column=289.5 text<=60 rail<=48',
      '390x844: card=390 column=306 text<=72 rail<=50',
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
    // Every viewport on the >= 768px band; the phone rules are separate.
    expect(found).toHaveLength(5)
    expect(found[0]).toContain('at 1723x720 the text column ends 24px')
  })

  it('catches a reserve wider than the rail needs (negative control)', () => {
    // The number this file carried before it was measured against the card:
    // 96px of reserve for a rail that ends at 48px.
    const broken = css.replace(
      '--feed-rail-reserve: 60px;',
      '--feed-rail-reserve: 96px;'
    )
    expect(broken).not.toEqual(css)
    const found = problems(broken).filter(p => p.startsWith('at '))
    expect(found).toHaveLength(5)
    expect(found[0]).toContain('48px of gap')
    // What that cost the shortest viewport measured: two thirds of the title.
    const short = geometry(broken).find(r => r.at === '844x390')
    expect(short?.column).toBe(67.875)
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
