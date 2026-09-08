import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A REFUSAL WAS BEING ANNOUNCED AS A SUCCESS.
 *
 * textToVideoWizard called generateTextToVideo and, for every result that was
 * not a finished video, printed:
 *
 *     `✅ ${response.message || 'Video generation started!'}`
 *
 * A money refusal sets `error` and leaves `message` undefined. So somebody who
 * had just been refused for want of stars saw a GREEN TICK and the words
 * "generation started", and the text of the refusal was never shown at all.
 * Worse than a refusal with no button: a refusal the person does not know
 * happened, followed by a wait for a video that is not coming.
 *
 * This is the ratchet for that path. The wider question -- how many other
 * failure branches send a success marker -- is a lead, not a verdict: a crude
 * sweep turns up two dozen candidates and most `} else {` branches are not
 * failure branches at all. It is named here so the next reader knows the sweep
 * exists and that its number has not been adjudicated.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const code = (t: string) =>
  t
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)
const read = (rel: string) =>
  code(fs.readFileSync(path.join(REPO, rel), 'utf8'))

describe('a refusal is shown as a refusal', () => {
  it('the service says when the failure was about money', () => {
    const src = read('src/services/generateTextToVideo.ts')
    expect(src).toContain('insufficientFunds?: boolean')
    // Set on the 402 branch, and only there: a provider error must not offer
    // a top-up button.
    expect(
      (src.match(/insufficientFunds:\s*true/g) || []).length,
      'exactly the money branch raises it'
    ).toBe(1)
    const at402 = src.indexOf('error.response?.status === 402')
    const flag = src.indexOf('insufficientFunds: true')
    expect(at402, 'the 402 branch must exist').toBeGreaterThan(-1)
    expect(
      flag > at402 && flag - at402 < 400,
      'the flag must be raised inside the 402 branch'
    ).toBe(true)
  })

  it('the error is what goes out, before any success wording', () => {
    const src = read('src/scenes/textToVideoWizard/simple.ts')

    const errBranch = src.indexOf('} else if (response.error) {')
    const tickBranch = src.search(/✅ \$\{response\.message/)
    expect(
      errBranch,
      'a failed result must have its own branch'
    ).toBeGreaterThan(-1)
    expect(
      tickBranch,
      'the success wording must still exist for the accepted case'
    ).toBeGreaterThan(-1)
    expect(
      errBranch < tickBranch,
      'the error branch must come FIRST, or a refusal falls through to the tick'
    ).toBe(true)

    // The refusal itself is sent, not swallowed.
    expect(src).toMatch(/await ctx\.reply\(\s*response\.error/)
  })

  it('the button is offered only when money is what is missing', () => {
    const src = read('src/scenes/textToVideoWizard/simple.ts')
    expect(src).toMatch(
      /response\.insufficientFunds\s*\?\s*standardButtons\(isRu\)/
    )
    // A provider failure must not carry one: the ternary has an else.
    expect(src).toMatch(/response\.insufficientFunds[\s\S]{0,80}:\s*undefined/)
  })
})
