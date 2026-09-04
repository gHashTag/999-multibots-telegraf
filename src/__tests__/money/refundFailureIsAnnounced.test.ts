import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { ifElseBlocks } = require('../../../scripts/lib/call-args.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { blank } = require('../../../scripts/lib/blank-code.cjs')

/**
 * `updateUserBalance` returns false WITHOUT throwing when the payer row is
 * missing or the database errors. So a refund can fail while no exception is
 * raised, and the `if (refundSuccess)` branch is simply skipped.
 *
 * Two wizards announced only the success. On a failed refund the user was told
 * nothing at all about money: the generation failed, the stars did not come
 * back, and the only trace was a log line. That is the worst of the three
 * outcomes, because the user has no reason to ask.
 *
 * Two other places in this repository already get it right and were used as
 * the model: aiCoverWizard distinguishes "funds refunded" from "automatic
 * refund failed -- contact support", and async-lipsync-manager returns the
 * support message when the refund returns false.
 *
 * The rule pinned here is a PAIR, per file: a file that can tell a user their
 * money came back must also be able to tell them it did not. Nothing about
 * balances changes -- this is only what the user is told.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

// The Cyrillic lives in string literals: a regex literal is code, and the repo
// requires code outside string literals to stay ASCII.
const CLAIMS_REFUNDED = new RegExp('Средства возвращены|Refunded:')
const ADMITS_FAILURE = new RegExp(
  'не удалось|not.*automatically|contact support|поддержку'
)

/** Files that tell a user a refund happened. */
const ANNOUNCERS = [
  'src/scenes/musicGenerationWizard/index.ts',
  'src/scenes/videoTranscriptionWizard/index.ts',
  'src/core/lipsync/async-lipsync-manager.ts',
]

describe('a refund that failed is announced too', () => {
  it('every file that claims a refund can also admit it failed', () => {
    const silent: string[] = []
    for (const f of ANNOUNCERS) {
      const src = read(f)
      if (!CLAIMS_REFUNDED.test(src)) continue
      if (!ADMITS_FAILURE.test(src)) silent.push(f)
    }
    expect(silent).toEqual([])
  })

  it('the two fixed wizards branch on the result both ways', () => {
    // Not just "the words exist somewhere in the file": the failure message
    // must sit in the else of the success check, or the file could satisfy the
    // rule above with an unrelated sentence.
    for (const f of [
      'src/scenes/musicGenerationWizard/index.ts',
      'src/scenes/videoTranscriptionWizard/index.ts',
    ]) {
      // The ELSE BRANCH itself, not 2000 characters after the anchor. That
      // window was carrying the verdict -- halving it turned this red -- and it
      // accepted an admission of failure anywhere in those 2000 characters,
      // including inside the SUCCESS branch, which is the one shape the rule
      // exists to forbid.
      const raw = read(f)
      const { consequent, start, end } = ifElseBlocks(
        blank(raw),
        'if \\(refundSuccess\\)'
      )
      expect(consequent, `${f}: no success branch`).not.toBe('')
      expect(start, `${f}: no else branch`).toBeGreaterThan(-1)
      // Sliced from the RAW source by the block's offsets: the mask blanks
      // string-literal CONTENTS, so the user-facing sentence this rule is about
      // is invisible in the masked text.
      expect(
        raw.slice(start, end),
        `${f}: the else branch does not admit the failure`
      ).toMatch(ADMITS_FAILURE)
    }
  })

  it('still says the amount in the failure message, not just "an error"', () => {
    // The user needs the number to ask support about it.
    const music = read('src/scenes/musicGenerationWizard/index.ts')
    const video = read('src/scenes/videoTranscriptionWizard/index.ts')
    expect(music).toMatch(
      new RegExp('\\$\\{cost\\}\\s*⭐ автоматически не удалось')
    )
    expect(video).toMatch(
      new RegExp('\\$\\{costInStars\\}\\s*⭐ автоматически не удалось')
    )
  })

  it('the matchers recognise both halves', () => {
    // Control: the first check is an absence check across files.
    expect(CLAIMS_REFUNDED.test('💫 Средства возвращены: 5 ⭐')).toBe(true)
    expect(ADMITS_FAILURE.test('вернуть автоматически не удалось')).toBe(true)
    expect(ADMITS_FAILURE.test('всё прошло хорошо')).toBe(false)
  })
})
