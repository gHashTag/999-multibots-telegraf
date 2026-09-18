/**
 * THE WAY IN FROM ANOTHER DEVICE HAD NO HANDLE ON THE SCREEN EVERYONE SEES.
 *
 * `/app` is a registered command with its own line in the Telegram menu, and it
 * opens the mini app at the screen that shows a pairing code. But the greeting
 * is what a person actually looks at, and it offered the hive, the agent, the
 * club, the profile and three ways to pay -- never the way in from a laptop or
 * the native app.
 *
 * Measured 2026-09-18 from the journal: 44 sign-ins inside Telegram and NOT ONE
 * code minted in 4.2 days. Nobody was refused either, so nobody reached the
 * screen. That is what a door with no handle looks like from the inside, and it
 * is indistinguishable from "nobody wants it" until somebody puts a handle on.
 */
import { describe, it, expect } from 'vitest'
import { startGreetingKeyboard } from '@/navigation/helpers/startGreeting'

/** Every button's text and its web_app url, flattened out of the rows. */
function buttons(keyboard: ReturnType<typeof startGreetingKeyboard>) {
  const rows = (keyboard as { reply_markup: { inline_keyboard: unknown[][] } })
    .reply_markup.inline_keyboard
  return rows.flat().map(b => {
    const x = b as { text?: string; web_app?: { url?: string } }
    return { text: String(x.text ?? ''), url: String(x.web_app?.url ?? '') }
  })
}

describe('the greeting offers the way in from another device', () => {
  it('has a sign-in button when the mini app can be opened', () => {
    const found = buttons(
      startGreetingKeyboard(true, { app: true, rubles: true })
    ).find(b => b.text.includes('другом устройстве'))
    expect(found, 'no sign-in button on the greeting').toBeTruthy()
  })

  /*
   * THE ADDRESS IS THE WHOLE POINT. `pair` is the start parameter the mini app
   * maps to the screen that mints a code; an unknown value is NOT an error
   * there -- it falls through to the feed, which is exactly how this failed
   * once before, in 2026-09-03: the person pressed sign-in, landed on the feed,
   * saw no code, typed something anyway and was told the code was not found.
   */
  it('points at the pairing screen, not at the app in general', () => {
    const found = buttons(
      startGreetingKeyboard(true, { app: true, rubles: true })
    ).find(b => b.text.includes('другом устройстве'))
    expect(found?.url).toContain('pair')
  })

  it('says the same thing in English', () => {
    const found = buttons(
      startGreetingKeyboard(false, { app: true, rubles: true })
    ).find(b => b.text.includes('another device'))
    expect(found, 'no English sign-in button').toBeTruthy()
    expect(found?.url).toContain('pair')
  })

  /*
   * Outside a private chat Telegram rejects a web_app button, and a rejected
   * button does not fail quietly: the WHOLE message fails to send. So where the
   * mini app cannot be opened, this button must not be offered at all.
   */
  it('is absent where a web_app button cannot be sent', () => {
    const texts = buttons(
      startGreetingKeyboard(true, { app: false, rubles: true })
    ).map(b => b.text)
    expect(texts.some(t => t.includes('другом устройстве'))).toBe(false)
  })

  /*
   * The rows people already know must not be rearranged by this: a greeting
   * that moves its buttons around costs everybody who had learned it.
   */
  it('leaves the doors that were already there', () => {
    const texts = buttons(
      startGreetingKeyboard(true, { app: true, rubles: true })
    ).map(b => b.text)
    for (const kept of ['Улей', 'Спросить агента', 'клуб', 'Профиль']) {
      expect(
        texts.some(t => t.includes(kept)),
        `lost ${kept}`
      ).toBe(true)
    }
  })
})
