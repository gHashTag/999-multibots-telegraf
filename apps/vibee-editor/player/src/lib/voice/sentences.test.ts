import { describe, expect, it } from 'vitest'
import { takeSentences } from './sentences'

describe('takeSentences', () => {
  it('hands out finished sentences and keeps the unfinished tail', () => {
    const text =
      'Сейчас посмотрю твой календарь. Вижу три встречи на завтра и одну'
    const cut = takeSentences(text, 0, false)
    expect(cut.sentences).toEqual(['Сейчас посмотрю твой календарь.'])
    expect(text.slice(cut.next).trim()).toBe(
      'Вижу три встречи на завтра и одну'
    )
  })

  it('continues from where it stopped, never repeating a sentence', () => {
    const a = 'Первая фраза достаточно длинная. Вторая'
    const first = takeSentences(a, 0, false)
    const b = a + ' фраза тоже длинная! Третья'
    const second = takeSentences(b, first.next, false)
    expect(first.sentences).toEqual(['Первая фраза достаточно длинная.'])
    expect(second.sentences).toEqual(['Вторая фраза тоже длинная!'])
  })

  it('glues a very short sentence to the next one', () => {
    const cut = takeSentences('Да. Это можно сделать прямо сейчас. ', 0, false)
    expect(cut.sentences).toEqual(['Да. Это можно сделать прямо сейчас.'])
  })

  it('speaks the tail once the answer is final', () => {
    const cut = takeSentences('Готово. Ссылка в чате', 0, true)
    expect(cut.sentences).toEqual(['Готово. Ссылка в чате'])
    expect(cut.next).toBe('Готово. Ссылка в чате'.length)
  })

  it('treats a line break as the end of a sentence', () => {
    const cut = takeSentences('Шаги\n1 открой бота\n2 нажми старт\n', 0, false)
    expect(cut.sentences).toEqual(['Шаги', '1 открой бота', '2 нажми старт'])
  })

  it('cuts a run with no stop at a comma before it grows too long', () => {
    const run = Array.from({ length: 40 }, (_, i) => `пункт номер ${i}`).join(
      ', '
    )
    const cut = takeSentences(run, 0, false)
    expect(cut.sentences.length).toBeGreaterThan(1)
    for (const s of cut.sentences) expect(s.length).toBeLessThanOrEqual(240)
    expect(cut.sentences.join(' ').replace(/\s+/g, ' ')).toBe(
      run.slice(0, cut.next).trim().replace(/\s+/g, ' ')
    )
  })

  it('does not cut a decimal point', () => {
    const cut = takeSentences('Цена 3.5 тысячи за месяц работы', 0, false)
    expect(cut.sentences).toEqual([])
  })

  describe('the first clause of an answer', () => {
    it('is handed out before its sentence is finished', () => {
      const cut = takeSentences(
        'Сейчас посмотрю твой календарь на завтра, и если там',
        0,
        false
      )
      expect(cut.sentences).toEqual([
        'Сейчас посмотрю твой календарь на завтра,',
      ])
    })

    it('is not cut while it is shorter than a breath', () => {
      const cut = takeSentences('Хорошо, давайте посмотрим вме', 0, false)
      expect(cut.sentences).toEqual([])
      expect(cut.next).toBe(0)
    })

    it('waits for the mark to be followed by a space', () => {
      // "1,5" is a number, and a comma at the very end may be one too.
      const cut = takeSentences('Сейчас посмотрю твой календарь,', 0, false)
      expect(cut.sentences).toEqual([])
    })

    it('keeps a finished sentence whole when its rest is too short', () => {
      const cut = takeSentences(
        'Сейчас посмотрю твой календарь, ладно? Потом',
        0,
        false
      )
      expect(cut.sentences).toEqual(['Сейчас посмотрю твой календарь, ладно?'])
    })

    it('splits a finished first sentence when both halves stand alone', () => {
      const cut = takeSentences(
        'Сейчас посмотрю твой календарь на завтра, а потом напишу тебе итог. Дальше',
        0,
        false
      )
      expect(cut.sentences).toEqual([
        'Сейчас посмотрю твой календарь на завтра,',
        'а потом напишу тебе итог.',
      ])
    })

    it('happens once: later sentences stay whole', () => {
      const text =
        'Сейчас посмотрю твой календарь на завтра, подожди немного, пожалуйста. Вижу три встречи на завтра, одна в десять утра. '
      const first = takeSentences(text, 0, false)
      expect(first.sentences).toEqual([
        'Сейчас посмотрю твой календарь на завтра,',
        'подожди немного, пожалуйста.',
        'Вижу три встречи на завтра, одна в десять утра.',
      ])
      const again = takeSentences(text, first.next, true)
      expect(again.sentences).toEqual([])
    })
  })
})
