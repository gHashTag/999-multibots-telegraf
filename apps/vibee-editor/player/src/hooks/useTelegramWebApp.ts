import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getWebApp, isTelegram, isVersionAtLeast } from '@/lib/telegram'
import {
  CHROME_COLOR,
  appBox,
  shouldRequestFullscreen,
  viewportVars,
} from '@/lib/telegramFullscreen'

// ===============================
// Telegram Mini App runtime wiring.
//
// Publishes viewport height and safe-area insets as --app-* CSS custom
// properties, wires the native BackButton to react-router, and keeps the app
// from being dismissed by stray vertical swipes.
//
// Namespace note: this writes --app-*, never --tg-*. telegram-web-app.js owns
// the --tg-* namespace and overwrites it on every viewportChanged event, so
// values written there silently revert.
// ===============================

/** Routes with nothing to go "back" to — the BackButton stays hidden. */
const ROOT_ROUTES = new Set(['/', '/feed'])

function setVar(name: string, value: string) {
  document.documentElement.style.setProperty(name, value)
}

/**
 * Keyboard = the live viewport is much shorter than the stable one. Telegram
 * reports viewportHeight (shrinks under the keyboard on iOS) and
 * viewportStableHeight (does not). Below the threshold the difference is a
 * toolbar or a rounding, not a keyboard. Pages that must stay usable while
 * typing (the agent chat) switch to the live height and the tab bar hides
 * -- a bottom tab bar under a keyboard only steals the composer's space.
 */
const KEYBOARD_THRESHOLD_PX = 120

export function keyboardIsOpen(live: unknown, stable: unknown): boolean {
  return (
    typeof live === 'number' &&
    typeof stable === 'number' &&
    Number.isFinite(live) &&
    Number.isFinite(stable) &&
    live < stable - KEYBOARD_THRESHOLD_PX
  )
}

function applyKeyboard(open: boolean) {
  document.documentElement.setAttribute(
    'data-keyboard',
    open ? 'open' : 'closed'
  )
}

function applyViewport(wa: TelegramWebApp) {
  // The keyboard is judged on Telegram's raw numbers: both heights lose the
  // same top inset in fullscreen, so their difference is unchanged either way.
  applyKeyboard(keyboardIsOpen(wa.viewportHeight, wa.viewportStableHeight))
  /*
   * In fullscreen the viewport is the whole screen, status bar included, and
   * the app's own box starts below Telegram's buttons. `appBox` shortens the
   * heights by that inset ONCE, here, so every layout built on --app-vh* stays
   * right; styles/telegram.css moves the box down by --app-top-inset.
   */
  const box = appBox(wa)
  document.documentElement.setAttribute(
    'data-tg-fullscreen',
    box.fullscreen ? '1' : '0'
  )
  // A height Telegram has not reported yet is simply not in the list, so the
  // CSS default (100dvh) survives instead of becoming 'undefinedpx'.
  for (const [name, value] of Object.entries(viewportVars(wa))) {
    setVar(name, value)
  }
}

/**
 * Paint what Telegram draws AROUND the WebView in the app's own black.
 *
 * Left alone, the client uses its theme colour: on a light-themed phone that
 * is a white header over a black interface (the owner's photo, 2026-09-17).
 * Each call is version-gated and guarded -- an old client throws on a method
 * it does not know, and a cosmetic call must never break the launch.
 */
function paintChrome(wa: TelegramWebApp) {
  try {
    if (isVersionAtLeast('6.1')) {
      wa.setHeaderColor(CHROME_COLOR)
      wa.setBackgroundColor(CHROME_COLOR)
    }
    if (isVersionAtLeast('7.10')) wa.setBottomBarColor?.(CHROME_COLOR)
  } catch {
    // Cosmetic. The app works under a header of the wrong colour.
  }
}

function applySafeArea(wa: TelegramWebApp) {
  // Bot API 8.0+. On older clients these are undefined and the CSS defaults in
  // styles/telegram.css (which use env(safe-area-inset-*)) stay in force.
  const safe = wa.safeAreaInset
  const content = wa.contentSafeAreaInset

  if (safe) {
    setVar('--app-safe-top', `${safe.top}px`)
    setVar('--app-safe-bottom', `${safe.bottom}px`)
    setVar('--app-safe-left', `${safe.left}px`)
    setVar('--app-safe-right', `${safe.right}px`)
  }
  if (content) {
    setVar('--app-content-safe-top', `${content.top}px`)
    setVar('--app-content-safe-bottom', `${content.bottom}px`)
  }
}

function applyTheme(wa: TelegramWebApp) {
  const p = wa.themeParams || {}
  // Exposed for opt-in use. The app's palette is deliberately dark and
  // hand-authored (index.css), so these are NOT wired into the base theme —
  // doing so would fight the existing --vibee-* variables and the Tamagui theme.
  if (p.bg_color) setVar('--app-tg-bg', p.bg_color)
  if (p.text_color) setVar('--app-tg-text', p.text_color)
  if (p.button_color) setVar('--app-tg-button', p.button_color)
  if (p.button_text_color) setVar('--app-tg-button-text', p.button_text_color)
  if (p.secondary_bg_color)
    setVar('--app-tg-secondary-bg', p.secondary_bg_color)
}

export function useTelegramWebApp() {
  const navigate = useNavigate()
  const location = useLocation()

  // Kept in a ref so the BackButton handler registered once below always sees
  // the current path without needing to be re-registered on every navigation.
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname

  const inTelegram = isTelegram()

  // ---- one-time init ----
  useEffect(() => {
    const wa = getWebApp()
    if (!wa || !inTelegram) return

    // Marks the DOM so CSS can branch on "running inside Telegram".
    document.documentElement.setAttribute('data-tg', '1')
    document.documentElement.setAttribute(
      'data-tg-platform',
      wa.platform || 'unknown'
    )

    wa.ready()
    wa.expand()
    paintChrome(wa)

    /*
     * THE WHOLE SCREEN, ON PHONES.
     *
     * `expand()` stops at a full-height sheet: rounded corners, the chat
     * visible above, Telegram's header on top. The owner asked for the whole
     * screen, which is this call (Bot API 8.0). It is asked from here rather
     * than left to BotFather's launch mode because the app is opened five
     * ways -- menu button, inline button, reply keyboard, direct link, the
     * TRI tab -- and that setting covers one of them.
     *
     * A refusal is not an error: the client answers `fullscreenFailed` and the
     * app stays a sheet, exactly as before.
     */
    if (shouldRequestFullscreen(wa)) {
      try {
        wa.requestFullscreen?.()
      } catch {
        // Stays a sheet.
      }
    }

    // A downward drag anywhere minimises the Mini App on iOS/Android. This app
    // has a vertically-swiped feed and a vertically-dragged timeline, both of
    // which would otherwise eject the user mid-gesture. Bot API 7.7+.
    if (isVersionAtLeast('7.7')) {
      wa.disableVerticalSwipes?.()
    }

    applyViewport(wa)
    applySafeArea(wa)
    applyTheme(wa)

    const onViewportChanged = () => {
      applyViewport(wa)
      applySafeArea(wa)
    }
    const onThemeChanged = () => applyTheme(wa)

    wa.onEvent('viewportChanged', onViewportChanged)
    wa.onEvent('themeChanged', onThemeChanged)
    // The insets are part of the app's box in fullscreen, so a change in them
    // is a change of viewport, not only of padding.
    wa.onEvent('safeAreaChanged', onViewportChanged)
    wa.onEvent('contentSafeAreaChanged', onViewportChanged)
    // Entering and leaving fullscreen: by our request, or by the person using
    // the client's own menu. Either way the box has just changed.
    wa.onEvent('fullscreenChanged', onViewportChanged)

    // The reported viewport is stale for ~300-600ms after launch on iOS and
    // there is no resize event to hang this off, so re-read once settled.
    const settle = window.setTimeout(onViewportChanged, 600)

    return () => {
      window.clearTimeout(settle)
      wa.offEvent('viewportChanged', onViewportChanged)
      wa.offEvent('themeChanged', onThemeChanged)
      wa.offEvent('safeAreaChanged', onViewportChanged)
      wa.offEvent('contentSafeAreaChanged', onViewportChanged)
      wa.offEvent('fullscreenChanged', onViewportChanged)
      document.documentElement.removeAttribute('data-tg')
      document.documentElement.removeAttribute('data-tg-fullscreen')
      document.documentElement.removeAttribute('data-tg-platform')
    }
  }, [inTelegram])

  // ---- BackButton ----
  useEffect(() => {
    const wa = getWebApp()
    if (!wa || !inTelegram) return

    const handler = () => {
      if (ROOT_ROUTES.has(pathRef.current)) return
      navigate(-1)
    }

    // onClick is additive and React 19 StrictMode double-invokes effects, so
    // the paired offClick in cleanup is required — without it one tap pops two
    // history entries and back appears to "skip a screen".
    wa.BackButton.onClick(handler)
    return () => wa.BackButton.offClick(handler)
  }, [inTelegram, navigate])

  // ---- BackButton visibility follows the route ----
  useEffect(() => {
    const wa = getWebApp()
    if (!wa || !inTelegram) return

    if (ROOT_ROUTES.has(location.pathname)) {
      wa.BackButton.hide()
    } else {
      wa.BackButton.show()
    }
  }, [inTelegram, location.pathname])

  return { isTelegram: inTelegram }
}
