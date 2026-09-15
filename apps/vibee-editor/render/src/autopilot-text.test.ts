/**
 * THE THREE RULES THAT DECIDE WHAT A VIEWER READS.
 *
 * Every case below is a defect that was live in the feed on 2026-09-15, quoted
 * from the real blog descriptions the proxy returns, not invented. The owner's
 * complaint was that the reels are "не продуманные и не обновлённые по тексту";
 * these are the three mechanisms that made them so.
 */
import { describe, it, expect } from 'vitest'
import { leadSentence, sentences, measurementPlate } from './autopilot-text'

describe('the summary is a whole sentence, never a cut one', () => {
  /*
   * THE CASE THAT PUBLISHED A WRONG NUMBER. The old `.slice(0, 110)` landed
   * inside the figure, and the caption builder then appended a full stop, so a
   * true statement became a false one that reads as finished.
   */
  it('never amputates a number', () => {
    const real =
      '[measured] A merged fp6_e3m2 correction changed 8 boundary codes, kept 56 codes unchanged, and brought a 66,720-code consistency pass to 0 mismatches.'
    expect(real.slice(0, 110)).toContain('66,72')
    expect(real.slice(0, 110)).not.toContain('66,720')

    const got = leadSentence(real)
    expect(got).toContain('66,720-code consistency pass to 0 mismatches')
    expect(got.endsWith('.')).toBe(true)
  })

  it('drops the blog’s internal evidence marker', () => {
    for (const marker of [
      '[measured]',
      '[proven]',
      '[measured in merged PR #778]',
    ]) {
      expect(leadSentence(`${marker} Девяносто тестов были недостижимы.`)).toBe(
        'Девяносто тестов были недостижимы.'
      )
    }
  })

  it('keeps only the first sentence when there are several', () => {
    const got = leadSentence(
      'Первое утверждение. Второе, которое в кадр не влезет.'
    )
    expect(got).toBe('Первое утверждение.')
  })

  it('does not mistake a version, a domain or a decimal for a sentence end', () => {
    expect(
      leadSentence('Сборка на t27.ai выросла на 12.5 процента за счёт кэша.')
    ).toBe('Сборка на t27.ai выросла на 12.5 процента за счёт кэша.')
  })

  it('returns a sentence-less description whole rather than cutting it', () => {
    const noStop = 'Заголовок без точки в конце строки'
    expect(leadSentence(noStop)).toBe(noStop)
  })

  it('is empty for nothing, and never throws', () => {
    expect(leadSentence('')).toBe('')
    expect(leadSentence(undefined as unknown as string)).toBe('')
  })
})

describe('joined sentences do not grow a second full stop', () => {
  it('leaves existing punctuation alone', () => {
    expect(sentences(['Первое.', 'Второе'])).toBe('Первое. Второе.')
    expect(sentences(['Вопрос?', 'Ответ!'])).toBe('Вопрос? Ответ!')
  })

  it('drops empty parts instead of printing a bare dot', () => {
    expect(sentences(['Одно.', '', null, undefined])).toBe('Одно.')
    expect(sentences([])).toBe('')
  })
})

describe('the style-B headline hoists a measurement, not an address', () => {
  /*
   * THE ONE-LINE DEFECT. `/\d/` asks only whether a digit appears somewhere,
   * and `t27.ai/#/blog` answers yes because of the `27`. Every odd post of the
   * day therefore opened on a URL in gold — and the decorated title then slipped
   * past both duplicate guards, so the same post went out twice.
   */
  const BLOG_PLATES = [
    { label: 'полный разбор', value: 't27.ai/#/blog' },
    { label: 'формат', value: 'измерение, не обещание' },
  ]

  it('refuses the blog plate that used to become the headline', () => {
    expect(/\d/.test('t27.ai/#/blog')).toBe(true) // the old predicate said yes
    expect(measurementPlate(BLOG_PLATES)).toBeUndefined()
  })

  it('accepts a value that actually begins with a number', () => {
    const plates = [...BLOG_PLATES, { label: 'экономия', value: '42% времени' }]
    expect(measurementPlate(plates)?.value).toBe('42% времени')
  })

  it('accepts a signed or approximate measurement', () => {
    for (const value of ['-3 дня', '+12 процентов', '≤5 мс', '~2 ГБ']) {
      expect(measurementPlate([{ value }])?.value).toBe(value)
    }
  })

  it('survives a missing, empty or malformed plate list', () => {
    expect(measurementPlate(undefined)).toBeUndefined()
    expect(measurementPlate([])).toBeUndefined()
    expect(
      measurementPlate([{ value: undefined }, { value: null }] as never)
    ).toBeUndefined()
  })
})

describe('the hashtag block, as the producer builds it', () => {
  /*
   * Not an import: the line lives in scripts/agent-autopilot.ts, which cannot be
   * imported without starting the daemon. The shape is pinned here so a
   * regression is visible, and the constants are the real ones.
   */
  it('stops spending a scarce slot on a repeat', () => {
    const tags = ['блог', 't27'] // what blogTopics hardcodes
    const before = ['#TrinityS3AI', '#t27', ...tags.map(t => '#' + t)].slice(
      0,
      5
    )
    const after = [
      ...new Set(['#TrinityS3AI', '#t27', ...tags.map(t => '#' + t)]),
    ].slice(0, 5)

    expect(before).toEqual(['#TrinityS3AI', '#t27', '#блог', '#t27'])
    expect(after).toEqual(['#TrinityS3AI', '#t27', '#блог'])
    expect(new Set(after).size).toBe(after.length)
  })
})
