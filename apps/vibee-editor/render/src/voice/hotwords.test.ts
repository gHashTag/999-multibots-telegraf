import { describe, expect, it } from 'vitest'
import { fixWords } from './hotwords'

describe('fixWords', () => {
  // Each row is what the live ears returned on 2026-10-02 (`tri words`).
  it.each([
    ['Сделай рилз про мою кофейню.', 'Сделай рилс про мою кофейню.'],
    ['Сделай три рильса на неделю.', 'Сделай три рилса на неделю.'],
    ['Пришли релс в Telegram.', 'Пришли рилс в Telegram.'],
    ['Запусти Lipsing с моим голосом.', 'Запусти липсинк с моим голосом.'],
    ['Лифсинг не работает.', 'Липсинк не работает.'],
    ['Сколько стоит Липсинг?', 'Сколько стоит липсинк?'],
    ['Сделай нерофото.', 'Сделай нейрофото.'],
    ['Открой ули.', 'Открой улей.'],
    ['Сделай лит-магнит.', 'Сделай лид-магнит.'],
    ['Сделай лидмагнит.', 'Сделай лид-магнит.'],
    ['Сделай вилз про мою кофейню.', 'Сделай рилс про мою кофейню.'],
    ['Запусти Lepsing с моим голосом.', 'Запусти липсинк с моим голосом.'],
    ['Открой Вайbe.', 'Открой Вайби.'], // Latin b and e
  ])('%s -> %s', (heard, said) => {
    expect(fixWords(heard, 'ru')).toBe(said)
  })

  it('keeps the ending the ears gave, in every case of the word', () => {
    expect(fixWords('пять рилзов и рилзами', 'ru')).toBe(
      'пять рилсов и рилсами'
    )
  })

  it('mends a Latin look-alike inside a Russian word', () => {
    // The last letter is a LATIN e (U+0065) and o (U+006F).
    expect(fixWords('Покажи мою сe Iam и кoфейню.', 'ru')).toBe(
      'Покажи мою се Iam и кофейню.'
    )
    // Vibee in two alphabets is the brand, by its own row.
    expect(fixWords('Открой Вайбe.', 'ru')).toBe('Открой Вайби.')
  })

  it('leaves real words and Latin words alone', () => {
    for (const ok of [
      'Положи рельсы и рилсы.',
      'Это мой Telegram и мой CRM.',
      'Пули и гули.', // ends in the same letters, but is not the word
      'Покажи мои рилсы.',
      'Сделай промпт для аватара.',
      'Мы на одной вайбе.', // wholly Cyrillic: a real word, not the brand
    ])
      expect(fixWords(ok, 'ru')).toBe(ok)
  })

  it('does not touch English, where Parakeet heard every word right', () => {
    expect(fixWords('Make a reel about lipsing.', 'en')).toBe(
      'Make a reel about lipsing.'
    )
    // No language named: the alphabet decides.
    expect(fixWords('Make a reel about lipsing.')).toBe(
      'Make a reel about lipsing.'
    )
    expect(fixWords('Сделай рилз.')).toBe('Сделай рилс.')
  })
})
