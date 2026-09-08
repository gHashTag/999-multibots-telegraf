import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'

/*
 * THE CLASS IS CLOSED, AND THIS IS WHAT KEEPS IT CLOSED.
 *
 * `src.slice(src.indexOf(x))` returns the LAST CHARACTER of the file when x is
 * absent. A positive assertion over that fails confusingly; a negative one
 * passes vacuously and for ever. It cost a red gate on a clean tree, and a
 * verified sweep converted 22 sites to sliceFrom/sliceBetween.
 *
 * The sites BELOW were read one by one and deliberately left. Their reasons are
 * not decoration -- each is a different way the failure mode cannot reach the
 * site, and re-litigating them without reading is how a sweep becomes churn:
 *
 *   guarded      an explicit -1 check sits between the indexOf and the slice
 *   not-a-slice  the index feeds an ordering comparison, never a slice
 *   wrong-shape  slice(0, indexOf) widens by one char instead of collapsing
 *   constants    the offsets are literals, so -1 cannot arise
 *
 * WHAT THIS TEST IS FOR is the next one nobody read. A new unguarded site in a
 * file not listed here fails, and so does a NEW site in a listed file, because
 * the count is pinned rather than the file.
 */
const ROOT = path.resolve(__dirname, '../../..')

const EXAMINED: Record<string, { sites: number; why: string }> = {
  'apps/vibee-editor/render/autopilot-sql-shape.test.ts': {
    sites: 1,
    why: 'a lastIndexOf pair with both anchors alive; not the collapsing shape',
  },
  'apps/vibee-editor/render/feed-viewer-idor.test.ts': {
    sites: 1,
    why: 'guarded, and every assertion over the region is positive',
  },
  'src/__tests__/money/lapsedPayersCannotCountSeedingAsMoney.test.ts': {
    sites: 1,
    why: 'the line above asserts the anchor exists in the very string sliced',
  },
  'src/__tests__/tools/aMissingAnchorMustFailLoudly.test.ts': {
    sites: 2,
    why: 'the old shape, written on purpose to demonstrate what it returns',
  },
}

/** The same matcher the sweep used, kept here so the census cannot drift. */
const SLICE_FROM_INDEXOF = /\.slice\(\s*\w*\.?indexOf\(/
const GUARD =
  /toBeGreaterThan\(-1\)|!== *-1|=== *-1|>= *0|toBeGreaterThanOrEqual\(0\)/

function census() {
  const files = execFileSync('git', ['ls-files', '-z', '*.test.ts'], {
    cwd: ROOT,
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean)
  const found: Record<string, number> = {}
  for (const f of files) {
    const lines = fs.readFileSync(path.join(ROOT, f), 'utf8').split('\n')
    lines.forEach((l, i) => {
      // A QUOTATION IS NOT AN INVOCATION. This test's own header quotes the
      // shape it hunts, and the census counted it -- the same mistake that has
      // tripped three structural checks in this repository already. A comment
      // cannot slice anything.
      const t = l.trim()
      if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return
      if (!SLICE_FROM_INDEXOF.test(l)) return
      const window = lines.slice(Math.max(0, i - 6), i + 3).join('\n')
      if (GUARD.test(window)) return
      found[f] = (found[f] || 0) + 1
    })
  }
  return found
}

describe('the blind slice census is closed', () => {
  const found = census()

  it('the census still finds sites, so the matcher has not gone blind', () => {
    // Without this floor, a matcher that stopped matching would read as "all
    // converted" -- the way an empty search always does.
    const total = Object.values(found).reduce((a, b) => a + b, 0)
    expect(total).toBeGreaterThanOrEqual(5)
  })

  it('every unguarded site was examined, or this fails naming the file', () => {
    const unexplained = Object.entries(found)
      .filter(([f, n]) => !EXAMINED[f] || EXAMINED[f].sites !== n)
      .map(
        ([f, n]) =>
          `${f}: ${n} site(s), registry says ${EXAMINED[f]?.sites ?? 'nothing'}`
      )
    expect(unexplained).toEqual([])
  })

  it('the registry has no stale entries: a converted file must leave it', () => {
    // The half that stops the list becoming a permanent excuse.
    const gone = Object.keys(EXAMINED).filter(f => !found[f])
    expect(gone).toEqual([])
  })

  it('every entry carries a reason, not just a name', () => {
    for (const [f, e] of Object.entries(EXAMINED))
      expect(e.why.length, `${f} is listed without a reason`).toBeGreaterThan(8)
  })
})
