import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
// cyrillic-ok: the markup constant's own name, exported from billing-shared
import {
  НАЦЕНКА, // cyrillic-ok: existing export name
  COST_PER_TOKEN_USD,
  priceFor,
} from './src/agent/billing-shared'

/**
 * A DOCUMENT THAT TEACHES THE WRONG ARITHMETIC REINFECTS THE CODE.
 *
 * The owner's markup reached the charge and no shop window (PR #2283 fixed
 * the windows). It also never reached the DOCUMENTS -- and one of them is
 * `.claude/skills/vibee-stack-hard-won/SKILL.md`, whose own description reads
 * "Read BEFORE touching the vibee editor, render server...". It stated the
 * price formula without the markup and, from it, quoted lipsync as a
 * 3-token operation while the charge is 6.
 *
 * So the next agent to recompute a price from the page an agent is TOLD to
 * read would have reintroduced exactly the defect that was just removed, and
 * could have cited the skill as authority while doing it. Two more copies of
 * the same markup-free formula sat in .claude/loop-opus/pipeline-STATUS.md
 * and in a comment two lines from the markup constant itself.
 *
 * The rule enforced here: any STATEMENT of the price formula must carry the
 * markup. Not "documents must be right about everything" -- that is not
 * checkable -- but this one arithmetic, which has already gone wrong in three
 * places at once.
 */

const ROOT = join(__dirname, '..', '..', '..')

/** A formula, not a definition: `COST_PER_TOKEN = $0.005` states a constant. */
const FORMULA = /ceil\([^)\n]*0\.005/i
const MARKUP = /наценк|markup|НАЦЕНКА|×\s*2|\*\s*2/i // cyrillic-ok: it must match Russian prose

function walk(dir: string, keep: (f: string) => boolean, acc: string[] = []) {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue
    const full = join(dir, name)
    let st
    try {
      st = statSync(full)
    } catch {
      continue
    }
    if (st.isDirectory()) walk(full, keep, acc)
    else if (keep(name)) acc.push(full)
  }
  return acc
}

describe('every stated price formula carries the markup', () => {
  const files = [
    ...walk(join(ROOT, '.claude'), n => n.endsWith('.md')),
    ...walk(join(ROOT, 'loop'), n => n.endsWith('.md')),
    ...walk(join(__dirname, 'src'), n => n.endsWith('.ts')),
  ]

  it('the corpus is real and the matcher recognises a formula', () => {
    expect(files.length).toBeGreaterThan(20)
    // Self-check on the exact line that shipped, and on a line that must NOT
    // trip: a bare definition of the base is not a formula.
    expect(FORMULA.test('`price = ceil(OPERATION_COST_USD / 0.005)`')).toBe(
      true
    )
    expect(MARKUP.test('`price = ceil(OPERATION_COST_USD / 0.005)`')).toBe(
      false
    )
    expect(FORMULA.test('**COST_PER_TOKEN = $0.005** (себестоимость)')).toBe(
      false
    )
    expect(MARKUP.test('ceil(себестоимость × НАЦЕНКА / COST_PER_TOKEN)')).toBe(
      true
    )
  })

  it('no page states the formula without the markup', () => {
    const guilty: string[] = []
    for (const file of files) {
      const text = readFileSync(file, 'utf8')
      for (const line of text.split('\n')) {
        if (!FORMULA.test(line)) continue
        if (MARKUP.test(line)) continue
        guilty.push(
          `${file.slice(ROOT.length + 1)}: ${line.trim().slice(0, 90)}`
        )
      }
    }
    expect(guilty).toEqual([])
  })
})

/**
 * And the arithmetic itself, so the documents have something true to agree
 * with. If this ever fails, the docs are not the thing to change.
 */
describe('the markup is in the code', () => {
  it('the sale price is the cost times the markup over the base', () => {
    expect(НАЦЕНКА).toBeGreaterThan(1) // cyrillic-ok: existing export name
    expect(COST_PER_TOKEN_USD).toBeGreaterThan(0)
    // lipsync, the operation the stale docs quoted at half.
    expect(priceFor('lipsync_generate')).toBe(
      Math.ceil((0.015 * НАЦЕНКА) / COST_PER_TOKEN_USD) // cyrillic-ok: export name
    )
  })
})
