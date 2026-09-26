import { describe, expect, it } from 'vitest'
import {
  boundaryPaths,
  judge,
  pathToken,
  scaffold,
} from './src/agent/spec-quality'

/**
 * WHY THE BEES ARE SILENT (owner, 2026-09-26). The Queen skips a backlog issue
 * that is not a delegatable spec; on the live board that was all 496 of them.
 * These pin the mirrored gate so the preflight tool cannot quietly disagree
 * with the engine it stands in for -- and prove the scaffolder emits an issue
 * the Queen would actually take.
 */

describe('the boundary is what makes an issue delegatable', () => {
  it('a body with no boundary section is not delegatable (null, not [])', () => {
    const v = judge('# Fix the thing\n\nDo the thing, it is broken.')
    expect(boundaryPaths('# x\n\nnothing here')).toBeNull()
    expect(v.delegatable).toBe(false)
    expect(v.missing).toContain('boundary')
  })

  it('recognises the boundary heading in both languages', () => {
    expect(boundaryPaths('## Boundary\n- `src/a.ts`')).toEqual(['src/a.ts'])
    // Issues written before the 2026-08-19 English rule use the Russian heading.
    expect(boundaryPaths('## Границы\n- `src/b.ts`')).toEqual(['src/b.ts']) // cyrillic-ok: heading under test
  })

  it('a backtick-then-comma path keeps no dangling backtick', () => {
    // The exact shape that left 5 of 63 live paths unmatched.
    expect(pathToken('- `src/a.ts`, and more')).toBe('src/a.ts')
  })

  it('a tab-separated bullet does not fuse the marker into the path', () => {
    expect(pathToken('-\trings/SR-00/Foo.swift')).toBe('rings/SR-00/Foo.swift')
  })

  it('stops at the next heading', () => {
    const body = '## Boundary\n- `a/b.ts`\n\n## Notes\n- `c/d.ts`'
    expect(boundaryPaths(body)).toEqual(['a/b.ts'])
  })
})

describe('the four checks', () => {
  it('a boundary alone is delegatable but not yet a full spec', () => {
    const v = judge('## Boundary\n- `src/a.ts`')
    expect(v.delegatable).toBe(true)
    expect(v.isSpec).toBe(false)
    expect(v.missing).toEqual(['scenarios', 'requirements', 'success criteria'])
  })

  it('requirements need an FR-NNN MUST, not a wish', () => {
    const wish = judge(
      '## Requirements\n- it should be nice\n## Boundary\n- `a.ts`'
    )
    expect(wish.missing).toContain('requirements')
    const must = judge(
      '## Requirements\n- **FR-001**: the system MUST do X\n## Boundary\n- `a.ts`'
    )
    expect(must.missing).not.toContain('requirements')
  })

  it('success criteria need a measurable outcome, not an adjective', () => {
    // The boundary path here has no dotted extension on purpose: the measurable
    // check scans the WHOLE body (as the engine does), so a `foo.ts` anywhere
    // would satisfy it and hide the adjective.
    const adj = judge(
      '## Success Criteria\n- it is faster\n## Boundary\n- src/area/place'
    )
    expect(adj.delegatable).toBe(true)
    expect(adj.missing).toContain('success criteria')
    const measured = judge(
      '## Success Criteria\n- `bun run verify` exits 0\n## Boundary\n- src/area/place'
    )
    expect(measured.missing).not.toContain('success criteria')
  })
})

describe('the scaffolder feeds the Queen', () => {
  it('produces an issue that is delegatable AND a full spec', () => {
    const v = judge(scaffold('Give code_run a longer deadline'))
    expect(v.delegatable).toBe(true)
    expect(v.isSpec).toBe(true)
    expect(v.missing).toEqual([])
  })

  it('an empty title still yields a structurally complete spec', () => {
    expect(judge(scaffold('')).isSpec).toBe(true)
  })
})
