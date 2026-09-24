import { describe, expect, it } from 'vitest'
import {
  calledTools,
  compare,
  literals,
  PAIRS,
  registeredTools,
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

  /*
   * A NAME ON DIRECT_CALL_ONLY THAT NO TOOL HAS PROTECTS NOTHING.
   *
   * That list is what stops a model turn -- including a business turn that
   * has just read a client's message -- from flipping the switch that sends
   * from the owner's account. A typo there is not a typo: it is the guard
   * silently absent, and every test OF the list still passes, because they
   * check the list rather than the join.
   */
  it('every name guarded by direct-call-only is a tool that exists', () => {
    const pair = compare().find(r => r.what.includes('прямым'))!
    expect(pair.says, 'tool names carry underscores').toContain('autopilot_set')
    expect(pair.says.length).toBeGreaterThanOrEqual(4)
    expect(pair.unheard).toEqual([])
  })

  it('every tool the app and the scripts ask for is registered', () => {
    const pair = compare().find(r => r.what.includes('зовут приложение'))!
    expect(pair.says).toContain('crm_outcomes')
    expect(pair.unheard).toEqual([])
  })

  it('reads tool names with underscores, which the literal reader does not', () => {
    // Measured: with the plain literal reader this pair found ZERO names and
    // was reported as a broken check -- correctly, and that is the whole
    // reason the broken-check rule exists.
    const reg = registeredTools()
    expect(reg.some((n: string) => n.includes('_'))).toBe(true)
    expect(calledTools().length).toBeGreaterThan(5)
  })

  /*
   * A MARKER FORM IS THREE PLACES: parsed, STRIPPED, and taught in the prompt.
   *
   * Measured the day `look:` shipped: the parser and the keyboard knew it and
   * the stripper did not, so a client would have seen raw brackets in their
   * own chat -- the first complaint in the buttons skill's own list.
   */
  it('every marker form the parser knows is one the stripper removes', () => {
    const pair = compare().find(r => r.what.includes('маркер'))!
    expect(pair.says).toContain('look')
    expect(pair.says).toContain('act')
    expect(pair.unheard, 'a form nobody strips reaches the person').toEqual([])
  })

  it('resolves a constant, so a stripper that uses one is not slandered', () => {
    // The first version of that pair read literals only and reported `look`
    // as unheard while `LOOK_MARKER` removed it perfectly well.
    const pair = compare().find(r => r.what.includes('маркер'))!
    expect(pair.hears).toContain('look')
  })
})
