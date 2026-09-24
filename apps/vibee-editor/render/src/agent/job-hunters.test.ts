import { describe, expect, it } from 'vitest'
import { HUNTER_BAR, HUNTER_SIGNS, huntersFrom } from './job-hunters'

/*
 * WHO IS HIRING, BY WHAT THEY WROTE.
 *
 * The ids here are invented (9000000xx) and so are the words: no real
 * person's message belongs in a repository, and a fixture that carries one
 * has a way of walking out into a prompt.
 */
/*
 * The clock values are small on purpose (10, 20, 30...), not epoch seconds.
 * A guard in this tree refuses any 9-to-10 digit number outside the invented
 * 9000000xx range, because that is the shape of a real Telegram id -- and it
 * is right to: a fixture with a real id in it has a way of walking out into a
 * prompt. Ordering is all these tests need from a clock.
 */
const m = (from: string, text: string, at = 10, mine = false) => ({
  from,
  text,
  at,
  mine,
})

describe('who among the contacts is hiring', () => {
  it('needs two different signs, not one word repeated', () => {
    /*
     * The failure this bar is shaped for: "какая у тебя ставка?" is a friend
     * asking about money. Saying "вакансия" three times is one person saying
     * one thing three times, not three reasons to believe.
     */
    const once = huntersFrom([
      m('900000051', 'вакансия'),
      m('900000051', 'ещё раз про вакансию'),
      m('900000051', 'вакансии смотрел?'),
    ])
    expect(once).toEqual([])

    const twice = huntersFrom([
      m('900000052', 'есть вакансия'),
      m('900000052', 'пришлёшь резюме?'),
    ])
    expect(twice.map(h => h.id)).toEqual(['900000052'])
    expect(twice[0].signs).toEqual(['resume', 'vacancy'])
  })

  it('never counts the owner own words as evidence about a contact', () => {
    // A person who wrote "looking for work, here is my CV" to ten friends
    // would otherwise turn all ten into recruiters.
    const out = huntersFrom([
      m('900000053', 'привет'),
      { ...m('900000053', 'ищу разработчика, пришлю резюме'), mine: true },
    ])
    expect(out).toEqual([])
  })

  it('answers with ids and evidence, never with a name', () => {
    const out = huntersFrom([
      m('900000054', 'мы hiring, нужен оффер обсудить', 50),
    ])
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({ id: '900000054', messages: 1 })
    expect(out[0].signs.length).toBeGreaterThanOrEqual(HUNTER_BAR)
    expect(JSON.stringify(out)).not.toMatch(/name|username|firstName/i)
  })

  it('puts whoever wrote most recently first', () => {
    const out = huntersFrom([
      m('900000055', 'вакансия и резюме', 10),
      m('900000056', 'вакансия, готовы обсудить оффер', 90),
    ])
    expect(out.map(h => h.id)).toEqual(['900000056', '900000055'])
  })

  it('reads words inside longer forms, in both languages', () => {
    const out = huntersFrom([
      m('900000057', 'обсудим ЗАРПЛАТУ и собеседование на следующей неделе'),
    ])
    expect(out[0].signs).toEqual(['interview', 'rate'])
  })

  it('ignores messages with no sender and survives rubbish', () => {
    const out = huntersFrom([
      { from: '', at: 1, text: 'вакансия резюме' } as never,
      { from: '900000058', at: NaN, text: null } as never,
    ])
    expect(out).toEqual([])
  })

  it('every sign group has words, and no word sits in two groups', () => {
    // A word in two groups would let one sentence clear the bar by itself,
    // which is the bar not existing.
    const seen = new Map<string, string>()
    for (const s of HUNTER_SIGNS) {
      expect(s.words.length).toBeGreaterThan(0)
      for (const w of s.words) {
        expect(seen.has(w), `${w} is in two groups`).toBe(false)
        seen.set(w, s.group)
      }
    }
  })
})
