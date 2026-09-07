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
    /*
     * THE GATE THAT DECIDES WHOSE COMPARISONS COUNT, in both directions.
     *
     * It used to be `/callbackQuery/` alone, which threw away the hand
     * comparisons of 254 files carrying 270 ids. veed-fabric-wizard reads
     * `const callbackData = ...` upstream and never writes the word
     * callbackQuery, so both of its buttons were reported as having no catcher
     * of any shape -- while each is compared thirteen lines below where it is
     * drawn. The reported debt was 38; the true figure was 18.
     *
     * The old self-check could not have caught that: its fixture line
     * `const action = (ctx.callbackQuery as any).data` satisfies the very gate
     * under test, so the gate was never exercised by it.
     */
    [
      'callback gate, narrowed back',
      'callbackQuery|callbackData|callback_data|ctx\\.match|\\.action\\(',
      'callbackQuery',
    ],
    [
      'callback gate, opened to everything',
      'callbackQuery|callbackData|callback_data|ctx\\.match|\\.action\\(',
      '[\\s\\S]',
    ],
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
    'flux_kontext_retry',
    'ai_photoshop_multi_choose_model',
    'loading_indicator',
    'loading_processing_indicator',
    'loading_all_models_indicator',
    'go_to_main_menu',
    'create_voice_avatar',
    'back_to_competitors',
    // Never broken -- reported broken. Both are compared by hand in
    // veed-fabric-wizard, thirteen lines below where they are drawn, in a file
    // that never mentions callbackQuery. The census could not see that.
    'veed_fabric_confirm',
    'veed_fabric_cancel',
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

  /**
   * Two repairs from the adjudication pass, asserted through the census rather
   * than by restating their arguments.
   *
   * `another_cover` is the repeat-purchase button: aiCoverWizard drew it after
   * a paid cover and returned ctx.scene.leave() seventeen lines later, so its
   * own handler could never fire. The success path now stays in the scene.
   *
   * `flux_kontext_retry` is drawn by a shared service and was caught only by a
   * scene that is not in the Stage at all -- dead on every one of its four
   * call paths. It has a bot-level handler now.
   */
  it('no longer offers a button and then abandons it', () => {
    const out = execFileSync('node', [SCRIPT, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    const { abandoned, crossFile } = JSON.parse(out) as {
      abandoned: Array<{ id: string }>
      crossFile: string[]
    }
    expect(abandoned.map(a => a.id)).not.toContain('another_cover')
    expect(crossFile).not.toContain('flux_kontext_retry')
  })

  it('does not let the remaining debt grow', () => {
    const { orphans } = census()
    expect(
      orphans.length,
      `ids with no catcher of any shape:\n  ${orphans.join('\n  ')}`
      // Was 38. Twenty of those were the census's own blindness, not dead
      // buttons: the gate deciding whose hand comparisons count discarded 254
      // files. Lowered because the detector got STRONGER, and the two gate
      // breakages above are what stops it being lowered by weakening it again.
    ).toBeLessThanOrEqual(18)
  })
})

/**
 * OFFERED, THEN ABANDONED.
 *
 * The second thing the census reports: a scene draws a keyboard and calls
 * `ctx.scene.leave()` a few lines later, so its own handler can never fire.
 * Every grep says the handler exists, which is why it needs its own reading.
 *
 * The calibration instance is `another_cover` -- aiCoverWizard draws the
 * repeat-purchase button at index.ts:395, to somebody who has just paid for a
 * cover, and returns `ctx.scene.leave()` at :414.
 */
describe('the census sees a keyboard drawn just before the scene leaves', () => {
  const census = () => {
    const out = execFileSync('node', [SCRIPT, '--json'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    return JSON.parse(out) as {
      abandoned: Array<{
        id: string
        file: string
        line: number
        leaveAt: number
      }>
    }
  }

  /**
   * The calibration lives in the script's own FIXTURE, not in the repository.
   *
   * Its first version asserted a live defect -- aiCoverWizard's repeat-purchase
   * button, drawn at index.ts:395 with a leave seventeen lines under it. That
   * was repaired, and the calibration went with it: a check anchored to a
   * defect stops working exactly when the work succeeds.
   *
   * So what is asserted here is that the fixture check can FAIL, in each of the
   * three ways it has been wrong: missing a same-path leave, counting one
   * behind a `catch`, and counting one quoted inside a comment.
   */
  const breakLeaveFinder: Array<[string, string, string]> = [
    [
      'blind to a same-path leave',
      'if (/ctx\\.scene\\.leave\\(\\)/.test(masked[k])) return k + 1',
      'if (false) return k + 1',
    ],
    [
      'deaf to a catch boundary',
      'if (/^\\s*\\}?\\s*catch\\s*\\(/.test(masked[k])) return 0',
      'if (false) return 0',
    ],
    [
      'counting a quoted leave',
      'const masked = maskComments(lines.join',
      'const masked = (lines.join',
    ],
  ]

  for (const [name, from, to] of breakLeaveFinder) {
    it(`exits 2 when the leave-finder goes ${name}`, () => {
      const source = fs.readFileSync(SCRIPT, 'utf8')
      expect(source.includes(from), `anchor for "${name}" not found`).toBe(true)
      const broken = source.replace(from, to)
      expect(broken).not.toBe(source)
      const tmp = path.join(
        os.tmpdir(),
        `census-leave-${name.replace(/\W/g, '')}.cjs`
      )
      fs.writeFileSync(tmp, broken)
      const { code, out } = run(tmp)
      fs.unlinkSync(tmp)
      expect(code, `output:\n${out}`).toBe(2)
      expect(out).toContain('SELF-CHECK FAILED')
    })
  }

  it('does not flag every scene-caught site', () => {
    const { abandoned } = census()
    expect(abandoned.length).toBeGreaterThan(0)
    expect(abandoned.length).toBeLessThan(60)
  })

  it('reports a leave that comes AFTER the render, never before', () => {
    const { abandoned } = census()
    const backwards = abandoned.filter(a => a.leaveAt <= a.line)
    expect(
      backwards,
      'a leave above the render is a slicing bug, not a finding'
    ).toEqual([])
  })
  /**
   * The discrimination guard must be able to fail, or it is decoration. This
   * makes the leave-finder say "yes" at the first line it looks at, so every
   * scene-caught site is flagged, and insists the script refuses to print.
   */
  it('exits 2 if the leave-finder starts flagging everything', () => {
    const source = fs.readFileSync(SCRIPT, 'utf8')
    const from =
      'if (/ctx\\.scene\\.leave\\(\\)/.test(site.lines[k])) return k + 1'
    expect(source.includes(from), 'anchor for the leave-finder not found').toBe(
      true
    )
    const broken = source.replace(from, 'return k + 1')
    expect(broken).not.toBe(source)
    const tmp = path.join(os.tmpdir(), 'button-census-flags-everything.cjs')
    fs.writeFileSync(tmp, broken)
    const { code, out } = run(tmp)
    fs.unlinkSync(tmp)
    expect(
      code,
      `a check that flags everything must refuse to print. output:\n${out}`
    ).toBe(2)
    expect(out).toContain('SELF-CHECK FAILED')
  })
})
