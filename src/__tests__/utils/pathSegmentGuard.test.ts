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
  'src/inngest_app/functions/existing/generateAIReelsFunction.ts',
  'src/inngest_app/functions/existing/generateAdvancedLoopingVideoFunction.ts',
]

/**
 * The list above is written by hand, and a hand-written list is exactly what
 * went wrong the first time: the sites were found by matching
 * `path.join(... telegram_id ...)` as TEXT, so two registered functions that
 * build the path through an intermediate variable --
 * `filePrefix = \`reels_kling_v7_${telegram_id}_...\`` -- were invisible and
 * stayed unguarded.
 *
 * So the population is computed instead: a registered Inngest function that
 * takes an identifier off event.data and calls path.join can build a path from
 * it, whether or not the identifier appears inside the path.join call.
 */
function registeredFunctionFiles(): string[] {
  const reg = fs.readFileSync(
    path.join(ROOT, 'src/inngest_app/registerFunctions.ts'),
    'utf8'
  )
  // Only names that are actually in the served array, and only imports that
  // are not commented out. instagramScraperV2 is imported and then listed as
  // `// instagramScraperV2,` -- present in the file, absent from the runtime.
  const served = new Set(
    reg
      .split('\n')
      .filter(l => !l.trimStart().startsWith('//'))
      .filter(l => /^\s+[A-Za-z_$][\w$]*,\s*$/.test(l))
      .map(l => l.trim().replace(/,$/, ''))
  )
  const out: string[] = []
  for (const m of reg.matchAll(
    /^import\s*\{([^}]*)\}\s*from\s*'(\.[^']*)'/gm
  )) {
    const names = m[1].split(',').map(n =>
      n
        .trim()
        .split(/\s+as\s+/)
        .pop()!
        .trim()
    )
    if (!names.some(n => served.has(n))) continue
    const rel = path.posix.join('src/inngest_app', m[2].replace(/^\.\//, ''))
    for (const cand of [`${rel}.ts`, `${rel}/index.ts`]) {
      if (fs.existsSync(path.join(ROOT, cand))) {
        out.push(cand)
        break
      }
    }
  }
  return out
}

/**
 * A REGISTERED function that takes an identifier off event.data and calls
 * path.join can build a path from it -- whether or not the identifier appears
 * inside the path.join call.
 *
 * Computed rather than listed, because a hand-written list is exactly what
 * went wrong: the sites were first found by matching
 * `path.join(... telegram_id ...)` as TEXT, so two registered functions that
 * build the path through an intermediate variable stayed unguarded.
 *
 * Registered, not merely present on disk. The first computed version walked
 * the functions directory and demanded a guard in two files that nothing
 * serves -- a commented-out registration and a dead duplicate of a file that
 * IS registered. The population has to match the sentence being claimed.
 */
function computedPopulation(): string[] {
  return registeredFunctionFiles().filter(f => {
    const src = fs.readFileSync(path.join(ROOT, f), 'utf8')
    return (
      /event\.data/.test(src) &&
      /\b(telegram_id|telegramId)\b/.test(src) &&
      /path\.join\(/.test(src)
    )
  })
}

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

  it('computes a non-empty population', () => {
    // An empty population would make the completeness check below pass while
    // checking nothing -- the failure mode this whole test exists to prevent.
    const pop = computedPopulation()
    expect(pop.length).toBeGreaterThanOrEqual(3)
    expect(pop).toContain(
      'src/inngest_app/functions/existing/generateAdvancedLoopingVideoFunction.ts'
    )
  })

  it('guards every computed site, not just the hand-listed ones', () => {
    const unguarded = computedPopulation().filter(
      f =>
        !fs
          .readFileSync(path.join(ROOT, f), 'utf8')
          .includes('assertSafePathSegment(')
    )
    expect(unguarded).toEqual([])
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
