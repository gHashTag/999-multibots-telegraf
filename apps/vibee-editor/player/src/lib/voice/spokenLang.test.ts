import { describe, expect, it } from 'vitest'
import { guessSpokenLang, seedSpokenLang, sentenceLang } from './spokenLang'

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

describe('sentenceLang', () => {
  it('any Cyrillic is read by the Russian voice', () => {
    expect(sentenceLang('Твой API отвечает за 3 секунды.')).toBe('ru')
    expect(sentenceLang('Your API answers in 3 seconds.')).toBe('en')
    // Mostly Latin letters, still Russian: the English voice cannot read it.
    expect(sentenceLang('Открой Google Docs')).toBe('ru')
  })

  it('no letters is left to the session', () => {
    expect(sentenceLang('42.')).toBeNull()
    expect(sentenceLang('👍')).toBeNull()
  })
})
