/**
 * aiPhotoshopScene collects photos into ctx.session.morphingImages as full
 * Buffers, the same in-memory session array morphingWizard uses. It has TWO push
 * sites (multi-photo album + sequential). Like morphingWizard (#1145) it had no
 * count cap, so a subscriber spamming photos climbs RSS until the container
 * OOM-kills the shared multi-bot process. This pins that BOTH push sites are
 * guarded by the count cap before they grow the array.
 *
 * Source-level seam test (the pushes are deep inside download/album handlers);
 * mutation — removing a guard, or the helper's ceiling check — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'aiPhotoshopScene',
  'index.ts'
)

const stripComments = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )

const code = () => stripComments(fs.readFileSync(SRC, 'utf8'))

describe('aiPhotoshop image collector caps the count (OOM guard, both sites)', () => {
  it('defines a positive ceiling and a helper that checks it', () => {
    const s = code()
    const m = s.match(/const MAX_AI_PHOTOSHOP_IMAGES = (\d+)/)
    expect(m, 'no MAX_AI_PHOTOSHOP_IMAGES cap').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThan(1)
    expect(
      /aiPhotoshopImageCapReached[\s\S]{0,200}>= MAX_AI_PHOTOSHOP_IMAGES/.test(
        s
      ),
      'the cap helper does not compare against the ceiling'
    ).toBe(true)
  })

  it('guards every morphingImages push with the cap', () => {
    const s = code()
    const pushes = (s.match(/ctx\.session\.morphingImages\.push\(/g) || [])
      .length
    const guards = (
      s.match(/if \(await aiPhotoshopImageCapReached\(ctx, isRu\)\) return/g) ||
      []
    ).length
    expect(pushes, 'expected two push sites').toBe(2)
    expect(guards, 'not every push site is guarded by the cap').toBe(pushes)
  })

  it('places each guard before its push', () => {
    const s = code()
    // Walk the pushes; each must have a guard between the previous push and it.
    const guardRe =
      /if \(await aiPhotoshopImageCapReached\(ctx, isRu\)\) return/g
    const pushRe = /ctx\.session\.morphingImages\.push\(/g
    const guardPos = [...s.matchAll(guardRe)].map(m => m.index!)
    const pushPos = [...s.matchAll(pushRe)].map(m => m.index!)
    for (const p of pushPos) {
      expect(
        guardPos.some(g => g < p && p - g < 400),
        `a push at ${p} has no cap guard just before it`
      ).toBe(true)
    }
  })
})
