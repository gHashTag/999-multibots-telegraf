import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { assertSafePathSegment } from '@/utils/pathSegment'

/**
 * A telegram_id typed as `string` is used as a DIRECTORY NAME in four places,
 * and path.join resolves `..` rather than rejecting it:
 *
 *   path.join(__dirname, '../uploads', telegram_id)
 *
 * so `../../etc` writes outside uploads entirely. Two of the four wrap the
 * value in String() or .toString(), which is a no-op on something already a
 * string and sanitises nothing.
 *
 * The guard rejects only what makes traversal possible -- separators, `..`,
 * NUL, empty -- rather than demanding digits. Telegram ids are numeric, but
 * these helpers are called from many places, and a digits-only rule would
 * refuse identifiers that are legitimate. Refusing the narrower thing is what
 * keeps this additive.
 *
 * The call-site list is checked from the source, because the behavioural test
 * below passes whether or not anything calls the guard.
 */

const ROOT = path.resolve(__dirname, '../../..')

const GUARDED_SITES = [
  'src/helpers/saveFileLocally.ts',
  'src/helpers/file-helpers.ts',
  'src/inngest_app/functions/training/morphImages.ts',
  'src/modules/videoGenerator/generateImageToVideo.ts',
]

describe('an identifier used as a directory name', () => {
  it('accepts the ids that actually occur', () => {
    for (const ok of ['144022504', 'user_42', 'abc-def', '0']) {
      expect(() => assertSafePathSegment(ok)).not.toThrow()
    }
  })

  it('refuses each way out of the directory', () => {
    const attacks: Array<[string, string]> = [
      ['parent directory', '..'],
      ['climb via posix separator', '../../etc'],
      ['climb via windows separator', '..\\..\\windows'],
      ['absolute posix path', '/etc/passwd'],
      ['current directory', '.'],
      ['NUL truncation', 'a\0b'],
      ['empty is not a directory', ''],
    ]
    for (const [why, value] of attacks) {
      expect(() => assertSafePathSegment(value), why).toThrow()
    }
  })

  it('is called at every site that builds a path from the id', () => {
    const missing = GUARDED_SITES.filter(
      f =>
        !fs
          .readFileSync(path.join(ROOT, f), 'utf8')
          .includes('assertSafePathSegment(')
    )
    expect(missing).toEqual([])
  })

  it('still has sites to guard', () => {
    // Control: if these files stopped building paths from an identifier the
    // check above would keep passing while protecting nothing.
    for (const f of GUARDED_SITES) {
      const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
      expect(src, f).toMatch(/path\.join\(/)
    }
  })
})
