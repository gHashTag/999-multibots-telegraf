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

  it('every way OUT of a screen is finger-sized', () => {
    /*
     * Found by re-measuring a week after the first sweep: the client page's
     * breadcrumb was 20px and the group screen's "back to CRM" was 24 and
     * carried no class at all. My first sweep had covered /crm and /chat and
     * never opened /crm/:id -- a target list is only as good as the screens
     * it was taken on.
     *
     * A way back is not decoration: miss it and the person is left on a
     * screen whose only exit is the tab bar.
     */
    const crmClient = read('pages/CrmClient.css')
    for (const [css, sel] of [
      [crmClient, '.crm-client__crumb'],
      [crm, '.crm__back'],
    ] as const) {
      const blocks = ruleFor(css, sel)
      expect(blocks.length, `${sel} must have rules`).toBeGreaterThan(0)
      expect(
        blocks[blocks.length - 1]!.includes(TARGET),
        `${sel} is a way out of a screen and must be finger-sized`
      ).toBe(true)
    }
  })

  it('the script screen, walked by the route list rather than by memory', () => {
    /*
     * Eighteen controls here were under the target -- the tone and topic
     * chips at 28px, the voice button at 32, the select at 40 -- on a screen
     * somebody writes on. None of it was a regression: the first sweeps had
     * covered /crm and /chat and never opened /generate/script.
     *
     * Route list, not memory (form 203). This one is pinned because it is
     * the largest single set of targets in the app.
     */
    const script = read('pages/Script.css')
    for (const sel of [
      '.script-chip',
      '.script-select',
      '.script-voice-btn',
      '.script-templates-toggle',
    ]) {
      const blocks = ruleFor(script, sel)
      expect(blocks.length, `${sel} must have rules`).toBeGreaterThan(0)
      expect(
        blocks[blocks.length - 1]!.includes(TARGET) ||
          blocks[blocks.length - 1]!.includes('width: var(--touch-target'),
        `${sel} is tapped while writing and must be finger-sized`
      ).toBe(true)
    }
    expect(script, 'and only where the pointer is coarse').toContain(
      '@media (pointer: coarse)'
    )
  })

  it('a slider is dragged, and a delete must be seen before it is hit', () => {
    /*
     * The last two screens on the route list, and the two worst shapes on
     * it:
     *
     *  - the editor's volume control is a 4px track. It is DRAGGED, which is
     *    harder than tapping, and it was the thinnest target in the app;
     *  - the template card's delete is 18x18 AND `opacity: 0` until hover --
     *    and a phone has no hover. An invisible corner that removes things:
     *    it asks first, which is the only reason this was a defect rather
     *    than an accident, but a control nobody can see is one nobody can
     *    use on purpose either.
     */
    const timeline = read('components/Timeline/Timeline.css')
    const templates = read('components/Panels/TemplatesPanel.css')

    const sliderRule = ruleFor(timeline, '.volume-slider').at(-1)!
    expect(sliderRule, 'the volume slider must be grabbable').toContain(
      'height: var(--touch-target'
    )
    expect(
      timeline,
      'and the thin LOOK moves to the track, so nothing changes visually'
    ).toContain('::-webkit-slider-runnable-track')

    const del = ruleFor(templates, '.template-card-delete').at(-1)!
    expect(del, 'a delete must be finger-sized').toContain(
      'width: var(--touch-target'
    )
    expect(del, 'and visible where there is no hover').toContain('opacity: 1')
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
