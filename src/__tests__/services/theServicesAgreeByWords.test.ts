import { describe, expect, it } from 'vitest'
import {
  compare,
  literals,
  PAIRS,
} from '../../../scripts/cross-service-vocabularies.cjs'

/*
 * TWO SERVICES AGREEING BY STRING, AND NOTHING CHECKING THE AGREEMENT.
 *
 * The bot posted the journal kind `card-auto-sent` from the day AUTO
 * shipped; the render's door never knew the word. Every automatic send was
 * refused with 400 and written nowhere, and the figure built on those rows
 * read zero by construction -- the louder the better the autopilot worked.
 *
 * This checks the CHECKER. A comparer whose patterns have drifted finds
 * nothing and reports agreement, which is the same silence one layer up.
 */
describe('the services agree by words', () => {
  it('reads both sides of every pair', () => {
    const rows = compare()
    expect(rows).toHaveLength(PAIRS.length)
    for (const r of rows) {
      expect(r.readable, `${r.what}: patterns found nothing`).toBe(true)
      expect(r.says.length).toBeGreaterThan(1)
      expect(r.hears.length).toBeGreaterThan(1)
    }
  })

  it('every word the bot can say about a card is heard', () => {
    const journal = compare().find(r => r.what.includes('журнал'))!
    expect(journal.says).toContain('card-auto-sent')
    expect(journal.unheard).toEqual([])
  })

  it('an unheard word is reported, not averaged away', () => {
    const rows = compare([
      {
        what: 'проверка сторожа',
        says: () => ['sweep-idle', 'a-word-nobody-hears'],
        hears: () => ['sweep-idle', 'sweep-card'],
      },
    ] as never)
    expect(rows[0].unheard).toEqual(['a-word-nobody-hears'])
  })

  it('a pattern that finds nothing is a broken check, never agreement', () => {
    /*
     * The whole class of defect LOOKS like an empty list, so an empty list
     * must never read as "all good". This is the property that keeps the
     * comparer from becoming the thing it was written to catch.
     */
    const rows = compare([
      { what: 'словарь не прочитан', says: () => [], hears: () => ['a'] },
    ] as never)
    expect(rows[0].readable).toBe(false)
    expect(rows[0].unheard).toEqual([])
  })

  it('reads literals only inside the slice it was given', () => {
    const src = "before 'aaa'\nSTART 'bbb' 'ccc'\nEND 'ddd'"
    expect(literals(src, 'START', 'END')).toEqual(['bbb', 'ccc'])
    // A missing anchor returns nothing, which the check above turns into a
    // failure rather than a pass.
    expect(literals(src, 'NOPE', 'END')).toEqual([])
  })
})
