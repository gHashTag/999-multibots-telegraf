import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

/**
 * Every balance credit inside an Inngest function must run inside a step.run().
 *
 * Inngest delivers at-least-once and retries a function up to its retry limit.
 * step.run() memoises a completed step, so on a retry it is not re-executed —
 * that memoisation is what keeps a credit from being applied again. A
 * MONEY_INCOME updateUserBalance placed OUTSIDE a step would run on every
 * retry: a real double-credit. (payment-idempotency.md records this invariant;
 * it is the actual safeguard, unlike the compare-and-set in #1023/#1024, which
 * only dedupes a message.)
 *
 * This reads the Inngest sources and asserts each MONEY_INCOME credit sits
 * inside a step.run(...). A new credit added outside a step fails here.
 */

const DIR = path.join('src', 'inngest_app')

const strip = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
    .replace(
      /(^|[^:])\/\/.*$/gm,
      (m, p1) => p1 + ' '.repeat(m.length - p1.length)
    )
    .replace(/`(?:[^`\\]|\\.)*`|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, m =>
      ' '.repeat(m.length)
    )

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) {
      if (e.name === '__tests__' || e.name === 'test') continue
      out.push(...tsFiles(p))
    } else if (p.endsWith('.ts') && !p.endsWith('.test.ts')) out.push(p)
  }
  return out
}

/** Character ranges [open, close] spanned by each step.run( ... ) call. */
function stepRunSpans(src: string): Array<[number, number]> {
  const spans: Array<[number, number]> = []
  const re = /step\.run\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length - 1 // the '('
    let depth = 0
    for (; i < src.length; i++) {
      if (src[i] === '(') depth++
      else if (src[i] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    spans.push([m.index, i])
  }
  return spans
}

/** Credits (updateUserBalance with MONEY_INCOME) that are NOT inside a step. */
function creditsOutsideStep(src: string): number[] {
  const spans = stepRunSpans(src)
  const inside = (idx: number) => spans.some(([a, b]) => idx > a && idx < b)
  const out: number[] = []
  const re = /updateUserBalance\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src))) {
    // Is this call a MONEY_INCOME credit? Look at its argument window.
    const args = src.slice(m.index, m.index + 700)
    if (!/MONEY_INCOME/.test(args)) continue
    if (!inside(m.index)) out.push(src.slice(0, m.index).split('\n').length)
  }
  return out
}

describe('Inngest balance credits run inside step.run', () => {
  const files = tsFiles(DIR)

  it('finds the Inngest sources', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('every MONEY_INCOME credit sits inside a step.run()', () => {
    const offenders: string[] = []
    for (const f of files) {
      const src = strip(fs.readFileSync(f, 'utf8'))
      for (const line of creditsOutsideStep(src)) offenders.push(`${f}:${line}`)
    }
    expect(
      offenders,
      `credits outside step.run (retry would double-apply): ${offenders.join(', ')}`
    ).toEqual([])
  })

  it('finds the credits it is meant to guard (not vacuous)', () => {
    let credits = 0
    for (const f of files) {
      const src = strip(fs.readFileSync(f, 'utf8'))
      for (const _m of src.matchAll(/updateUserBalance\s*\(/g)) {
        const args = src.slice(_m.index!, _m.index! + 700)
        if (/MONEY_INCOME/.test(args)) credits++
      }
    }
    expect(credits).toBeGreaterThan(0)
  })
})
