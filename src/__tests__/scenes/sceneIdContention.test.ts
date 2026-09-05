import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const { matchCode } = require('../../../scripts/lib/blank-code.cjs')

/**
 * Two scenes must not claim the same id -- and where they deliberately do, the
 * order that decides the winner must be pinned.
 *
 * Telegraf's Stage is a Map: `this.scenes.set(scene.id, scene)` (its own
 * source, node_modules/telegraf/.../stage.js). The LAST registration of an id
 * wins and every earlier one becomes unreachable, silently.
 *
 * That is live here. `neuroPhotoWizard` registers ModeEnum.NeuroPhoto and
 * `neuroPhotoWizardV2` registers the literal 'neuro_photo' -- the same value,
 * with a comment saying it keeps the OLD id for compatibility. Both are
 * second, so V2 serves users and V1's implementation is dead code.
 *
 * Nothing is broken today. What is fragile is WHY: the paid photo flow users
 * get is decided by the ORDER of two adjacent lines in an array. An
 * alphabetical sort, a merge, or a tidy-up reverses it, and the change would
 * be invisible in review -- both scenes exist, both are registered, the diff
 * moves one line.
 *
 * So this pins the pair and the order. A NEW collision fails the first test; a
 * reorder of this one fails the second.
 */

const REPO = path.resolve(__dirname, '..', '..', '..')
const SCENES = path.join(REPO, 'src', 'scenes')
const REGISTRY = path.join(REPO, 'src', 'navigation', 'registerCommands.ts')

/**
 * Every name that can stand for a scene id -> its string value.
 *
 * The first version anchored the member pattern at end of line, so
 * `NeuroPhoto = 'neuro_photo', // 10,688 stars of revenue` did not resolve --
 * a TRAILING COMMENT was enough. Four ids then stayed unresolved and the
 * census could not have seen a collision among them. Unresolved is now an
 * assertion, not a silent gap.
 */
function enumValues(): Record<string, string> {
  const out: Record<string, string> = {}
  const files = ['interfaces/modes.ts', 'interfaces/paidServices.ts']
  for (const rel of files) {
    const p = path.join(REPO, 'src', rel)
    if (!fs.existsSync(p)) continue
    const raw = fs.readFileSync(p, 'utf8')
    // trailing comma and comment are both optional
    for (const m of matchCode(raw, /^\s*(\w+)\s*=\s*['"`]([^'"`]+)['"`]/gm)) {
      out[m[1]] = m[2]
    }
  }
  // `export const TON_PAYMENT_SCENE_ID = 'tonPaymentScene'` lives in the scene
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const q = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(q)
        continue
      }
      if (!q.endsWith('.ts')) continue
      const raw = fs.readFileSync(q, 'utf8')
      for (const m of matchCode(
        raw,
        /export const (\w+)\s*=\s*['"`]([^'"`]+)['"`]/g
      )) {
        if (!(m[1] in out)) out[m[1]] = m[2]
      }
    }
  }
  walk(SCENES)
  return out
}

/** Every `new Scenes.*Scene(<id>)` in src/scenes, with the id RESOLVED. */
function declaredScenes(): Array<{ file: string; id: string }> {
  const vals = enumValues()
  const out: Array<{ file: string; id: string }> = []
  const walk = (dir: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name)
      if (e.isDirectory()) {
        walk(p)
        continue
      }
      if (!p.endsWith('.ts')) continue
      const raw = fs.readFileSync(p, 'utf8')
      const RE =
        /new Scenes\.(?:Wizard|Base)Scene<[^>]*>\(\s*([A-Za-z_$][\w$.]*|['"`][^'"`]+['"`])/g
      for (const m of matchCode(raw, RE)) {
        const expr = m[1]
        const literal = /^['"`]/.test(expr) ? expr.replace(/['"`]/g, '') : null
        // ModeEnum.X -> X -> its value; a bare literal is already the value
        const member = expr.split('.').pop() as string
        const id = literal ?? vals[member] ?? expr
        out.push({ file: path.relative(REPO, p), id })
      }
    }
  }
  walk(SCENES)
  return out
}

/** The one collision that exists on purpose. */
const DELIBERATE = {
  id: 'neuro_photo',
  files: [
    'src/scenes/neuroPhotoWizard/index.ts',
    'src/scenes/neuroPhotoWizardV2/index.ts',
  ],
  /** The one that must be registered LAST, i.e. the one users actually get. */
  winner: 'neuroPhotoWizardV2',
}

describe('no two scenes claim the same id by accident', () => {
  it('the census resolves real ids, not expression text', () => {
    // Comparing `ModeEnum.NeuroPhoto` against `'neuro_photo'` as TEXT finds no
    // collision at all -- that is exactly how this one stayed invisible.
    const all = declaredScenes()
    expect(all.length).toBeGreaterThan(60)
    const unresolved = all.filter(s => /^[A-Z_]+$|\./.test(s.id))
    expect(
      unresolved.map(u => `${u.file}: ${u.id}`),
      'an id that did not resolve to its VALUE hides any collision it takes part in'
    ).toEqual([])
  })

  it('only the known pair shares an id', () => {
    const byId: Record<string, string[]> = {}
    for (const { file, id } of declaredScenes()) (byId[id] ||= []).push(file)
    // The allowlist excuses an exact PAIR, not the id. Excusing the id let a
    // THIRD scene claim 'neuro_photo' and pass unnoticed -- found by mutation,
    // not by reading.
    const collisions = Object.entries(byId)
      .filter(([, files]) => files.length > 1)
      .filter(
        ([id, files]) =>
          !(
            id === DELIBERATE.id &&
            files.length === DELIBERATE.files.length &&
            DELIBERATE.files.every(f => files.includes(f))
          )
      )
      .map(([id, files]) => `${id}: ${files.join(', ')}`)
    expect(
      collisions,
      'two scenes register the same id, and Telegraf keeps only the LAST one:\n' +
        collisions.join('\n')
    ).toEqual([])
  })

  it('the deliberate pair still resolves to the intended winner', () => {
    // Search inside the Stage array, not the whole file: the same two names
    // appear FIRST in the import list, and indexOf found those -- so the test
    // pinned the order of imports, which decides nothing. Mutation caught it.
    const whole = fs.readFileSync(REGISTRY, 'utf8')
    // The ARRAY is what Stage consumes, and it is built BEFORE the Stage call
    // (line ~1064 vs ~1132) -- slicing from `new Scenes.Stage` cut it off
    // entirely and the assertion failed for the wrong reason.
    const listAt = whole.indexOf('scenesToRegister')
    const stageAt = whole.indexOf('new Scenes.Stage')
    expect(listAt, 'no scenesToRegister array in the registry').toBeGreaterThan(
      -1
    )
    expect(stageAt, 'no Scenes.Stage in the registry').toBeGreaterThan(listAt)
    const registry = whole.slice(listAt, stageAt)
    const first = registry.indexOf('neuroPhotoWizard,')
    const second = registry.indexOf('neuroPhotoWizardV2,')
    expect(first, 'neuroPhotoWizard is no longer registered').toBeGreaterThan(
      -1
    )
    expect(
      second,
      'neuroPhotoWizardV2 is no longer registered'
    ).toBeGreaterThan(-1)
    expect(
      second,
      `${DELIBERATE.winner} must be registered AFTER neuroPhotoWizard: Stage is a ` +
        'Map and the last registration of an id wins. Swapping these two lines ' +
        'silently changes which paid photo flow users get.'
    ).toBeGreaterThan(first)
  })
})
