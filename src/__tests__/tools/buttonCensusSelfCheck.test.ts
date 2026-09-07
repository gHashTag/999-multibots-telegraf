import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/**
 * THE SELF-CHECK MUST BE ABLE TO FAIL.
 *
 * `scripts/button-census.cjs` decides which rendered buttons have no handler.
 * The answer is entirely a property of the matcher: three passes over this
 * repository gave 87, then 75, then 45 orphans, and each pass had been blind to
 * a real catching shape. Published at pass one, "87 dead buttons" would have
 * accused forty-two working ones.
 *
 * So the script carries a fixture with every shape it has been wrong about, and
 * refuses to print a count when one of them goes missing. A self-check that
 * cannot fail is decoration, so this breaks each matcher in turn and insists on
 * exit code 2.
 */
const SCRIPT = path.join(
  __dirname,
  '..',
  '..',
  '..',
  'scripts',
  'button-census.cjs'
)
const ROOT = path.join(__dirname, '..', '..', '..')

const run = (file: string) => {
  try {
    const out = execFileSync('node', [file], { cwd: ROOT, encoding: 'utf8' })
    return { code: 0, out }
  } catch (e: any) {
    return {
      code: e.status ?? -1,
      out: String(e.stdout || '') + String(e.stderr || ''),
    }
  }
}

describe('the button census refuses to report through a broken matcher', () => {
  const source = fs.readFileSync(SCRIPT, 'utf8')

  it('runs and reports on the real repository', () => {
    const { code, out } = run(SCRIPT)
    expect(code).toBe(0)
    expect(out).toContain('self-check ok')
    expect(out).toMatch(/rendered callback ids\s+\d+/)
  })

  /**
   * One case per shape. The named-comparison one is the shape that actually
   * bit: the variable is called `action`, not `data`, in instagramParserScene,
   * and an earlier matcher declared its live buttons dead.
   */
  /*
   * The anchors target the regex BODY, not the declaration line. Prettier split
   * `const SCENE_ACT =` onto its own line when this was committed, and an
   * anchor written against the pre-format source stopped matching -- caught
   * here, by the assertion that the anchor must exist at all.
   */
  const breakages: Array<[string, string, string]> = [
    ['bot.action', '\\bbot\\.action\\(', '\\bnever_matches_bot\\.action\\('],
    ['scene.action', '(?!bot\\b)[A-Za-z_$]', '(?!bot\\b)zzz_never[A-Za-z_$]'],
    ['named comparison', '\\b[A-Za-z_$][\\w$]*\\s*===?', '\\bdata\\s*===?'],
    ['switch/case', 'case\\s+([\'"`])', 'never_case\\s+([\'"`])'],
    ['startsWith', '\\.startsWith\\(', '\\.neverStartsWith\\('],
  ]

  for (const [name, from, to] of breakages) {
    it(`exits 2 when the ${name} matcher stops matching`, () => {
      expect(
        source.includes(from),
        `anchor for ${name} not found in the script`
      ).toBe(true)
      const broken = source.replace(from, to)
      expect(broken, 'the edit must actually change the file').not.toBe(source)
      const tmp = path.join(
        os.tmpdir(),
        `button-census-broken-${name.replace(/\W/g, '')}.cjs`
      )
      fs.writeFileSync(tmp, broken)
      const { code, out } = run(tmp)
      fs.unlinkSync(tmp)
      expect(
        code,
        `a blind matcher must refuse to print a count. output:\n${out}`
      ).toBe(2)
      expect(out).toContain('SELF-CHECK FAILED')
    })
  }
})
