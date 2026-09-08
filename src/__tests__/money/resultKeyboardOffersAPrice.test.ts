import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * THE ONE SCREEN WHERE SOMEBODY HAS JUST SEEN WHAT THIS IS WORTH.
 *
 * Measured against production on 2026-09-08, split by cohort because the users
 * table mixes a migration with organic signups: of people who found this bot
 * themselves, 18.2% ever generate anything and 3.2% ever reach a price. About
 * one in five of the people who get a result out of it is ever shown what more
 * of it costs.
 *
 * The result keyboards offered four ways to spend and none to pay: new prompt,
 * change size, improve prompt, upscale, main menu. This asserts the price is
 * now on them, and stays.
 *
 * COMMENTS ARE STRIPPED BEFORE LOOKING, and that is not a detail. The previous
 * iteration's refusal detector matched the word `standardButtons` anywhere in a
 * window and counted the COMMENT explaining a fix as the fix itself -- five
 * sites flipped to "answered" on the strength of the prose. The notes added
 * beside these very buttons name `act:topup` too, so a naive check here would
 * pass on its own explanation.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')

/** Blank comments, keep newlines, so only code is searched. */
const code = (text: string) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(/^([^'"`\n]*?)\/\/.*$/gm, (_m, keep) => keep)

/** Inline result keyboards shown after a successful generation. */
const RESULT_KEYBOARDS = [
  'src/services/generateNeuroPhotoHybrid.ts',
  'src/services/generateNeuroPhotoMulti.ts',
  'src/services/imageUpscaler.ts',
]

const read = (rel: string) =>
  code(fs.readFileSync(path.join(REPO, rel), 'utf8'))

describe('a result keyboard shows what more of this costs', () => {
  it('every inline result keyboard offers a way to pay', () => {
    for (const rel of RESULT_KEYBOARDS) {
      const src = read(rel)
      expect(
        /ACTION_PREFIX\}topup/.test(src),
        `${rel} draws a result keyboard and offers no way to pay`
      ).toBe(true)
      // The label comes from the shared list, so this button cannot drift from
      // the one the menu shows.
      expect(
        src.includes('topupButtonLabel'),
        `${rel} must use the shared top-up label`
      ).toBe(true)
    }
  })

  it('the one scene that swallows unknown presses recognises it', () => {
    /*
     * neuroPhotoWizard is the only scene in the tree with a catch-all
     * `.on('callback_query')`, and its fallback is a console.log with no
     * next(): a bot-level button pressed inside it is answered and dropped.
     * The button drawn on its own result keyboard therefore has to be
     * recognised there, or it is exactly the dead button this repo keeps
     * fixing.
     */
    const src = read('src/scenes/neuroPhotoWizard/index.ts')
    expect(
      /callbackData === `\$\{ACTION_PREFIX\}topup`/.test(src),
      'neuroPhotoWizard must handle the top-up id it draws'
    ).toBe(true)
    expect(
      /StarPaymentScene/.test(src),
      'and it must lead somewhere a person can actually pay'
    ).toBe(true)
  })

  it('no OTHER scene has grown a callback catch-all that would swallow it', () => {
    // If a second scene grows one, the button it draws needs the same branch.
    // A count, so this cannot pass by finding nothing.
    const scenes: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const f = path.join(dir, e.name)
        if (e.isDirectory()) walk(f)
        else if (f.endsWith('.ts') && !f.includes('__tests__')) scenes.push(f)
      }
    }
    walk(path.join(REPO, 'src', 'scenes'))
    expect(scenes.length, 'no scene files scanned').toBeGreaterThan(20)

    const catchAll = scenes.filter(f =>
      /\.on\(\s*'callback_query'/.test(code(fs.readFileSync(f, 'utf8')))
    )
    expect(
      catchAll.map(f => path.relative(REPO, f)),
      'these scenes swallow unrecognised presses and need the branch too'
    ).toEqual(['src/scenes/neuroPhotoWizard/index.ts'])
  })
})
