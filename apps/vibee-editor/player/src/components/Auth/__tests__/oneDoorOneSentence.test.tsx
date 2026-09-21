import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { Provider, createStore } from 'jotai'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

/**
 * ONE MODAL, SEVEN DOORS, ONE SENTENCE FOR EACH.
 *
 * The timeline's export, the generate panel, two follow buttons, the framed
 * board, the return from the board's sign-in chip and the header all open the
 * same component. It used to greet every one of them with "Login to Export"
 * over a promise of three free video renders -- true at exactly one of those
 * doors. Somebody who pressed "Sign in" on their clients board was told to log
 * in to export a video.
 *
 * These cases pin the part that is easy to regress: a door added later that
 * forgets to say which door it is inherits the previous one's sentence.
 */

const embed = vi.hoisted(() => ({ on: false }))

vi.mock('@/lib/embed', () => ({
  get IS_EMBED() {
    return embed.on
  },
  embedLang: () => null,
  parentOrigin: () => null,
  widgetFrameAllowed: () => true,
  postToParent: () => {},
  APP_ORIGIN: 'https://app.t27.ai',
}))

// The real button injects telegram-widget.js, which jsdom cannot load.
vi.mock('@/components/Auth/TelegramLoginButton', () => ({
  TelegramLoginButton: () => <div className="tg-widget-stub" />,
  UserAvatar: () => <div className="user-avatar-stub" />,
}))

import { closeLoginAtom, loginReasonAtom, openLoginAtom } from '@/atoms'
import { languageAtom } from '@/atoms/language'
import { LoginModal } from './../LoginModal'

let host: HTMLDivElement
let root: Root | null = null

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
})

afterEach(() => {
  act(() => root?.unmount())
  root = null
  host.remove()
})

/** Open the modal through the door a real caller would use. */
function openedBy(reason: string | null, lang: 'en' | 'ru' = 'en') {
  const store = createStore()
  store.set(languageAtom, lang)
  store.set(openLoginAtom, reason as never)
  root = createRoot(host)
  act(() => {
    root!.render(
      <Provider store={store}>
        <LoginModal />
      </Provider>
    )
  })
  return store
}

const title = () => host.querySelector('h2')!.textContent ?? ''
const body = () => host.querySelector('p')!.textContent ?? ''

describe('the modal answers the door that opened it', () => {
  it('the board never mentions exporting or free renders', () => {
    openedBy('board')
    expect(title().toLowerCase()).not.toMatch(/export/)
    expect(body().toLowerCase()).not.toMatch(/export|render/)
    // And it does say what it is for.
    expect(body().toLowerCase()).toMatch(/board/)
  })

  it('export and generate both name the renders they spend', () => {
    openedBy('export')
    expect(title().toLowerCase()).toMatch(/export/)
    const exportBody = body()
    expect(exportBody.toLowerCase()).toMatch(/render/)

    act(() => root!.unmount())
    root = null
    host.innerHTML = ''

    openedBy('generate')
    expect(title().toLowerCase()).toMatch(/generate/)
    // One key for two doors: they draw on the same server quota, and two
    // copies of one promise are how the promise and the quota drift apart.
    expect(body()).toBe(exportBody)
  })

  it('follow talks about following', () => {
    openedBy('follow')
    expect(title().toLowerCase()).toMatch(/follow/)
    expect(body().toLowerCase()).toMatch(/follow/)
    expect(body().toLowerCase()).not.toMatch(/render|export/)
  })

  it('no reason promises nothing in particular', () => {
    openedBy(null)
    // The general case has to stay true at every door, including ones not
    // written yet, so it offers no renders and no board.
    expect(body().toLowerCase()).not.toMatch(/render|export|follow/)
    expect(title().length).toBeGreaterThan(0)
  })

  it('every branch renders words, never a raw key', () => {
    for (const reason of ['export', 'generate', 'follow', 'board', null]) {
      openedBy(reason)
      expect(host.textContent).not.toMatch(/login\.[a-zA-Z]/)
      act(() => root!.unmount())
      root = null
      host.innerHTML = ''
    }
  })

  it('both locales answer, and not with the same string', () => {
    openedBy('board', 'en')
    const en = title()
    act(() => root!.unmount())
    root = null
    host.innerHTML = ''
    openedBy('board', 'ru')
    expect(title()).not.toBe(en)
    expect(host.textContent).not.toMatch(/login\.[a-zA-Z]/)
  })

  it('closing clears the reason, so the next door cannot inherit it', () => {
    const store = openedBy('export')
    act(() => store.set(closeLoginAtom))
    expect(store.get(loginReasonAtom)).toBeNull()
  })

  it('the close button is reachable: 44px and a focus ring', () => {
    openedBy('board')
    const close = host.querySelector('.login-modal-close')
    expect(close).not.toBeNull()
    // Inside Telegram the overlay is the whole screen and this button is the
    // only way out, so its size and its focus ring are not decoration.
    const css = fs.readFileSync(
      path.resolve(__dirname, '../styles.css'),
      'utf8'
    )
    const rule = css.slice(css.indexOf('.login-modal-close {'))
    expect(rule).toMatch(/var\(--touch-target, 44px\)/)
    expect(css).toMatch(/\.login-modal-close:focus-visible/)
  })
})

describe('the wiring that keeps the sentence honest', () => {
  const SRC = path.resolve(__dirname, '../../..')

  /** Every .ts/.tsx file under src/, except the atoms that define the door. */
  function sources(): string[] {
    const out: string[] = []
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) {
          if (e.name !== 'node_modules') walk(p)
        } else if (/\.tsx?$/.test(e.name)) {
          out.push(p)
        }
      }
    }
    walk(SRC)
    return out
  }

  it('no component opens the modal without naming its door', () => {
    const offenders = sources()
      .filter(
        p =>
          !p.includes(`${path.sep}atoms${path.sep}`) &&
          !/\.test\.tsx?$/.test(p) &&
          !p.includes(`${path.sep}__tests__${path.sep}`)
      )
      .filter(p => {
        const s = fs.readFileSync(p, 'utf8')
        // Reading it is fine -- the modal itself does. Writing it outside the
        // single writer is what leaves the reason stale.
        return /useSetAtom\(\s*showLoginModalAtom\s*\)/.test(s)
      })
      .map(p => path.relative(SRC, p))
    expect(offenders).toEqual([])
  })

  it('the modal carries its own stylesheet', () => {
    // It was imported by Hive and PaywallModal and by nothing else, so on
    // Feed, Editor, Profile and Search the modal was styled only by a
    // hand-copied duplicate in Header/styles.css. The duplicate is gone.
    const modal = fs.readFileSync(
      path.resolve(__dirname, '../LoginModal.tsx'),
      'utf8'
    )
    expect(modal).toMatch(/import '\.\/styles\.css'/)

    const header = fs.readFileSync(
      path.resolve(SRC, 'components/Header/styles.css'),
      'utf8'
    )
    expect(header).not.toMatch(/^\.login-modal\s*\{/m)
  })

  it('the card is positioned, sized and inset like the site says', () => {
    const css = fs.readFileSync(
      path.resolve(__dirname, '../styles.css'),
      'utf8'
    )
    const card = css.slice(
      css.indexOf('.login-modal {'),
      css.indexOf('.login-modal h2')
    )
    // Without this the absolutely-positioned close button lands in the
    // window's corner instead of the card's.
    expect(card).toMatch(/position:\s*relative/)
    // The site's own sign-in card (website ClientsConsole.tsx).
    expect(card).toMatch(/background:\s*#0b0d0c/)
    expect(card).toMatch(/border-radius:\s*6px/)

    // The login block only, and without its comments: the paywall below it
    // may legitimately use env(), and the comment that explains why the login
    // rules do not is the very string being searched for.
    const login = css
      .slice(css.indexOf('.login-modal-overlay'), css.indexOf('.quota-display'))
      .replace(/\/\*[\s\S]*?\*\//g, '')
    // env(safe-area-inset-*) resolves to 0 inside the Telegram WebView, so a
    // fallback written against it never applies. The app measures its own.
    expect(login).not.toMatch(/env\(safe-area-inset/)
    // 100vh is the wrong height under a collapsing Telegram header.
    expect(login).not.toMatch(/100vh/)
    expect(login).toMatch(/--app-vh-stable/)
  })

  it('the native Telegram widget is given the card radius', () => {
    // On app.t27.ai this iframe, not our own button, is what renders, and
    // data-radius is the only styling lever it accepts.
    const btn = fs.readFileSync(
      path.resolve(__dirname, '../TelegramLoginButton.tsx'),
      'utf8'
    )
    expect(btn).toMatch(/setAttribute\('data-radius', '6'\)/)
  })
})
