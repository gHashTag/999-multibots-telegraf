/**
 * imageToVideoWizard and textToVideoWizard step 3 had a check-only balance gate
 * and charged inside handleImageToVideoDirect/handleTextToVideoDirect with NO
 * in-flight guard. A racing second update (double-tap) both passed the gate and
 * generated a second video off one balance (free second video) -- the same class
 * textToImageWizard already guards. Fix: mirror the sibling's in-flight guard --
 * a synchronous `if (ctx.session.<x>InProgress) return; ctx.session.<x>InProgress
 * = true` before the generation, released in a finally.
 *
 * Source seam: each video wizard sets its InProgress flag before the direct
 * handler and releases it in a finally. Mutation (removing the guard) fails.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const read = (rel: string) =>
  fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8')

const cases = [
  {
    file: 'scenes/imageToVideoWizard/index.ts',
    flag: 'imageToVideoInProgress',
    handler: 'handleImageToVideoDirect',
  },
  {
    file: 'scenes/textToVideoWizard/index.ts',
    flag: 'textToVideoInProgress',
    handler: 'handleTextToVideoDirect',
  },
]

describe('video wizards guard against concurrent double-generate', () => {
  for (const c of cases) {
    it(`${c.file} sets ${c.flag} before the charge and releases it in finally`, () => {
      const s = read(c.file)
      // guard is set before the direct (charging) handler
      const set = s.indexOf(`ctx.session.${c.flag} = true`)
      const call = s.indexOf(`${c.handler}(`)
      expect(set, `${c.flag} never set true`).toBeGreaterThan(-1)
      expect(call, `${c.handler} not called`).toBeGreaterThan(-1)
      expect(
        set < call,
        'in-flight flag is set after the charging handler -- race not closed'
      ).toBe(true)
      // guard is checked (reject re-entry) and released
      expect(
        new RegExp(`if \\(ctx\\.session\\.${c.flag}\\)`).test(s),
        'no re-entry check on the in-flight flag'
      ).toBe(true)
      expect(
        new RegExp(
          `finally[\\s\\S]{0,80}ctx\\.session\\.${c.flag} = false`
        ).test(s),
        'in-flight flag not released in a finally'
      ).toBe(true)
    })
  }
})
