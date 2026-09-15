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
