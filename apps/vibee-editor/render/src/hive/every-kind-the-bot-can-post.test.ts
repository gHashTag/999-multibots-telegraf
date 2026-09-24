import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NOTABLE_KINDS } from './note-route'

/**
 * A KIND THE BOT CAN POST AND THE DOOR CANNOT ACCEPT IS A SILENT 400.
 *
 * Measured 2026-09-24: `card-auto-sent` shipped in the bot's note vocabulary
 * and was never added here. Every automatic send was refused at the door and
 * written nowhere -- and the number built on it, "how much went out without
 * you", read zero by construction. It would have read zero the harder the
 * autopilot worked, which is the worst shape a defect can take: the metric
 * says the feature is doing nothing, so nobody suspects the metric.
 *
 * Nothing failed loudly. `postNote` logs a warning and returns "not noted",
 * on purpose -- a journal that is down must never eat a send. That very
 * mercy is what let this live.
 *
 * So the two vocabularies are compared here, from the source text rather
 * than by importing the bot (a different tsconfig, a different runtime, and
 * `@/` paths this project cannot resolve). The union is read literally: if
 * its shape ever changes so that nothing is found, the test fails rather
 * than passing on an empty set.
 */
const BOT_NOTE = resolve(__dirname, '../../../../../src/services/hiveNote.ts')

export function kindsInUnion(source: string): string[] {
  const start = source.indexOf('export type HiveNote')
  if (start < 0) return []
  const end = source.indexOf('severity:', start)
  if (end < 0) return []
  const head = source.slice(start, end)
  return [...head.matchAll(/'([a-z][a-z-]+)'/g)].map(m => m[1])
}

describe('every kind the bot can post', () => {
  it('reads the union and finds it non-empty', () => {
    const kinds = kindsInUnion(readFileSync(BOT_NOTE, 'utf8'))
    expect(kinds.length).toBeGreaterThan(5)
    expect(kinds).toContain('card-pressed')
  })

  it('is accepted by the door', () => {
    const kinds = kindsInUnion(readFileSync(BOT_NOTE, 'utf8'))
    const refused = kinds.filter(k => !NOTABLE_KINDS.has(k as never))
    expect(refused).toEqual([])
  })

  it('fails when a kind is missing from the door', () => {
    // The guard must be able to fail: a filter over an empty list is green.
    const refused = ['sweep-idle', 'a-kind-nobody-allowed'].filter(
      k => !NOTABLE_KINDS.has(k as never)
    )
    expect(refused).toEqual(['a-kind-nobody-allowed'])
  })
})
