import { describe, expect, it } from 'vitest'
import { hangs } from './turnEnd'

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
