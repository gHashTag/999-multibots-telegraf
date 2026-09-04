import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { assertSafePathSegment } from '@/utils/pathSegment'

/**
 * /stats takes its bot name from the command text:
 *
 *   const args = ctx.message.text.split(' ').slice(1)
 *   const botName = args.find(a => !a.startsWith('--') && a !== timeframe) || ...
 *
 * and that value ends up inside a filename that is written to disk:
 *
 *   const fileName = `admin_report_${botName}_<date>.xlsx`
 *   fs.writeFileSync(path.join(tempDir, fileName), excelBuffer)
 *
 * path.join RESOLVES `..` rather than rejecting it, so `../../x` leaves the
 * tmp directory.
 *
 * The ownership check in the handler stops a NON-admin naming a bot they do
 * not own, so it also happens to stop a traversal from them. An admin skips
 * that check entirely -- and an admin is precisely who can pass an arbitrary
 * string here. That asymmetry is why the guard sits at the point the value is
 * ACCEPTED rather than next to either file write: two filenames are built from
 * it, and a third would inherit the hole.
 *
 * A refusal fails closed: the whole handler body is wrapped in a try/catch
 * that logs and replies with a generic error, so nothing crashes.
 */

// matchCode from the shared library, not blank(). The first version of this
// test counted THREE filenames built from botName: two real ones and the
// example inside the comment this very change added to statsCommand -- a
// matcher that reads prose counts prose. The obvious fix, blanking the source,
// is wrong here for a different reason: blank() empties template literals too,
// and the thing being matched IS a template literal.
//
// matchCode matches on the RAW text and consults the blanked copy only as a
// mask, which works because blank() preserves offsets byte for byte. So the
// template survives and the comment does not.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

const ROOT = path.resolve(__dirname, '../../..')
const FILE = 'src/commands/statsCommand.ts'
const source = fs.readFileSync(path.join(ROOT, FILE), 'utf8')

/** Uncommented matches only. */
const codeMatches = (re: RegExp): string[] =>
  matchCode(source, re).map((m: RegExpMatchArray) => m[0])

describe('the bot name /stats takes from the command text', () => {
  it('still comes from the message and still reaches a filename', () => {
    // Control. If either end of this stopped being true, the assertions below
    // would keep passing while guarding nothing.
    expect(
      codeMatches(/ctx\.message\.text\.split\(' '\)/g).length
    ).toBeGreaterThan(0)
    expect(
      codeMatches(/const fileName = `[^`]*\$\{botName\}/g).length
    ).toBeGreaterThan(0)
    expect(
      codeMatches(/path\.join\(tempDir, fileName\)/g).length
    ).toBeGreaterThan(0)
  })

  it('is validated before every filename that embeds it', () => {
    const offsetOf = (re: RegExp): number[] =>
      matchCode(source, re).map((m: RegExpMatchArray) => m.index as number)

    const guards = offsetOf(/assertSafePathSegment\(botName/g)
    expect(guards.length, 'guard not found').toBe(1)
    const guard = guards[0]

    const uses = offsetOf(/const fileName = `[^`]*\$\{botName\}/g)
    // Two filenames are built from it today; the point of asserting the count
    // is that a third one added later has to pass through here.
    expect(uses.length).toBe(2)
    for (const u of uses) expect(u).toBeGreaterThan(guard)
  })

  it('refuses a bot name that would leave the directory', () => {
    for (const attack of ['../../evil', 'a/b', 'a\\b', '..', '']) {
      expect(() => assertSafePathSegment(attack, 'botName')).toThrow()
    }
  })

  it('accepts the bot names that actually exist', () => {
    for (const real of [
      'neuro_blogger_bot',
      'MetaMuse_Manager_bot',
      'ai_koshey_bot',
    ]) {
      expect(() => assertSafePathSegment(real, 'botName')).not.toThrow()
    }
  })
})
