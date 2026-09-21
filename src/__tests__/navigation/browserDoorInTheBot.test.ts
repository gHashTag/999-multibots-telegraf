import { describe, it, expect } from 'vitest'
import {
  browserInviteText,
  browserInviteKeyboard,
  browserElsewhereText,
  BROWSER_START_PARAM,
} from '@/navigation/helpers/browserInvite'
import { startGreetingKeyboard } from '@/navigation/helpers/startGreeting'

/**
 * A FEATURE NOBODY IS TOLD ABOUT IS A FEATURE NOBODY HAS.
 *
 * Before this the bot said nothing about the browser: `grep` across the
 * bot's own source for it returned nothing at all, and the only way in was
 * to open the mini app already knowing which tab to look for.
 */

/* startGreetingKeyboard returns a Telegraf Markup, not a bare array. */
const labels = (markup: unknown): string[] =>
  (
    (markup as { reply_markup?: { inline_keyboard?: { text?: string }[][] } })
      .reply_markup?.inline_keyboard ?? []
  )
    .flat()
    .map(b => b.text || '')

describe('the door from the bot', () => {
  it('NEVER ASKS FOR A PASSWORD, and says who types it', () => {
    /*
     * The whole design rests on the person signing in inside the stream,
     * where only video travels back. An invitation that even hinted at a
     * password in this chat would undo it.
     */
    for (const isRu of [true, false]) {
      const text = browserInviteText(isRu)
      expect(text).not.toMatch(
        /введите пароль|send.*password|type.*password/i // cyrillic-ok: words the invitation must never contain
      )
      expect(text).toMatch(isRu ? /сами/i : /yourself/i) // cyrillic-ok: UI text
    }
  })

  it('opens the app, not a browser tab', () => {
    /*
     * A url button opens the app OUTSIDE Telegram, where the person is not
     * signed in, and they meet a sign-in wall instead of their browser.
     */
    const rows = browserInviteKeyboard(true, { app: true }) as never as {
      text?: string
      web_app?: { url: string }
    }[][]
    const button = rows[0][0]
    expect(button.web_app?.url).toContain(
      `tgWebAppStartParam=${BROWSER_START_PARAM}`
    )
  })

  it('OFFERS NOTHING WHERE A web_app BUTTON IS ILLEGAL', () => {
    /* Telegram allows them in private chats only; a group would 400. */
    expect(browserInviteKeyboard(true, { app: false })).toEqual([])
    expect(browserElsewhereText(true)).toMatch(/личном чате/i) // cyrillic-ok: UI text
  })

  it('IS IN THE /start GREETING, not only behind a command', () => {
    /* Somebody who never types commands must still be able to find it. */
    const ru = labels(startGreetingKeyboard(true, { app: true, rubles: true }))
    expect(
      ru.some(l => /браузер/i.test(l)), // cyrillic-ok: the button label
      ru.join(' | ')
    ).toBe(true)
    const en = labels(
      startGreetingKeyboard(false, { app: true, rubles: false })
    )
    expect(
      en.some(l => /browser/i.test(l)),
      en.join(' | ')
    ).toBe(true)
  })

  it('the start_param is the one the app maps to /browser', () => {
    expect(BROWSER_START_PARAM).toBe('browser')
  })
})
