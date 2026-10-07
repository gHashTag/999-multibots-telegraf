import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * A TEST THAT READS ABOVE apps/vibee-editor IS LISTED IN THE GATE'S EXCLUDE.
 *
 * The player's Docker image is built from apps/vibee-editor, so a test that
 * opens bin/, scripts/ or src/ of the repository ROOT passes in the hooks and
 * dies with ENOENT in the deploy's test gate -- taking every later deploy with
 * it. #3244 did that (crmInsets read bin/helpers/shot.mjs) and main stopped
 * shipping the player. scripts/test-gate.mjs keeps a list of such files; this
 * reads that list and every test's relative paths, so the next one fails here,
 * on the author's machine, and not on Railway.
 *
 * It sees the two shapes the tests use: a literal '../../x' (import, require,
 * path.join(__dirname, '../../x')) and a run of '..' arguments
 * (path.join(__dirname, '..', '..', ...)).
 */

const PLAYER = path.resolve(__dirname, '../..')
const CONTEXT = path.resolve(PLAYER, '..')

function excludeList(): string[] {
  const gate = fs.readFileSync(
    path.join(PLAYER, 'scripts/test-gate.mjs'),
    'utf8'
  )
  const block = gate.match(/const EXCLUDE = \[([\s\S]*?)\]/)
  if (!block) return []
  return [...block[1].matchAll(/'([^']+)'/g)].map(m => m[1])
}

function testFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) return e.name === 'node_modules' ? [] : testFiles(p)
    return /\.test\.tsx?$/.test(e.name) ? [p] : []
  })
}

/** Where each relative path in `src` lands, resolved from the file's folder. */
function reaches(file: string, src: string): string[] {
  const dir = path.dirname(file)
  const literal = [...src.matchAll(/['"`]((?:\.\.\/)+[^'"`]*)['"`]/g)].map(m =>
    path.resolve(dir, m[1])
  )
  const runs = [...src.matchAll(/(?:'\.\.'\s*,\s*)+/g)].map(m =>
    path.resolve(dir, ...Array((m[0].match(/'\.\.'/g) ?? []).length).fill('..'))
  )
  return [...literal, ...runs]
}

const outside = (p: string) => path.relative(CONTEXT, p).startsWith('..')

describe("the deploy gate's EXCLUDE", () => {
  const listed = excludeList()

  it('is read from scripts/test-gate.mjs', () => {
    // An empty list here means the parser no longer matches the file -- the
    // guard below would then pass while checking nothing.
    expect(listed.length).toBeGreaterThan(0)
  })

  it('names only files that exist', () => {
    const missing = listed.filter(f => !fs.existsSync(path.join(PLAYER, f)))
    expect(missing).toEqual([])
  })

  it('holds every test that reads above apps/vibee-editor', () => {
    // This file is skipped: its fixtures below are such paths on purpose.
    const unlisted = testFiles(path.join(PLAYER, 'src'))
      .filter(f => f !== __filename)
      .filter(f => reaches(f, fs.readFileSync(f, 'utf8')).some(outside))
      .map(f => path.relative(PLAYER, f))
      .filter(f => !listed.includes(f))
    expect(unlisted).toEqual([])
  })

  it('sees both shapes of a path that leaves the context', () => {
    const here = path.join(PLAYER, 'src/pages/x.test.ts')
    expect(
      reaches(here, "'../../../../../bin/helpers/shot.mjs'").some(outside)
    ).toBe(true)
    expect(
      reaches(here, "path.join(__dirname, '..', '..', '..', '..', '..')").some(
        outside
      )
    ).toBe(true)
    expect(
      reaches(here, "'../components/Crm/FunnelStrip.css'").some(outside)
    ).toBe(false)
  })
})
