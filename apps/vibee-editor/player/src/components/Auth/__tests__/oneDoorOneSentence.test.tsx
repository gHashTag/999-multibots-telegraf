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

  it('only the export door promises the free video renders', () => {
    openedBy('export')
    expect(title().toLowerCase()).toMatch(/export/)
    const exportBody = body()
    expect(exportBody.toLowerCase()).toMatch(/render/)

    act(() => root!.unmount())
    root = null
    host.innerHTML = ''

    openedBy('generate')
    expect(title().toLowerCase()).toMatch(/generate/)
    // These two shared one body on the premise that both spend the free
    // render quota. Only export does: that quota is reserved by POST /render
    // and POST /render/template, and the generate door also opens on image,
    // audio and lipsync, which hit neither. Offering "three free video
    // renders" to somebody asking for a voiceover is the same defect this
    // file exists to prevent, one door further in.
    expect(body()).not.toBe(exportBody)
    // The promise itself, in either language. Kept as strings, not a regex
    // literal: scripts/no-cyrillic-guard.cjs allows Cyrillic inside string
    // literals only, and reads it anywhere else as an untranslated comment.
    for (const promise of ['video render', 'видеорендер']) {
      expect(body().toLowerCase()).not.toContain(promise)
    }
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
    // Bounded at the closing brace. Slicing to end-of-file let any later rule
    // anywhere in the sheet satisfy the assertion: measured, shrinking this
    // button back to 32px and adding an unrelated `min-height:
    // var(--touch-target, 44px)` in a media query below kept the suite green.
    const start = css.indexOf('.login-modal-close {')
    expect(start).toBeGreaterThan(-1)
    const rule = css.slice(start, css.indexOf('}', start))
    expect(rule).toMatch(/width:\s*var\(--touch-target, 44px\)/)
    expect(rule).toMatch(/height:\s*var\(--touch-target, 44px\)/)
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

  /**
   * The file that DEFINES the door, and nothing else. `src/atoms/` as a whole
   * used to be exempt, and it is not only definitions: src/atoms/hooks.ts is a
   * file of exported React hooks that components call. Measured -- a
   * `useLoginModal()` wrapper added there, in that file's own house style,
   * opened the modal with no reason and left all twelve cases green.
   */
  const DOOR_DEFINITION = path.join(SRC, 'atoms', 'user.ts')

  it('no component opens the modal without naming its door', () => {
    const offenders = sources()
      .filter(
        p =>
          p !== DOOR_DEFINITION &&
          !/\.test\.tsx?$/.test(p) &&
          !p.includes(`${path.sep}__tests__${path.sep}`)
      )
      .filter(p => {
        const s = fs.readFileSync(p, 'utf8')
        // Reading it is fine -- the modal itself does. WRITING it outside the
        // single writer is what leaves the reason stale, and this repo spells
        // a write at least four ways. The old guard matched only
        // `useSetAtom(showLoginModalAtom)`; measured, the pre-fix opener
        // written as `const [, setShow] = useAtom(showLoginModalAtom)` -- the
        // exact defect the commit fixed, and a form already used in
        // PropertiesPanel and GestureHints -- passed it.
        return (
          /useSetAtom\(\s*showLoginModalAtom\s*\)/.test(s) ||
          /useAtom\(\s*showLoginModalAtom\s*\)/.test(s) ||
          /\.set\(\s*showLoginModalAtom\s*,/.test(s) ||
          /showLoginModalAtom\s+as\s+\w+/.test(s)
        )
      })
      .map(p => path.relative(SRC, p))
    expect(offenders).toEqual([])
  })

  it('the modal is mounted exactly once, above the routes', () => {
    // Opening it and rendering it are different powers, and they used to live
    // in different places: <ReturnToGame /> sits outside <Routes> and fires
    // openLogin('board') on any screen, while the modal was mounted by Header
    // and by Hive. /learn draws its own LearnHeader, is in RouteMemory's
    // restorable list, and mounts no Header -- so a person returning there
    // from the board's sign-in chip flipped the atom and saw nothing at all.
    const mounts = sources()
      .filter(
        p =>
          !/\.test\.tsx?$/.test(p) &&
          !p.includes(`${path.sep}__tests__${path.sep}`)
      )
      .filter(p => /<LoginModal\s*\/>/.test(fs.readFileSync(p, 'utf8')))
      .map(p => path.relative(SRC, p))
    expect(mounts).toEqual(['App.tsx'])
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
    // Any `.login-modal…` selector, at any indentation. The old assertion was
    // `/^\.login-modal\s*\{/m`: anchored at column 0, and unable to span
    // `-overlay`. The duplicate it was written against was six blocks --
    // `-overlay`, `h2`, `p` and two copies indented inside a media query --
    // so it caught one of the six. Measured: re-adding the whole @media block
    // verbatim left the suite green.
    const offending = [
      ...header.matchAll(/^[^\S\n]*(\.login-modal[\w-]*)/gm),
    ].map(m => m[1])
    expect(offending).toEqual([])
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

    // EVERY `.login-modal…` rule in the sheet, including the ones inside
    // @media blocks. The old check sliced from `.login-modal-overlay` to
    // `.quota-display` -- styles.css:324-436 -- and the media queries start at
    // 466, so it read none of them. Both banned constructs are phone
    // overrides by nature: that is where the original defect lived. Measured,
    // adding `max-height: 100vh` and an `env(safe-area-inset-top, 28px)`
    // padding inside the existing @media block left the suite green.
    const noComments = css.replace(/\/\*[\s\S]*?\*\//g, '')
    const loginRules = [
      ...noComments.matchAll(/\.login-modal[^{}]*\{([^}]*)\}/g),
    ].map(m => m[1])
    expect(loginRules.length).toBeGreaterThan(4)
    const login = loginRules.join('\n')
    // env(safe-area-inset-*) resolves to 0 inside the Telegram WebView, so a
    // fallback written against it never applies. The app measures its own.
    expect(login).not.toMatch(/env\(safe-area-inset/)
    // 100vh is the wrong height under a collapsing Telegram header.
    expect(login).not.toMatch(/100vh/)
    expect(login).toMatch(/--app-vh-stable/)
  })

  it('the card stretches its one control to the card, not to the text', () => {
    // `.telegram-login-wrapper` is a shrink-to-fit flex item, so the button's
    // `width: 100%` inside it resolved against the wrapper, not the card:
    // 167px of green in a 301px card at 375px, and narrower than the same
    // button was before `min-width: 260px` came off. Three of the modal's
    // four branches put the button directly in the widget and stretched
    // correctly -- one card, two button widths, decided by which door you
    // came through.
    const css = fs.readFileSync(
      path.resolve(__dirname, '../styles.css'),
      'utf8'
    )
    const wrapper = css.match(
      /\.login-modal \.telegram-login-wrapper\s*\{([^}]*)\}/
    )
    expect(
      wrapper,
      'the modal must size the wrapper it stretches into'
    ).not.toBeNull()
    expect(wrapper![1]).toMatch(/width:\s*100%/)
    expect(wrapper![1]).toMatch(/align-items:\s*stretch/)
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
