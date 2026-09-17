// ===============================
// Telegram Mini App — framework-free accessors
//
// Importable from Jotai atoms, plain modules and tests. Every function is a
// no-op outside Telegram, because this same bundle is also served on the open
// web (vibee-editor.up.railway.app and the marketing landing).
// ===============================

import { sessionTrustedIn, type FramedWindow } from './framedSession'

/** The raw WebApp object, or null when not running inside Telegram. */
export function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null
  return window.Telegram?.WebApp ?? null
}

/**
 * True inside a real Mini App launch, by ANY launch method.
 *
 * Deliberately NOT keyed on initData. Telegram's docs are explicit that
 * initData "is empty if the Mini App was launched from a keyboard button or
 * from inline mode" — and the bot currently launches it from a reply-keyboard
 * button, so an initData check reports false inside Telegram and the whole
 * runtime (viewport, safe area, BackButton, swipe lock) silently never engages.
 *
 * telegram-web-app.js defines window.Telegram.WebApp in a plain browser too,
 * but leaves platform as 'unknown' there; Telegram sets a real platform and
 * appends #tgWebApp* to the launch URL. Either is a sound signal.
 */
export function isTelegram(): boolean {
  const wa = getWebApp()
  if (!wa) return false
  if (wa.platform && wa.platform !== 'unknown') return true
  if (typeof wa.initData === 'string' && wa.initData.length > 0) return true
  return (
    typeof window !== 'undefined' && window.location.hash.includes('tgWebApp')
  )
}

/**
 * THE START PARAMETER OF THIS LAUNCH -- FROM THE URL TOO, NOT ONLY FROM
 * TELEGRAM'S OWN FIELD.
 *
 * `initDataUnsafe.start_param` is filled by Telegram ONLY for a launch from a
 * direct link (`t.me/bot/app?startapp=x`) or from the attachment menu
 * (`?startattach=x`). Telegram's docs say exactly that, and
 * telegram-web-app.js builds `initDataUnsafe` from the signed `#tgWebAppData`
 * fragment alone -- the string `tgWebAppStartParam` does not occur in that file
 * at all. The direction is Telegram -> app; writing the parameter into a URL
 * ourselves does not make Telegram hand it back.
 *
 * Every door the bot opens is a `web_app` button, and its URL is built as
 * `…/?tgWebAppStartParam=pair` (src/navigation/config/miniApp.config.ts). So
 * the value arrives in the QUERY STRING while `start_param` stays undefined,
 * and the route table in TelegramProvider matched NOTHING -- for `/app`
 * sign-in, for the hive, the agent and the club doors in the /start greeting,
 * for every button that names a screen.
 *
 * Measured in production on 2026-09-18: `app_pairing_codes` holds 17 codes
 * ever minted and every single one belongs to one telegram_id -- the owner's,
 * who reaches the card by tapping the tab by hand. Two people onboarded on
 * 16-17 September, sent to `/app` and promised "a window with your code",
 * produced no row at all.
 *
 * SNAPSHOT AT MODULE LOAD, for the same reason as LAUNCH_PATH in
 * TelegramProvider: `<Navigate>` rewrites "/" to the feed or the remembered
 * screen, and that rewrite DROPS the query string. By the time an effect looks
 * at `window.location`, the parameter is gone.
 */
function readLaunchStartParam(): string | null {
  if (typeof window === 'undefined') return null
  const fromQuery = new URLSearchParams(window.location.search).get(
    'tgWebAppStartParam'
  )
  if (fromQuery) return fromQuery
  /*
   * Telegram appends its launch data as a #fragment, and the docs promise the
   * value "in the GET-parameter tgWebAppStartParam" without saying which half
   * of the URL carries it. Reading both costs one line and removes the guess.
   */
  const hash = window.location.hash.replace(/^#/, '')
  return new URLSearchParams(hash).get('tgWebAppStartParam')
}

const LAUNCH_START_PARAM = readLaunchStartParam()

/**
 * Telegram's own field first -- it is the one Telegram itself signed; the URL
 * is the fallback for launches where Telegram never fills it.
 *
 * Read by TelegramProvider (where to send the person) and by LaunchRedirect
 * (a named screen outranks the remembered one). One accessor, because two
 * copies of this decision already existed and both read the dead field.
 *
 * Not a trust boundary: the value is only ever matched against a fixed route
 * map, so the most a hand-written parameter can do is open a screen whose
 * address the person could have typed anyway.
 */
export function launchStartParam(): string | null {
  return getWebApp()?.initDataUnsafe?.start_param || LAUNCH_START_PARAM
}

/**
 * True only when Telegram supplied SIGNED launch data.
 *
 * This is the gate for anything that needs a verified user server-side.
 * A reply-keyboard launch is inside Telegram (isTelegram() === true) but
 * carries no hash, so it cannot be verified and must not be treated as
 * authenticated. Use an inline button, the chat menu button, or a
 * t.me/<bot>/<app> link when signed data is required.
 */
export function hasVerifiableInitData(): boolean {
  const wa = getWebApp()
  return !!wa && typeof wa.initData === 'string' && wa.initData.length > 0
}

/** Compare against WebApp.version — features are gated per Bot API version. */
export function isVersionAtLeast(version: string): boolean {
  const wa = getWebApp()
  if (!wa) return false
  try {
    return wa.isVersionAtLeast(version)
  } catch {
    return false
  }
}

/** The launch user, when Telegram supplied one. Never trust this for auth — */
/** initData must be verified server-side against the bot token first. */
export function getTelegramUser(): TelegramWebAppUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null
}

/**
 * WHERE TELEGRAM LAUNCH DATA MAY AUTHENTICATE: WHERE THE SESSION IS TRUSTED.
 *
 * telegram-web-app.js restores `__telegram__initParams` from the tab's
 * sessionStorage. A frame by another t27.ai page (app.t27.ai > t27.ai >
 * app.t27.ai) shares that storage, so without this rule the guest frame that
 * lib/framedSession.ts keeps out of the Bearer session was the Mini App user
 * again through initData.
 *
 * Trusted: top level, or every ancestor is this origin or *.telegram.org (the
 * same predicate as the session). Without location.ancestorOrigins (Firefox)
 * the framer is unknown: only launch data that arrived in this document's own
 * URL hash counts, never data restored from storage.
 *
 * "Arrived in the hash" is decided the way telegram-web-app.js parses it
 * (urlParseHashParams): after '#', everything up to the first '?' is a path,
 * and only the part after it holds parameters. In '#tgWebAppData=?x' the key
 * is part of the path, so the script copies the stored signed value in.
 */
export function initDataTrustedIn(
  win: FramedWindow,
  launchHash: string
): boolean {
  if (win.self === win.top) return true
  const list = win.location.ancestorOrigins
  if (!list || typeof list.length !== 'number' || list.length === 0) {
    const hash = launchHash.replace(/^#/, '')
    const q = hash.indexOf('?')
    const params = new URLSearchParams(q >= 0 ? hash.slice(q + 1) : hash)
    return !!params.get('tgWebAppData')
  }
  return sessionTrustedIn(win)
}

/** This document's launch hash, read before the router can rewrite the URL. */
const LAUNCH_HASH = (() => {
  try {
    return typeof window === 'undefined' ? '' : window.location.hash
  } catch {
    return ''
  }
})()

/** Raw initData string, to be sent to the backend for HMAC verification. */
export function getInitData(): string {
  if (typeof window === 'undefined') return ''
  if (!initDataTrustedIn(window as unknown as FramedWindow, LAUNCH_HASH)) {
    return ''
  }
  return getWebApp()?.initData ?? ''
}

/**
 * Haptics. Falls back to navigator.vibrate on the open web, and to nothing
 * where neither exists (desktop browsers, iOS Safari).
 */
export const haptic = {
  selection(): void {
    const wa = getWebApp()
    if (wa?.HapticFeedback) {
      try {
        wa.HapticFeedback.selectionChanged()
        return
      } catch {
        /* fall through to the web path */
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  },

  impact(
    style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light'
  ): void {
    const wa = getWebApp()
    if (wa?.HapticFeedback) {
      try {
        wa.HapticFeedback.impactOccurred(style)
        return
      } catch {
        /* fall through */
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10)
    }
  },

  notification(type: 'error' | 'success' | 'warning'): void {
    const wa = getWebApp()
    try {
      wa?.HapticFeedback?.notificationOccurred(type)
    } catch {
      /* no-op */
    }
  },
}

/**
 * Оплатить инвойс Telegram (в т.ч. Stars) внутри мини-аппа.
 * Резолвится статусом инвойса: 'paid' | 'cancelled' | 'failed'.
 * Вне Telegram (открытый веб) инвойс открыть нельзя — 'unsupported'.
 */
export function openInvoice(
  url: string
): Promise<'paid' | 'cancelled' | 'failed' | 'unsupported'> {
  return new Promise(resolve => {
    const wa = getWebApp()
    if (!wa?.openInvoice) {
      resolve('unsupported')
      return
    }
    try {
      wa.openInvoice(url, status => resolve(status))
    } catch {
      resolve('failed')
    }
  })
}
