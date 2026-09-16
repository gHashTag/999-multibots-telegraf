/**
 * THE ACTION RAIL MUST BE BOUNDED BY THE CARD, AND MUST NOT TAKE TAPS IT DOES
 * NOT USE.
 *
 * The rail was `bottom: 140px` with six fixed-size buttons, so its height was a
 * constant 388px while the card is one viewport tall. Measured live:
 *
 *   - At 1087x430 -- the size the game's TRI tab gives the embedded player --
 *     the rail needed 528px inside a 374px card. `.feed-card` is
 *     overflow: hidden, so its top 154px were CUT AWAY. link, sound and star
 *     were absent from elementsFromPoint entirely; a covered element still
 *     appears in that list below its coverer, a clipped one does not.
 *   - At a frame of 804x610 the same fixed height put the top button inside the
 *     floating Recent/Popular chips, and it hit-tested to `.feed-sort`.
 *
 * Two symptoms, one cause: nothing bounded the rail. It is now anchored top and
 * bottom inside the card and its contents scale with viewport height -- what
 * TikTok's own embed ships (`top: 0; height: 100%`, and not one height media
 * query in their player stylesheet).
 *
 * The fix created a second hazard, which is why this file also guards pointer
 * events: a bounded rail is TALLER than its buttons (454px at 1723x720, 618px
 * on a phone, with the buttons clustered at the bottom). The container declares
 * pointer-events: auto in the base rule, so that empty column would swallow
 * every tap meant for the video behind it. Measured in one document with one
 * variable: with `auto` the point above the first button resolves to
 * `.feed-card-actions`; with `none` it resolves to `.feed-card-video`.
 *
 * WHY THIS FILE EXISTS NEXT TO feed-card-text-clears-the-action-rail. That
 * contract is about the TEXT column's reserve. Run against the broken rail
 * model above it passes six of its seven assertions -- it cannot see this
 * defect class at all. A test that cannot fail on the bug is not covering it,
 * so the bug gets its own ruler, with the mutations that prove it can fail.
 *
 * jsdom has no layout engine, so this resolves declarations rather than pixels.
 * The pixel measurements live in the session's probes (reachability-live.mjs,
 * card-attribution.mjs, local-frame-measure.mjs) and in the PR body.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const CSS_PATH = join(__dirname, '..', 'components', 'Panels', 'FeedPanel.css')
const css = readFileSync(CSS_PATH, 'utf8')

/** WCAG 2.5.8 AA: a pointer target is at least 24 by 24 CSS px. */
const TARGET_FLOOR = 24
/** What the desktop band used to pin, and what the clamp must still reach. */
const ICON_CAP = 36

/**
 * Every declaration block whose selector list contains `selector` exactly,
 * in source order, with the media condition it sits under (null at top level).
 * Written by hand because the repository has no CSS parser and this file must
 * not add a dependency to read six rules.
 */
function blocks(
  source: string,
  selector: string
): { media: string | null; decls: string }[] {
  const out: { media: string | null; decls: string }[] = []
  // Track the innermost at-rule prelude by scanning brace depth.
  const stack: (string | null)[] = []
  let i = 0
  while (i < source.length) {
    const open = source.indexOf('{', i)
    if (open === -1) break
    const close = source.indexOf('}', i)
    if (close !== -1 && close < open) {
      stack.pop()
      i = close + 1
      continue
    }
    const head = source
      .slice(i, open)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .trim()
    if (head.startsWith('@')) {
      stack.push(head)
      i = open + 1
      continue
    }
    const end = source.indexOf('}', open)
    const decls = source.slice(open + 1, end === -1 ? source.length : end)
    const selectors = head.split(',').map(s => s.trim())
    if (selectors.includes(selector)) {
      const media =
        [...stack].reverse().find(s => s && s.startsWith('@media')) ?? null
      out.push({ media, decls })
    }
    i = (end === -1 ? source.length : end) + 1
  }
  return out
}

/**
 * Comments come out FIRST, before anything is split. These rules carry long
 * comments that themselves contain colons ("pointer-events: auto on this
 * container..."), and splitting on `:` before stripping them read the property
 * name out of the middle of a sentence -- the checker then reported that a
 * declaration it was looking at did not exist. Found by this file's own
 * assertions failing on a stylesheet that was correct.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '')
}

function decl(decls: string, prop: string): string | null {
  for (const part of withoutComments(decls).split(';')) {
    const idx = part.indexOf(':')
    if (idx === -1) continue
    if (part.slice(0, idx).trim() === prop) return part.slice(idx + 1).trim()
  }
  return null
}

/** The px numbers inside a clamp(), in order: floor, preferred, cap. */
function clampBounds(value: string): { floor: number; cap: number } | null {
  const m = value.match(/clamp\(\s*([^,]+),\s*([^,]+),\s*([^)]+)\)/)
  if (!m) return null
  const px = (s: string) => Number(String(s).trim().replace('px', ''))
  return { floor: px(m[1]), cap: px(m[3]) }
}

const RAIL = '.feed-panel.fullscreen .feed-card-actions'
const RAIL_BTN = '.feed-panel.fullscreen .action-btn'
const RAIL_ICON = '.feed-panel.fullscreen .action-btn svg'

/** The checks, as functions over a stylesheet, so mutants can be run through them. */
const checks = {
  boundedTopAndBottom(source: string): string[] {
    const base = blocks(source, RAIL).find(b => b.media === null)
    if (!base) return ['no top-level rule for the fullscreen rail']
    const bad: string[] = []
    const top = decl(base.decls, 'top')
    const bottom = decl(base.decls, 'bottom')
    const height = decl(base.decls, 'height')
    if (!top || !top.includes('--feed-chrome-top'))
      bad.push('the rail sets no top inset from --feed-chrome-top')
    if (!bottom || !bottom.includes('--feed-rail-bottom'))
      bad.push('the rail sets no bottom reserve from --feed-rail-bottom')
    if (height !== 'auto')
      bad.push(
        `the rail must let the bounds decide its height, found height: ${height ?? 'nothing'}`
      )
    return bad
  },

  noFixedHeightAnywhere(source: string): string[] {
    return blocks(source, RAIL)
      .map(b => decl(b.decls, 'height'))
      .filter((h): h is string => !!h && h !== 'auto')
      .map(h => `a rule pins the rail's height to ${h}`)
  },

  /**
   * No rule may reintroduce a bare `bottom` on the rail: that is how the
   * reserve came adrift from the box in the first place -- one rule set the
   * shorthand and the next one silently replaced it.
   */
  bottomOnlyThroughTheVariable(source: string): string[] {
    return blocks(source, RAIL)
      .map(b => decl(b.decls, 'bottom'))
      .filter((v): v is string => !!v && !v.includes('--feed-rail-bottom'))
      .map(
        v =>
          `a rule sets the rail's bottom directly (${v}) instead of --feed-rail-bottom`
      )
  },

  iconScalesWithinReach(source: string): string[] {
    const rule = blocks(source, RAIL_ICON).find(b => b.media === null)
    if (!rule) return ['no top-level icon size rule']
    const bad: string[] = []
    for (const prop of ['width', 'height']) {
      const value = decl(rule.decls, prop)
      const bounds = value ? clampBounds(value) : null
      if (!bounds) {
        bad.push(
          `icon ${prop} is ${value ?? 'unset'}, not a clamp -- a fixed icon is what made the rail a constant 388px`
        )
        continue
      }
      if (bounds.floor < TARGET_FLOOR)
        bad.push(
          `icon ${prop} may shrink to ${bounds.floor}px, below the ${TARGET_FLOOR}px target floor`
        )
      if (bounds.cap > ICON_CAP)
        bad.push(
          `icon ${prop} may grow to ${bounds.cap}px, past the ${ICON_CAP}px the desktop band used to pin`
        )
    }
    return bad
  },

  railGivesUpPointerEvents(source: string): string[] {
    const base = blocks(source, RAIL).find(b => b.media === null)
    const btn = blocks(source, RAIL_BTN).find(b => b.media === null)
    const bad: string[] = []
    if (decl(base?.decls ?? '', 'pointer-events') !== 'none') {
      bad.push(
        'the bounded rail is taller than its buttons; its container must not take pointer events'
      )
    }
    if (decl(btn?.decls ?? '', 'pointer-events') !== 'auto') {
      bad.push(
        'the buttons must take pointer events themselves once the container gives them up'
      )
    }
    return bad
  },
}

describe('the feed card action rail is bounded by the card', () => {
  it('is anchored top and bottom instead of hanging from a fixed offset', () => {
    expect(checks.boundedTopAndBottom(css)).toEqual([])
  })

  it('never pins its own height', () => {
    expect(checks.noFixedHeightAnywhere(css)).toEqual([])
  })

  it('reserves space at the bottom only through the shared variable', () => {
    expect(checks.bottomOnlyThroughTheVariable(css)).toEqual([])
  })

  it('scales its icons with the viewport but never below a pressable size', () => {
    expect(checks.iconScalesWithinReach(css)).toEqual([])
  })

  it('leaves the taps in its empty column to the video behind it', () => {
    expect(checks.railGivesUpPointerEvents(css)).toEqual([])
  })

  /**
   * NEGATIVE CONTROLS. Each mutant is the defect as it actually shipped, so a
   * checker that stays silent here is not checking anything. These run on
   * copies of the stylesheet in memory; the file on disk is never touched.
   */
  describe('each checker fails on the stylesheet that shipped the bug', () => {
    it('catches the rail hanging from a fixed offset again', () => {
      const mutant = css.replace(
        /  top: var\(--feed-chrome-top, 70px\);\n  bottom: var\(--feed-rail-bottom, 120px\);\n  height: auto;/,
        '  bottom: 140px;'
      )
      expect(mutant).not.toEqual(css)
      expect(checks.boundedTopAndBottom(mutant).length).toBeGreaterThan(0)
    })

    it('catches a fixed icon size coming back', () => {
      const mutant = css.replace(
        /width: clamp\(24px, 5vh, 36px\);/,
        'width: 36px;'
      )
      expect(mutant).not.toEqual(css)
      expect(checks.iconScalesWithinReach(mutant).length).toBeGreaterThan(0)
    })

    it('catches an icon allowed to shrink below the target floor', () => {
      const mutant = css.replace(
        /width: clamp\(24px, 5vh, 36px\);/,
        'width: clamp(16px, 5vh, 36px);'
      )
      expect(mutant).not.toEqual(css)
      expect(
        checks
          .iconScalesWithinReach(mutant)
          .some(m => m.includes('target floor'))
      ).toBe(true)
    })

    it('catches a bare bottom offset written on the rail itself', () => {
      // The mutation has to land on a RAIL rule: writing `bottom` on
      // .feed-panel.fullscreen sets it on the panel, which this checker does
      // not look at and should not -- the first version of this control
      // mutated the panel and proved nothing.
      const mutant = css.replace(
        /  bottom: var\(--feed-rail-bottom, 120px\);/,
        '  bottom: 140px;'
      )
      expect(mutant).not.toEqual(css)
      expect(
        checks.bottomOnlyThroughTheVariable(mutant).length
      ).toBeGreaterThan(0)
    })

    it('catches the empty column taking taps again', () => {
      // Mutate INSIDE the rail's own block. `css.replace('pointer-events:
      // none', ...)` without an anchor hits the first such declaration in the
      // file, which belongs to another rule entirely: the stylesheet changed,
      // the rail did not, and the checker was right to stay silent. The first
      // version of this control did exactly that and proved nothing.
      const at = css.indexOf(`${RAIL} {`)
      expect(at).toBeGreaterThan(-1)
      const mutant =
        css.slice(0, at) +
        css.slice(at).replace('pointer-events: none;', 'pointer-events: auto;')
      expect(mutant).not.toEqual(css)
      expect(checks.railGivesUpPointerEvents(mutant).length).toBeGreaterThan(0)
    })
  })
})
