/**
 * THE MOST CONSEQUENTIAL BUTTON ON THE SCREEN WAS THE SMALLEST ONE.
 *
 * Measured in the pane at 375px, 25.09.2026: the AUTO switch -- which decides
 * whether the account writes to people BY ITSELF -- stood 28px tall, because
 * it carried no size rule at all. The screen's own heading button, four
 * hundred lines up in the same file, already had
 * `min-height: var(--touch-target, 44px)`. The rule was agreed and applied to
 * some of the controls it covers, as remedies in this repository tend to be
 * (form 187).
 *
 * This reads the stylesheets rather than the rendered page on purpose: the
 * rendered check belongs in the browser, where it was done, and what has to
 * survive a refactor is that these selectors keep the rule at all. A guard
 * that needs a browser does not run in the suite, and a rule nothing guards
 * comes back off.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')

const crm = read('pages/Crm.css')
const chat = read('pages/Chat.css')

/** The declared target, wherever it is written. */
const TARGET = 'min-height: var(--touch-target, 44px)'

/** The block a selector's rule lives in, base or inside a media query. */
function ruleFor(css: string, selector: string): string[] {
  const out: string[] = []
  const re = new RegExp(
    `(^|[\\s,}])${selector.replace('.', '\\.')}\\s*\\{([^}]*)\\}`,
    'g'
  )
  let m: RegExpExecArray | null
  while ((m = re.exec(css))) out.push(m[2]!)
  return out
}

describe('a finger is 44px wherever it is attached', () => {
  it('the AUTO switch carries the target, and not only on a phone', () => {
    // A mis-tap here either starts autonomous sending or fails to stop it,
    // so this one does not hide behind a media query.
    const blocks = ruleFor(crm, '.crm-auto__btn')
    expect(blocks.length, 'the selector must exist').toBeGreaterThan(0)
    expect(blocks.some(b => b.includes(TARGET))).toBe(true)
  })

  it('the chips and "a new conversation" carry it where the pointer is coarse', () => {
    for (const [css, sel] of [
      [crm, '.crm__chip'],
      [chat, '.chat-reset'],
    ] as const) {
      expect(
        ruleFor(css, sel).some(b => b.includes(TARGET)),
        `${sel} has no touch target`
      ).toBe(true)
      expect(css, `${sel} must grow for fingers, not for mice`).toContain(
        '@media (pointer: coarse)'
      )
    }
  })

  it('THE TRAP: the LAST rule for the selector is the one with the target', () => {
    /*
     * Same specificity, so the later declaration wins. Written above the base
     * rule first, the media query matched on the phone and changed nothing --
     * measured as 32px with `(pointer: coarse)` reporting true. The order is
     * the whole fix, and it is invisible in a diff.
     *
     * The first version of this guard compared indexOf(selector) with
     * indexOf(target) and PASSED the mutation that moves the block back above
     * -- because the selector then appears first INSIDE the media query, so
     * "the target comes later" was true of the wrong rule. Ask the property
     * that actually decides instead: of all the blocks for this selector, the
     * LAST one is what the browser applies, and that is the one that must
     * carry the target.
     */
    for (const [css, sel] of [
      [crm, '.crm__chip'],
      [chat, '.chat-reset'],
    ] as const) {
      const blocks = ruleFor(css, sel)
      expect(blocks.length, `${sel} must have rules`).toBeGreaterThan(1)
      expect(
        blocks[blocks.length - 1]!.includes(TARGET),
        `the LAST rule for ${sel} decides, and it must be the one with the target`
      ).toBe(true)
    }
  })
})
