/**
 * instagramParserScene (the sibling of instagramParserWizard, #1183) charges
 * MONEY_OUTCOME only after a successful parse (correct order) but DISCARDED the
 * updateUserBalance result. updateUserBalance returns false (never throws) on a
 * schema/insert failure or a ghost-payer with no users row, so on a charge
 * failure the user got the parse result for free, silently. This scene has no
 * refund path, so there is no mint risk — the fix simply checks the result and
 * logs the unbilled case (no more silent discard).
 *
 * Source-level seam test (the charge is deep inside a callback handler).
 * Mutation — discarding the result again — fails it.
 */
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const SRC = path.join(
  __dirname,
  '..',
  '..',
  'scenes',
  'instagramParserScene',
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

describe('instagramParserScene checks its charge result (no silent discard)', () => {
  it('assigns the MONEY_OUTCOME charge result and reacts to a failure', () => {
    const s = code()
    const charge = s.match(
      /charged = await updateUserBalance\([\s\S]{0,220}?MONEY_OUTCOME/
    )
    expect(
      charge,
      'the charge result is not assigned (silently discarded)'
    ).not.toBeNull()
    // and a failed charge is handled, not ignored
    const guard = s.search(/if \(!charged\)/)
    expect(guard, 'a failed charge is not handled').toBeGreaterThan(-1)
  })

  it('does not claim a charge that did not happen (#1393 honesty)', () => {
    const s = code()
    // the success message must gate its charge-claim on the real `charged` flag,
    // never state a charge unconditionally (a failed charge after a successful
    // parse leaves the user unbilled but told money was taken).
    expect(
      /charged\s*\?[\s\S]{0,60}?Charged:/.test(s),
      'the success charge-claim is not gated on `charged` (may lie on a failed charge)'
    ).toBe(true)
  })
})
