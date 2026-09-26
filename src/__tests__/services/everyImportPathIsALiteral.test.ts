import { describe, expect, it } from 'vitest'
import { walk } from '../../../scripts/orphan-modules.cjs'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/*
 * THE CENSUS CAN ONLY SEE CALLERS IT CAN READ.
 *
 * `tri dead` finds modules nothing imports by looking for an import of the
 * exact specifier. That is sound only while every import path in this
 * repository is a LITERAL. The day somebody writes
 *
 *     await import(`./providers/${name}`)
 *
 * the census goes blind to that whole family -- and it goes blind SILENTLY,
 * reporting live modules as dead, which is the failure mode that already cost
 * this check three false alarms before it found anything true.
 *
 * Measured 2026-09-25: no such import exists anywhere in the bot or the
 * render. This keeps it that way, or tells the next person what they just
 * broke.
 */
const ROOT = resolve(__dirname, '../../..')

/**
 * An import whose path is not a quoted string.
 *
 * `import(` at the END of a line is fine and common: prettier wraps a long
 * specifier onto the next line, and the path there is still a literal. The
 * first version of this pattern did not allow for that and reported 117
 * healthy imports -- the sixth false alarm of this family in a day, and this
 * time inside the very guard written against going blind.
 */
const NOT_A_LITERAL = /\bimport\(\s*[^'"\s]/

describe('every import path is a literal', () => {
  it('so the census cannot miss a caller', () => {
    const files = [
      ...walk('src'),
      ...walk('apps/vibee-editor/render/src'),
    ].filter(p => !p.includes('.test.') && !p.includes('__tests__'))
    expect(files.length).toBeGreaterThan(200)
    const built: string[] = []
    for (const f of files) {
      const src = readFileSync(resolve(ROOT, f), 'utf8')
      src.split('\n').forEach((line, i) => {
        // `import(` inside a comment or a string is not an import.
        if (/^\s*(\*|\/\/)/.test(line)) return
        if (NOT_A_LITERAL.test(line)) built.push(`${f}:${i + 1}`)
      })
    }
    expect(
      built,
      'an import built at run time makes `tri dead` report live modules as dead'
    ).toEqual([])
  })

  it('the pattern can fail, so an empty answer means something', () => {
    // A scan that finds nothing is the shape of every defect in this family.
    expect(NOT_A_LITERAL.test('await import(`./p/${name}`)')).toBe(true)
    expect(NOT_A_LITERAL.test('await import(path)')).toBe(true)
    expect(NOT_A_LITERAL.test("await import('@/services/x')")).toBe(false)
    expect(NOT_A_LITERAL.test('await import("./x")')).toBe(false)
    // Wrapped by prettier: the path is on the next line and still a literal.
    expect(NOT_A_LITERAL.test('const { x } = await import(')).toBe(false)
  })
})
