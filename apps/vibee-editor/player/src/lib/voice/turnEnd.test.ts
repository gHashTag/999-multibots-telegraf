import { describe, expect, it } from 'vitest'
import { SOUND_DONE, hangs, stillGoing } from './turnEnd'

describe('hangs: the words say whether the phrase is still going', () => {
  it.each([
    'show me my week and',
    'I want to',
    'open the invoice for',
    'because',
    'uh',
    'well, um',
    'let me think...',
    'first the calendar,',
    'two things:',
    // cyrillic-ok-next-line
    'Покажи мне неделю и',
    // cyrillic-ok-next-line
    'Хочу записаться на',
    // cyrillic-ok-next-line
    'Сделай рилс про',
    // cyrillic-ok-next-line
    'Ну э-э',
    // cyrillic-ok-next-line
    'Напомни, что',
    // cyrillic-ok-next-line
    'Я думаю…',
    // cyrillic-ok-next-line
    'Пришли счёт, который.',
  ])('"%s" is still going', text => {
    expect(hangs(text)).toBe(true)
  })

  it.each([
    '',
    'open my calendar',
    'Show me my week.',
    'turn it on',
    'what is it about?',
    'I think so',
    'tell me more about her',
    // cyrillic-ok-next-line
    'Покажи мне',
    // cyrillic-ok-next-line
    'Что это?',
    // cyrillic-ok-next-line
    'Ну',
    // cyrillic-ok-next-line
    'Сделай рилс.',
    // cyrillic-ok-next-line
    'Угу.',
    'Wait!',
  ])('"%s" is over', text => {
    expect(hangs(text)).toBe(false)
  })
})

describe('stillGoing: the voice is a second judge that can only wait', () => {
  it('finished words in an unfinished voice are still going', () => {
    expect(stillGoing('Show me my week', 0.12)).toBe(true)
  })

  it('finished words in a finished voice are over', () => {
    expect(stillGoing('Show me my week', 0.93)).toBe(false)
  })

  it("the cut is Smart Turn's own: exactly SOUND_DONE is finished", () => {
    expect(stillGoing('Show me my week', SOUND_DONE)).toBe(false)
    expect(stillGoing('Show me my week', SOUND_DONE - 0.01)).toBe(true)
  })

  it('a voice that sounds finished cannot end hanging words', () => {
    expect(stillGoing('show me my week and', 0.99)).toBe(true)
  })

  it('without a verdict from the voice, the words alone decide', () => {
    expect(stillGoing('Show me my week')).toBe(false)
    expect(stillGoing('Show me my week', null)).toBe(false)
  })

  it('nothing said is never held, whatever the voice judged of a breath', () => {
    expect(stillGoing('', 0.01)).toBe(false)
    expect(stillGoing('  ', 0.01)).toBe(false)
  })
})
