import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * THE ONE THING THIS SCREEN MUST NEVER DO IS ASK FOR A PASSWORD.
 *
 * The whole design rests on the person signing into their own accounts
 * themselves, inside the stream, where only video travels back. A password
 * field on this page -- or a line inviting somebody to send one -- would
 * quietly move the credential into our hands and into the agent's context,
 * which is exactly what the architecture was built to prevent
 * (docs/architecture/remote-browser-per-user.md §4.4).
 *
 * So this file reads the page's own source. A behavioural test would pass on
 * a page that grew a password field tomorrow; this one will not.
 */

const page = readFileSync(join(__dirname, 'Browser.tsx'), 'utf8')
const dict = readFileSync(join(__dirname, '..', 'atoms', 'language.ts'), 'utf8')

describe('the screen never collects a credential', () => {
  it('has no password input of any kind', () => {
    expect(page).not.toMatch(/type=["']password["']/)
    expect(page).not.toMatch(/<input/)
    expect(page).not.toMatch(/autoComplete=["'](current|new)-password["']/)
  })

  it('tells the person that they sign in themselves', () => {
    /* The promise has to be on the screen, not only in the architecture. */
    expect(page).toContain('browser.youSignIn')
    for (const lang of ['sign into your accounts yourself', 'заходите сами']) {
      expect(dict).toContain(lang)
    }
  })

  it('warns against sending a password in a chat, in both languages', () => {
    expect(dict).toContain('Never send a password in a chat')
    expect(dict).toContain('Никогда не присылайте пароль в переписке')
  })
})

describe('closing and forgetting are not the same button', () => {
  it('wires both buttons through the tested decisions, not by hand', () => {
    /*
     * The behaviour itself is pinned in remoteBrowserUi.test.ts. What this
     * checks is that the SCREEN goes through it -- a page calling the API
     * functions directly would slip past those tests entirely.
     */
    expect(page).toContain('BROWSER_BUTTONS.close')
    expect(page).toContain('BROWSER_BUTTONS.forget')
    expect(page).toContain('tapWipe(confirmForget)')
    expect(page).not.toMatch(/act\(closeBrowserSession\)/)
    expect(page).not.toMatch(/act\(forgetBrowserProfile\)/)
    expect(page).toContain('browser.forget.sure')
  })

  it('says out loud that closing keeps the logins', () => {
    expect(page).toContain('browser.closeKeeps')
    expect(dict).toContain('Closing keeps you signed in')
    expect(dict).toContain('Закрытие сохраняет ваши входы')
  })
})

describe('every string it shows exists in both languages', () => {
  it('has no key in one dictionary and not the other', () => {
    const used = [...page.matchAll(/t\('([a-zA-Z.]+)'\)/g)].map(m => m[1])
    expect(used.length).toBeGreaterThan(5)

    const en = dict.slice(
      dict.indexOf('const en: Translations'),
      dict.indexOf('const ru: Translations')
    )
    const ru = dict.slice(dict.indexOf('const ru: Translations'))
    for (const key of used) {
      expect(en, `missing in en: ${key}`).toContain(`'${key}':`)
      expect(ru, `missing in ru: ${key}`).toContain(`'${key}':`)
    }
  })
})

describe('the glow does not lie about who is driving', () => {
  it('shows only while an agent is working', () => {
    expect(page).toContain('agentWorking')
    expect(page).toContain('remote-browser__stage--working')
    expect(page).toContain('browser.agentWorking')
  })

  it('stops the moment the person touches the screen', () => {
    /*
     * From the first touch THEY are driving. A glow that kept claiming an
     * agent was working would be the screen telling them something false.
     */
    /*
     * The touch goes through the tested decision now, not a literal false --
     * so the check follows it there rather than pinning the old spelling.
     */
    expect(page).toContain('onPointerDown')
    expect(page).toContain('onKeyDownCapture')
    expect(page).toContain('wheelAfterTouch()')
  })

  it('frames the picture instead of covering it', () => {
    /* The point of the screen is seeing every pixel the agent touches. */
    const css = readFileSync(join(__dirname, 'Browser.css'), 'utf8')
    expect(css).toContain('.remote-browser__stage--working')
    expect(css).not.toMatch(/\.remote-browser__frame\s*{[^}]*opacity/)
  })

  it('respects a request for less motion', () => {
    const css = readFileSync(join(__dirname, 'Browser.css'), 'utf8')
    const reduced = css.slice(css.indexOf('prefers-reduced-motion'))
    expect(reduced).toContain('animation: none')
  })
})

describe('the person can tell who is driving, and take the wheel back', () => {
  it('says whose hands are on it either way', () => {
    /* "An agent is working" with no opposite state leaves the person
     * guessing whether their touch did anything. */
    expect(page).toContain('browser.agentWorking')
    expect(page).toContain('browser.youDrive')
  })

  it('hands the wheel back only on a press, never on a timer', () => {
    expect(page).toContain('wheelAfterHandBack()')
    expect(page).toContain('browser.handBack')
    expect(page).not.toMatch(/setTimeout\([^)]*setAgentWorking/)
  })

  it('offers full screen, because a phone in portrait shows a stamp', () => {
    expect(page).toContain('requestFullscreen')
    expect(page).toContain('browser.fullscreen')
  })
})

describe('a browser that went out while nobody watched', () => {
  it('explains itself instead of looking like a logout', () => {
    expect(page).toContain('wentOut(')
    expect(page).toContain('browser.wentOut')
    for (const promise of ['logins are still there', 'входы на месте']) {
      expect(dict).toContain(promise)
    }
  })
})
