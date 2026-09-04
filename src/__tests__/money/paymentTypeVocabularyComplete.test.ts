import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * The refund census classifies every money movement as a credit or a debit.
 * Its first version hardcoded that vocabulary and got it wrong three ways:
 *
 *  - PaymentType.REFUND was missing entirely. It is a third member of the
 *    enum, used in five files, and a file that only ever refunds through it
 *    was reported as never crediting. That is how a census says "clean".
 *  - The bare word MONEY_INCOME matched string literals in the zot
 *    classifier's case labels, which LABEL payments rather than making them.
 *  - Qualifying by `PaymentType.` was still not enough: ZOTPaymentType ENDS
 *    WITH PaymentType, so an unanchored pattern matched inside another enum's
 *    name and accused that classifier of moving money.
 *
 * The lesson is not "add REFUND". It is that a hand-written vocabulary repeats
 * the blind spot of whoever wrote it. So the probe now derives the members
 * from the enum and refuses to run when one of them is unclassified, and this
 * file pins that refusal -- because a probe that silently ignores a new
 * direction reports a clean repository while money moves through it.
 */

const ROOT = path.resolve(__dirname, '../../..')
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8')

const PROBE = 'scripts/probe-refund-without-charge.cjs'
const ENUM_FILE = 'src/interfaces/payments.interface.ts'

const enumMembers = (): string[] => {
  const block = read(ENUM_FILE).match(/enum PaymentType\s*\{([\s\S]*?)\}/)
  expect(block, 'PaymentType enum must parse').toBeTruthy()
  return [
    ...(block as RegExpMatchArray)[1].matchAll(/^\s*([A-Z_]+)\s*=/gm),
  ].map(m => m[1])
}

const probeMembers = (): { credit: string[]; debit: string[] } => {
  const src = read(PROBE)
  const grab = (name: string) => {
    const m = src.match(new RegExp(`const ${name}\\s*=\\s*\\[([^\\]]*)\\]`))
    expect(m, `${name} must parse`).toBeTruthy()
    return [...(m as RegExpMatchArray)[1].matchAll(/'([A-Z_]+)'/g)].map(
      x => x[1]
    )
  }
  return { credit: grab('CREDIT_MEMBERS'), debit: grab('DEBIT_MEMBERS') }
}

describe('the money vocabulary of the refund census', () => {
  it('classifies every member of the PaymentType enum', () => {
    const members = enumMembers()
    expect(members.length).toBeGreaterThanOrEqual(3)
    const { credit, debit } = probeMembers()
    const known = new Set([...credit, ...debit])
    const unclassified = members.filter(m => !known.has(m))
    expect(unclassified).toEqual([])
  })

  it('does not classify members that do not exist', () => {
    // The other direction. A stale entry left behind after an enum member is
    // renamed makes the probe look complete while it matches nothing.
    const members = new Set(enumMembers())
    const { credit, debit } = probeMembers()
    const phantom = [...credit, ...debit].filter(m => !members.has(m))
    expect(phantom).toEqual([])
  })

  it('counts REFUND as a credit, not as nothing', () => {
    const { credit } = probeMembers()
    expect(credit).toContain('REFUND')
    expect(credit).toContain('MONEY_INCOME')
  })

  it('anchors the enum name so another enum ending in it cannot match', () => {
    // ZOTPaymentType.REFUND is a real value in this repository and must not be
    // read as ours.
    const src = read(PROBE)
    // EVERY occurrence, not just one. The first version of this check accepted
    // "at least one anchored spelling", and removing the anchor from one of the
    // two pattern builders left it green -- a guard that passes while half the
    // rule is gone.
    const all = (src.match(/PaymentType\\\\\./g) || []).length
    const anchored = (
      src.match(/\(\?<!\[A-Za-z0-9_\]\)PaymentType\\\\\./g) || []
    ).length
    expect(all).toBeGreaterThanOrEqual(2)
    expect(anchored).toBe(all)
  })

  it('keeps its own negative samples for the two false matches it made', () => {
    // The self-check must still contain the cases that were wrong once, so a
    // future broadening of the pattern fails here rather than in production.
    const src = read(PROBE)
    expect(src).toMatch(/ZOTPaymentType\.REFUND/)
    expect(src).toMatch(/case 'MONEY_INCOME':/)
  })
})
