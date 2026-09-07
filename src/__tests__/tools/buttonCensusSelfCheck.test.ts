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
    ['array trigger', '\\.action\\(\\s*\\[', '\\.neverAction\\(\\s*\\['],
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

/**
 * THE SIX BUTTONS THIS BRANCH REPAIRED.
 *
 * Each was adjudicated by an agent, then put to a skeptic that tried to prove
 * the death sentence wrong and could not. Rather than restate the argument,
 * this asks the census itself: are they caught now?
 *
 * The ceiling on the total is a separate assertion, because a matcher that
 * stopped matching would satisfy the six by finding nothing at all.
 */
describe('the buttons repaired here land somewhere', () => {
  const census = () => {
    const out = execFileSync('node', [SCRIPT, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    return JSON.parse(out) as { rendered: number; orphans: string[] }
  }

  const REPAIRED = [
    'ai_photoshop_multi_choose_model',
    'loading_indicator',
    'loading_processing_indicator',
    'loading_all_models_indicator',
    'go_to_main_menu',
    'create_voice_avatar',
    'back_to_competitors',
  ]

  it('scanned a population of the expected size', () => {
    const { rendered } = census()
    expect(rendered).toBeGreaterThanOrEqual(200)
  })

  it('no longer counts any of them as unreachable', () => {
    const { orphans } = census()
    const still = REPAIRED.filter(id => orphans.includes(id))
    expect(still, `still without a catcher: ${still.join(', ')}`).toEqual([])
  })

  it('does not let the remaining debt grow', () => {
    const { orphans } = census()
    expect(
      orphans.length,
      `ids with no catcher of any shape:\n  ${orphans.join('\n  ')}`
    ).toBeLessThanOrEqual(38)
  })
})
