import { describe, it, expect, afterEach } from 'vitest'
import { __languageSources } from '@/atoms/language'

/**
 * INSIDE TELEGRAM, ASK TELEGRAM.
 *
 * Found by the owner, not by a test: they opened their own browser tab and
 * read it in English. `navigator.language` in a Telegram WebView is the
 * DEVICE's locale, so a Russian-speaking person on an English phone got an
 * English app, while Telegram knew the answer all along.
 */

const setTelegram = (code?: string) => {
  ;(window as unknown as { Telegram?: unknown }).Telegram = code
    ? { WebApp: { initDataUnsafe: { user: { language_code: code } } } }
    : undefined
}

afterEach(() => setTelegram(undefined))

describe('which language a first visit gets', () => {
  it('TAKES TELEGRAM OVER THE DEVICE', () => {
    setTelegram('ru')
    expect(__languageSources.detectBrowserLanguage()).toBe('ru')
  })

  it('reads a regional code, not only the bare one', () => {
    setTelegram('ru-RU')
    expect(__languageSources.telegramLanguage()).toBe('ru')
  })

  it('answers English for a language we do not speak', () => {
    setTelegram('de')
    expect(__languageSources.telegramLanguage()).toBe('en')
  })

  it('FALLS BACK TO THE BROWSER OUTSIDE TELEGRAM, not to a guess', () => {
    /*
     * On the open web there is no Telegram object, and the browser's own
     * locale is the only thing anybody has said about the person.
     */
    setTelegram(undefined)
    expect(__languageSources.telegramLanguage()).toBeNull()
    expect(['ru', 'en']).toContain(__languageSources.detectBrowserLanguage())
  })

  it('survives a host that answers nothing at all', () => {
    ;(window as unknown as { Telegram?: unknown }).Telegram = {
      WebApp: { initDataUnsafe: {} },
    }
    expect(__languageSources.telegramLanguage()).toBeNull()
    expect(() => __languageSources.detectBrowserLanguage()).not.toThrow()
  })
})
