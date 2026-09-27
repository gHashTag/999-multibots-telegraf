/**
 * EVERY `tri` COMMAND NAME IS TAKEN ONCE.
 *
 * bin/tri dispatches with one bash `case`, and a case takes the FIRST label
 * that matches: a second command under a taken name is dead code that looks
 * alive. Loop turn 11 (27.09.2026) added `tri drift` (did main move under
 * the gates?) while `tri drift` already meant "merged but not deployed";
 * the new command answered with the old one's Railway error. Nothing
 * failed -- the gate below is what would have.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const tri = readFileSync(resolve(__dirname, '../../../bin/tri'), 'utf8')

describe('bin/tri', () => {
  it('takes every command name once', () => {
    const labels = [...tri.matchAll(/^ {2}([a-z0-9][a-z0-9-]*)\)/gm)].map(
      m => m[1]
    )
    expect(labels.length).toBeGreaterThan(50)
    const seen = new Set<string>()
    const twice = labels.filter(l =>
      seen.has(l) ? true : (seen.add(l), false)
    )
    expect(twice).toEqual([])
  })
})
