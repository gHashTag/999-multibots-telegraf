import { describe, expect, it } from 'vitest'
import { guessSpokenLang, seedSpokenLang } from './spokenLang'

describe('guessSpokenLang', () => {
  it('reads the script of what was heard', () => {
    expect(guessSpokenLang('Привет, как дела?')).toBe('ru')
    expect(guessSpokenLang('Hello, how are you?')).toBe('en')
  })

  it('a Russian phrase with a Latin name is still Russian', () => {
    expect(guessSpokenLang('Открой Zoom и напиши Ивану')).toBe('ru')
  })

  it('too little or too mixed teaches nothing', () => {
    expect(guessSpokenLang('ok')).toBeNull()
    expect(guessSpokenLang('...')).toBeNull()
    expect(guessSpokenLang('send the файл please')).toBeNull()
  })
})

describe('seedSpokenLang', () => {
  it('assumes the app language only when the browser agrees', () => {
    expect(seedSpokenLang('ru', ['ru-RU', 'en'])).toBe('ru')
    expect(seedSpokenLang('en', ['en-GB'])).toBe('en')
    expect(seedSpokenLang('ru', ['en-US', 'ru'])).toBeNull()
    expect(seedSpokenLang('en', [])).toBeNull()
    expect(seedSpokenLang('en', undefined)).toBeNull()
  })
})
