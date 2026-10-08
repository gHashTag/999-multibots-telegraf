/**
 * TRI SHOT DRAWS TELEGRAM'S LINE FROM THE SPEC, NOT FROM ITS OWN NUMBERS.
 *
 * crm-first-screen.t27 holds Telegram's fullscreen insets (its row and the
 * status bar on top, the home indicator below). `tri shot crm` measures the
 * work tab against that line, so the numbers must come from the spec's
 * generated module: a 34 typed into the tool would drift silently the day
 * the spec changes. This lives at the root, not in the player, because the
 * player's image is built without bin/ (testGateExclude.test.ts).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(__dirname, '../../..')
const shot = readFileSync(resolve(ROOT, 'bin/helpers/shot.mjs'), 'utf8')

describe('tri shot and crm-first-screen.t27', () => {
  it('imports the spec it measures by', () => {
    expect(shot).toContain("'src/spec/crm-first-screen.gen.ts'")
  })

  it("takes Telegram's insets from the spec, none typed by hand", () => {
    expect(shot).toMatch(/FIRST\.TG_DEVICE_TOP_PX \+ FIRST\.TG_BUTTONS_TOP_PX/)
    expect(shot).toContain('bottom: FIRST.TG_HOME_BOTTOM_PX')
    expect(shot).not.toMatch(/\b(105|59|46|34)\b.*foldInsets/)
  })

  it("holds the CRM's load state to Telegram's line, Prepare included", () => {
    // The crm stand alone: crm-auto-on, next to it, says the same lines.
    const crm = shot.slice(
      shot.indexOf('  crm: {'),
      shot.indexOf("'crm-auto-on': {")
    )
    expect(crm).toContain('foldInsets: TELEGRAM')
    expect(crm).toContain("['.crm__list .crm__prepare', FIRST.PILLS_MIN_PX]")
  })

  // v2: AUTO on is one line on a phone, and its Turn off is on that line --
  // on Telegram's first screen, measured with AUTO actually on.
  it('measures the AUTO line switched on, its Turn off on the first screen', () => {
    const stand = shot.slice(shot.indexOf("'crm-auto-on': {"))
    expect(stand).toContain("query: '?auto=on'")
    expect(stand.slice(0, stand.indexOf('foldInsets'))).toContain(
      "'.crm-auto__stop',"
    )
    expect(stand).toContain('foldInsets: TELEGRAM')
  })

  // The AUTO word once ran under its own Turn off with cut 0 and overlap 0:
  // a button that paints its words past its right edge is a cut.
  it('counts a button whose words run past its right edge', () => {
    expect(shot).toMatch(
      /overflowX === 'visible' &&\s+el\.scrollWidth > el\.clientWidth \+ 1\s+\)\s+cut\.push\(`\$\{name\(el\)\} spills \$\{el\.scrollWidth\}>\$\{el\.clientWidth\} right`\)/
    )
  })
})
