/**
 * THE WEAKEST CARD WAS THE EASIEST ONE TO GET.
 *
 * The sweep's first action is a PORTRAIT, drawn from the person's own face,
 * and step 2 of the brief is "take the FIRST whose next is not wait". So a
 * candidate at the top whose face nobody holds turned the whole sweep into
 * "please send me a photo" -- and by the brief's own rule (one card per
 * owner, a weak one DISPLACES the next) that request displaced the
 * portrait somebody further down would have got, whose face was right there.
 *
 * The fix uses the lever that already decides this: the ORDER of the lines.
 * Nothing new for the model to weigh.
 *
 * The guard that matters is not "a face goes first". It is that 'unknown'
 * DOES NOT GO LAST. `face` has two values on purpose -- 'yes' and 'unknown',
 * never 'no' -- because the cache is filled by a screen batch nobody may
 * have opened. Demoting for it would bury people over a fact never checked,
 * and would do it silently on a database where the column does not exist.
 */
import { describe, it, expect } from 'vitest'
import { leadsNote } from '@/services/crmProactive'

const row = (lead: string, face?: 'yes' | 'unknown', next = 'talk') => ({
  lead,
  display: `Лид ${lead}`, // cyrillic-ok: test fixture copy
  next,
  ...(face ? { face } : {}),
})
const order = (note: string) =>
  note
    .split('\n')
    .filter(l => l.startsWith('- '))
    .map(l => l.slice(2, l.indexOf(':')).replace(/ \(\d+\)$/, ''))

describe('the queue puts a face first', () => {
  it('a known face is offered before one nobody has looked at', () => {
    const note = leadsNote([
      row('900000001', 'unknown'),
      row('900000002', 'yes'),
      row('900000003', 'unknown'),
    ])
    expect(order(note)[0]).toContain('900000002')
    expect(note).toContain('лицо есть')
  })

  it('THE GUARD: a queue nobody has looked at keeps its own order', () => {
    // Every row 'unknown' -- the state of any owner who never opened the CRM
    // screen. Nothing may move, or the sweep starts working a different list
    // for a fact that was never checked.
    const rows = ['900000001', '900000002', '900000003'].map(l =>
      row(l, 'unknown')
    )
    expect(order(leadsNote(rows))).toEqual([
      'Лид 900000001',
      'Лид 900000002',
      'Лид 900000003',
    ])
  })

  it('THE GUARD: a row with no face field at all is not demoted', () => {
    // An older render, or a queue read before this field existed. The absence
    // of an answer is not the answer 'no'.
    const note = leadsNote([row('900000001'), row('900000002')])
    expect(order(note)).toEqual(['Лид 900000001', 'Лид 900000002'])
    expect(note).not.toContain('лицо есть')
  })

  it('being ignored still outweighs having a face', () => {
    // The owner's attention is the scarce thing: somebody whose card was
    // prepared and not pressed stays last, face or no face.
    const note = leadsNote(
      [row('900000001', 'yes'), row('900000002', 'unknown')],
      new Set(['900000001'])
    )
    expect(order(note)[0]).toContain('900000002')
  })

  it('nobody is dropped, whatever the order', () => {
    const note = leadsNote(
      [row('900000001', 'yes'), row('900000002'), row('900000003', 'unknown')],
      new Set(['900000002'])
    )
    expect(order(note)).toHaveLength(3)
  })
})
