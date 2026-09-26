/**
 * THE REMEDY THAT STOPS HALFWAY THROUGH ITS OWN FAMILY.
 *
 * Yesterday the client LIST learned to say a screen-wide failure once
 * instead of five times. Today the client PAGE was measured at 375px: six
 * panels, six identical lines, no notice. I had applied my own fix to one of
 * the two screens that share the panel -- the third time this week that the
 * cheapest defect in this repository was a rule wired into one sibling.
 *
 * So the rule is guarded across the FAMILY rather than per screen: every
 * file that renders the shared Panel must also know how to say it once. A
 * new screen with panels and no notice fails here on the day it is written,
 * which is the only way this stops recurring.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(__dirname, '..')

/** Every source file (not tests) that renders the shared Panel. */
function panelScreens(): string[] {
  const found: string[] = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name)
      if (e.isDirectory()) {
        if (e.name !== '__tests__' && e.name !== 'node_modules') walk(full)
        continue
      }
      if (!e.name.endsWith('.tsx') || e.name.includes('.test.')) continue
      const text = fs.readFileSync(full, 'utf8')
      if (
        text.includes("from '@/components/Crm/Panel'") &&
        /<Panel[\s>]/.test(text)
      )
        found.push(full)
    }
  }
  walk(SRC)
  return found
}

describe('every screen with panels says a shared failure once', () => {
  it('finds the screens at all', () => {
    // Negative control: an empty list would satisfy every assertion below.
    expect(panelScreens().length).toBeGreaterThan(2)
  })

  it('each of them knows the notice, and can quiet a panel', () => {
    const missing: string[] = []
    for (const file of panelScreens()) {
      const text = fs.readFileSync(file, 'utf8')
      /*
       * RENDERED, not merely imported. The first version of this guard asked
       * for the word "AllRefused" and PASSED the mutation that deletes the
       * notice -- because the file still imports `coveredByNotice` FROM
       * '@/components/Crm/AllRefused', and the path carries the word. A guard
       * that matches a string appearing for another reason checks nothing.
       */
      const knowsNotice = /<AllRefused[\s/>]/.test(text)
      const canQuiet = /quiet=\{/.test(text)
      /*
       * A panel COMPONENT is not a screen: it has no view of the others, so
       * it cannot decide that they all failed. It takes the reason from the
       * parent that can (TrafficPanel). Either shape satisfies the rule --
       * what does not is rendering panels and having no way to say a shared
       * failure once.
       *
       * Matched on the PROP DECLARATION (`noticeReason?:`), not on the word:
       * a screen COMPUTES `const noticeReason = oneReasonForAll(...)`, so a
       * looser pattern let the deleted-notice mutation pass a second time.
       */
      const takesNoticeFromParent = /noticeReason\?:/.test(text)
      if ((!knowsNotice && !takesNoticeFromParent) || !canQuiet)
        missing.push(path.relative(SRC, file))
    }
    expect(
      missing,
      'these render panels but cannot say a shared failure once:\n' +
        missing.join('\n')
    ).toEqual([])
  })

  it('the panel itself still speaks when it is NOT quieted', () => {
    // The rule this must never erase: a lone broken panel says so in place.
    const panel = fs.readFileSync(
      path.join(SRC, 'components/Crm/Panel.tsx'),
      'utf8'
    )
    expect(panel).toContain('crm__unreachable')
    expect(panel, 'quiet must be opt-in, never the default').toMatch(
      /quiet\s*=\s*false/
    )
  })
})
