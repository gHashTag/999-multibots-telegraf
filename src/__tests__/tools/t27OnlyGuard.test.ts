/**
 * The t27-only guard (scripts/t27-only-guard.cjs): new logic in the bot is
 * written in .t27 and nowhere else (owner, 2026-10-09). A gate that cannot
 * fail protects nothing, so each shape it refuses is shown refused, and each
 * thing it must let through is shown passing.
 */
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'

const require = createRequire(import.meta.url)
const { scanAdded, addedLines } = require('../../../scripts/t27-only-guard.cjs')

const lines = (...texts: string[]) =>
  texts.map((text, i) => ({ no: i + 1, text, prev: i ? texts[i - 1] : null }))
const kinds = (path: string, ...texts: string[]) =>
  scanAdded(path, lines(...texts)).map((b: any) => `${b.kind}:${b.name}`)

describe('the t27-only guard refuses new logic outside .t27', () => {
  it('a new predicate in the bot or the render', () => {
    expect(
      kinds(
        'src/navigation/x.ts',
        'export function mayRefund(a: number): boolean {'
      )
    ).toEqual(['predicate:mayRefund'])
    expect(
      kinds(
        'apps/vibee-editor/render/src/agent/x.ts',
        'async function overLimit(n: number): Promise<boolean> {'
      )
    ).toEqual(['predicate:overLimit'])
    expect(
      kinds(
        'src/services/x.ts',
        'const isLate = (at: number): boolean => at > 3'
      )
    ).toEqual(['predicate:isLate'])
    expect(kinds('src/core/x.ts', 'function canSend(ctx: any) {')).toEqual([
      'predicate:canSend',
    ])
    expect(
      kinds('src/core/x.ts', 'const shouldRetry = (e: unknown) => true')
    ).toEqual(['predicate:shouldRetry'])
  })

  it('a new threshold constant', () => {
    expect(kinds('src/x.ts', 'export const MAX_TASKS = 20')).toEqual([
      'threshold:MAX_TASKS',
    ])
    expect(kinds('src/x.ts', 'const WINDOW_MS = 24 * 60_000 // a day')).toEqual(
      ['threshold:WINDOW_MS']
    )
    expect(kinds('src/x.ts', 'const PRICE: number = 1.5;')).toEqual([
      'threshold:PRICE',
    ])
  })

  it('a marker without a reason is not a reason', () => {
    expect(kinds('src/x.ts', 'const LIMIT = 5 // t27-plumbing:')).toEqual([
      'marker:',
    ])
  })
})

describe('the t27-only guard lets through what is not new logic', () => {
  it('plumbing that says why, on the line or the line above', () => {
    expect(
      kinds(
        'src/x.ts',
        'const TIMEOUT_MS = 5000 // t27-plumbing: the HTTP client timeout'
      )
    ).toEqual([])
    expect(
      kinds(
        'src/x.ts',
        '// t27-plumbing: a type guard on the Telegram update',
        'function isText(m: any): boolean {'
      )
    ).toEqual([])
  })

  it('tests, generated and compiled spec files, and code outside the bot', () => {
    const rule = 'export function mayRefund(a: number): boolean {'
    expect(kinds('src/__tests__/x.test.ts', rule)).toEqual([])
    expect(kinds('src/spec/bot-neuro-office.logic.ts', rule)).toEqual([])
    expect(kinds('src/spec/x.gen.ts', 'export const MAX = 3')).toEqual([])
    expect(kinds('apps/vibee-editor/player/src/x.ts', rule)).toEqual([])
    expect(kinds('scripts/x.ts', rule)).toEqual([])
  })

  it("calling the spec's logic, lower-case names and strings are not new rules", () => {
    expect(
      kinds(
        'src/x.ts',
        "import { mayTake } from '@/spec/bot-neuro-office.logic'",
        'if (!mayTake(age, taken, bot)) return',
        "const label = 'MAX = 3'",
        'const total = rows.length',
        "export const OFFICE_TABLE = 'office_tasks'"
      )
    ).toEqual([])
  })
})

describe('the diff reader', () => {
  it('finds added lines with their numbers and the line above', () => {
    const diff = [
      'diff --git a/src/x.ts b/src/x.ts',
      '--- a/src/x.ts',
      '+++ b/src/x.ts',
      '@@ -10,2 +10,3 @@',
      ' // t27-plumbing: a type guard on the Telegram update',
      '+function isText(m: any): boolean {',
      '-old line',
      '+export const MAX_TASKS = 20',
      '+++ /dev/null',
    ].join('\n')
    const got = addedLines(diff)
    expect(Object.keys(got)).toEqual(['src/x.ts'])
    expect(got['src/x.ts'].map((l: any) => l.no)).toEqual([11, 12])
    expect(got['src/x.ts'][0].prev).toMatch(/t27-plumbing/)
    const bad = scanAdded('src/x.ts', got['src/x.ts'])
    expect(bad.map((b: any) => b.kind)).toEqual(['threshold'])
  })
})
