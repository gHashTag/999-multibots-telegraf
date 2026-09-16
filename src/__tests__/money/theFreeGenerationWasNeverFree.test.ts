import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { ModeEnum } from '@/interfaces/modes'

/**
 * THE FREE LEAD MAGNET HAS NEVER ONCE FIRED.
 *
 * avatarTransformScene advertises a free demonstration (index.ts:1315) and sets
 * `session.bypass_payment_check = true` to deliver it. processBalanceOperation
 * honours that flag only for the avatar-transform mode -- a deliberate fence,
 * so a stray flag cannot buy a video.
 *
 * The fence was built out of the wrong string. It read:
 *
 *     ctx?.session?.mode === 'AvatarTransform'
 *
 * which is the enum KEY. The enum VALUE is 'avatar_transform'
 * (interfaces/modes.ts:24), and nothing anywhere writes the key into
 * session.mode. So the comparison was false on every call in the life of the
 * feature.
 *
 * INDEPENDENTLY, the scene never set session.mode at all -- `grep -c` returned
 * zero. Two separate breaks, either one sufficient. Every customer promised a
 * free demonstration was charged for it, and each one additionally tripped the
 * `[SECURITY] Bypass flag ignored` branch, so the record of the incident reads
 * as suspicion of the customer rather than a bug in the fence.
 *
 * REPAIRING IT OPENED A SECOND HOLE, which is why checkSuperheroGenerationUsage
 * appears in this file. Its two database-error paths return `canGenerate: true`
 * and call it a "safe default". That was safe only while the thing it gated was
 * dead: once the bypass works, a database hiccup becomes unlimited FREE paid
 * generations. `quotaKnown` splits the two decisions -- access stays open on an
 * unreadable count, the free one does not.
 */

const ROOT = path.resolve(__dirname, '..', '..', '..')
const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

const PBO = 'src/price/helpers/processBalanceOperation.ts'
const SCENE = 'src/scenes/avatarTransformScene/index.ts'
const QUOTA = 'src/core/supabase/checkSuperheroGenerationUsage.ts'

describe('the two halves of the bypass agree on one string', () => {
  it('the enum value is not the enum key (the whole defect in one line)', () => {
    expect(ModeEnum.AvatarTransform).toBe('avatar_transform')
    expect(ModeEnum.AvatarTransform as string).not.toBe('AvatarTransform')
  })

  it('the fence compares against the enum member, not a hand-typed string', () => {
    const src = read(PBO)
    expect(
      matchCode(src, /ctx\?\.session\?\.mode === ModeEnum\.AvatarTransform/g)
        .length,
      'the fence must name the enum so the two sides cannot drift again'
    ).toBe(1)
    // The literal must not come back. matchCode ignores the comment above the
    // fence, which quotes the old string to explain it.
    expect(
      matchCode(src, /=== ['"]AvatarTransform['"]/g).length,
      'the enum KEY is compared again; the bypass is dead a second time'
    ).toBe(0)
  })

  it('the scene actually sets the mode the fence reads', () => {
    const src = read(SCENE)
    expect(
      matchCode(src, /ctx\.session\.mode = ModeEnum\.AvatarTransform/g).length,
      'the scene raises the flag but never sets the mode -- the fence sees ' +
        'undefined and refuses, exactly as it did before'
    ).toBeGreaterThan(0)
  })

  it('the mode is set before the flag is raised', () => {
    // Order matters in code, not in intent: processBalanceOperation reads both
    // at once, but a later reader moving the flag above the mode would
    // reintroduce the bug silently. Pin the order that works.
    const src = read(SCENE)
    const mode = matchCode(
      src,
      /ctx\.session\.mode = ModeEnum\.AvatarTransform/g
    ).map(m => m.index as number)
    const flag = matchCode(
      src,
      /ctx\.session\.bypass_payment_check = true/g
    ).map(m => m.index as number)
    expect(mode.length).toBeGreaterThan(0)
    expect(flag.length).toBeGreaterThan(0)
    expect(Math.min(...mode)).toBeLessThan(Math.min(...flag))
  })
})

describe('a free generation is never handed out on a count nobody could read', () => {
  it('the quota answer says whether it was measured or guessed', () => {
    const src = read(QUOTA)
    expect(src).toContain('quotaKnown: boolean')
    const known = matchCode(src, /quotaKnown: true/g).length
    const unknown = matchCode(src, /quotaKnown: false/g).length
    // Five returns: admin, NEUROTESTER, the measured path -- all true; the
    // database-error fallback and the catch-all -- both false.
    expect(known + unknown, 'every return must answer').toBe(5)
    expect(unknown, 'both fail-open paths must admit they are guessing').toBe(2)
  })

  it('the fail-open paths still let the person generate', () => {
    // The access decision is deliberately unchanged. Refusing service because
    // our database hiccuped would be the worse failure, and this ratchet exists
    // partly so nobody "tightens" it later by mistake.
    const src = read(QUOTA)
    const guesses = matchCode(src, /quotaKnown: false/g).map(
      m => m.index as number
    )
    for (const at of guesses) {
      const block = src.slice(Math.max(0, at - 400), at)
      expect(
        block,
        'a fail-open path stopped failing open -- access and the freebie are ' +
          'two different decisions'
      ).toMatch(/canGenerate: true/)
    }
  })

  it('the scene withholds the freebie -- not the service -- when the count is unknown', () => {
    const src = read(SCENE)
    expect(
      matchCode(src, /if \(generationCheck\.quotaKnown\)/g).length,
      'the bypass flag is raised without consulting quotaKnown'
    ).toBeGreaterThan(0)
    // And the flag is raised INSIDE that guard, not beside it.
    const guard = matchCode(src, /if \(generationCheck\.quotaKnown\)/g).map(
      m => m.index as number
    )[0]
    const flag = matchCode(
      src,
      /ctx\.session\.bypass_payment_check = true/g
    ).map(m => m.index as number)[0]
    expect(flag).toBeGreaterThan(guard)
    expect(flag - guard, 'the flag drifted out of the guard').toBeLessThan(200)
  })

  it("the scene's own fallback object answers too", () => {
    // The scene builds a local stand-in when the check throws. A stand-in that
    // omitted quotaKnown would read as `undefined` -- falsy, so it happens to
    // behave -- but the next reader would have no way to know that was meant.
    const src = read(SCENE)
    expect(matchCode(src, /quotaKnown: false/g).length).toBeGreaterThan(0)
  })
})
