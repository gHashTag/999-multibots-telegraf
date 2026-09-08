import { useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { getWebApp, isTelegram, isVersionAtLeast } from '@/lib/telegram'

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

function applyViewport(wa: TelegramWebApp) {
  // viewportStableHeight excludes the transient keyboard/expanding area, so it
  // is the right basis for fixed chrome like a bottom tab bar. viewportHeight
  // is the live value, used for scrollable content.
  // A missing height (dev mock, a desktop client before its first viewport
  // event) used to become the literal 'undefinedpx' and invalidate every
  // calc() built on this variable; the CSS default (100dvh) must survive.
  if (Number.isFinite(wa.viewportHeight))
    setVar('--app-vh', `${wa.viewportHeight}px`)
  // A missing height (dev mock, a desktop client before its first viewport
  // event) used to become the literal 'undefinedpx' and invalidate every
  // calc() built on this variable; the CSS default (100dvh) must survive.
  if (Number.isFinite(wa.viewportStableHeight))
    setVar('--app-vh-stable', `${wa.viewportStableHeight}px`)
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
    const onSafeAreaChanged = () => applySafeArea(wa)

    wa.onEvent('viewportChanged', onViewportChanged)
    wa.onEvent('themeChanged', onThemeChanged)
    wa.onEvent('safeAreaChanged', onSafeAreaChanged)
    wa.onEvent('contentSafeAreaChanged', onSafeAreaChanged)

    // The reported viewport is stale for ~300-600ms after launch on iOS and
    // there is no resize event to hang this off, so re-read once settled.
    const settle = window.setTimeout(onViewportChanged, 600)

    return () => {
      window.clearTimeout(settle)
      wa.offEvent('viewportChanged', onViewportChanged)
      wa.offEvent('themeChanged', onThemeChanged)
      wa.offEvent('safeAreaChanged', onSafeAreaChanged)
      wa.offEvent('contentSafeAreaChanged', onSafeAreaChanged)
      document.documentElement.removeAttribute('data-tg')
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
