import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * Ratchet (census): every consume-once guard is registered, and each one still
 * marks before it spends.
 *
 * Three mechanisms stop a charge firing twice for one user action:
 *
 *   in-progress flag on a scene   18 scenes, held by paid-wizard-guard-ratchet
 *   step.run in an Inngest fn     held by inngestMoneyInStepRun
 *   consume-once                  three sites, each with its own dedicated test
 *                                 -- and until now NO census over the mechanism
 *
 * The third is the one a new site slips into unnoticed. Every instance was
 * pinned; the population was not, so a fourth guard could arrive with no test
 * and nothing anywhere would say so. That is the same gap that let a
 * never-passing security guard sit red for months (#1855) and a stale "the
 * purchase is idempotent" note survive a day past being false (#1861).
 *
 * WHAT EACH SITE MUST KEEP. The mark is set on the FALL-THROUGH path with
 * nothing awaited between the check and the mark. An await there is a real race
 * window: in webhook mode a double tap dispatches two concurrent handlers, and
 * both would pass the check before either sets the mark -- which is precisely
 * what aiPhotoshopScene's own comment says it is defending against.
 */

const ROOT = path.resolve(__dirname, '../../..')

// eslint-disable-next-line @typescript-eslint/no-var-requires
const consume = require('../../../scripts/lib/consume-once.cjs')
// eslint-disable-next-line @typescript-eslint/no-var-requires
const reach = require('../../../scripts/lib/charge-reachability.cjs')

/** file:field -> the dedicated test that already pins this one instance. */
const REGISTERED: Record<string, string> = {
  'src/navigation/registerCommands.ts:lastUpscaledImageUrl':
    'upscale_image and upscale_neurophoto; upscaleImageConsumeBeforeCharge + upscaleNeuroPhotoConsumeBeforeCharge',
  'src/scenes/aiPhotoshopScene/index.ts:lastUpscaledPhotoUrl':
    'aiPhotoshopUpscaleLastConsumeBeforeCharge; stacks an in-flight flag in front of the consume mark',
}

/** Files that charge, or that can reach a charging service. */
function population(): string[] {
  const graph = reach.importGraph(ROOT)
  const charging = reach
    .sourceFiles(ROOT)
    .filter(f =>
      /(?<![\w$])(updateUserBalance|processBalanceOperation|directPaymentProcessor)\s*\(/.test(
        fs.readFileSync(path.join(ROOT, f), 'utf8')
      )
    )
  const out = new Set<string>(charging)
  for (const f of charging)
    for (const i of reach.effectiveImporters(graph, f)) out.add(i)
  return [...out].sort()
}

type Site = { field: string; markAt: number; awaitsBetween: number }

function found(): Array<{
  key: string
  site: Site
  file: string
  raw: string
}> {
  const out: Array<{ key: string; site: Site; file: string; raw: string }> = []
  for (const f of population()) {
    let raw: string
    try {
      raw = fs.readFileSync(path.join(ROOT, f), 'utf8')
    } catch {
      continue
    }
    for (const site of consume.sites(raw) as Site[])
      out.push({ key: `${f}:${site.field}`, site, file: f, raw })
  }
  return out
}

describe('consume-once guards: registered, and marking before they spend', () => {
  it('the detector agrees with its own samples, in both directions', () => {
    // The samples that matter are the negatives about the REGION: a reject
    // branch may await because it returns, and a second stacked guard may too.
    // Counting awaits over the raw span reported a race at all three real sites.
    expect(() => consume.selfCheck()).not.toThrow()
    for (const s of consume.SAMPLES) {
      const got = consume.sites(s.code)
      expect(got.length, s.why).toBe(s.count)
      if (s.awaits !== undefined)
        expect(got[0].awaitsBetween, s.why).toBe(s.awaits)
    }
  })

  it('floor: the census still finds the known guards', () => {
    // A detector that matched nothing would report every guard registered and
    // every one of them synchronous.
    expect(found().length).toBeGreaterThanOrEqual(3)
  })

  it('no NEW consume-once guard is unregistered', () => {
    expect(
      [...new Set(found().map(f => f.key))].filter(k => !(k in REGISTERED)),
      `A new check-then-set guard on a path that can reach a charge. Verify the ` +
        `mark is set on the fall-through path with nothing awaited between the ` +
        `check and the mark, give it a test, then register it here.`
    ).toEqual([])
  })

  it('no registered guard disappeared (the list is not a wish list)', () => {
    const keys = new Set(found().map(f => f.key))
    expect(Object.keys(REGISTERED).filter(k => !keys.has(k))).toEqual([])
  })

  it('every guard marks with nothing awaited on the path to the mark', () => {
    const racy = found()
      .filter(f => f.site.awaitsBetween > 0)
      .map(
        f =>
          `${f.file}:${consume.lineOf(f.raw, f.site.markAt)} awaits ${f.site.awaitsBetween}x before marking`
      )
    expect(
      racy,
      `An await between the check and the mark is a race window: two concurrent ` +
        `taps both pass the check before either sets the mark, and both go on to ` +
        `charge. Move the mark up so the check-then-set is synchronous.`
    ).toEqual([])
  })
})
