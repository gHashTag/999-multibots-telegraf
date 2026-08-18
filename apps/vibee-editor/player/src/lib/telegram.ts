// ===============================
// Telegram Mini App — framework-free accessors
//
// Importable from Jotai atoms, plain modules and tests. Every function is a
// no-op outside Telegram, because this same bundle is also served on the open
// web (vibee-editor.up.railway.app and the marketing landing).
// ===============================

/** The raw WebApp object, or null when not running inside Telegram. */
export function getWebApp(): TelegramWebApp | null {
  if (typeof window === 'undefined') return null;
  return window.Telegram?.WebApp ?? null;
}

/**
 * True only inside a real Mini App launch.
 *
 * telegram-web-app.js defines window.Telegram.WebApp even in a plain browser,
 * so the object's presence proves nothing. initData is non-empty only when
 * Telegram actually launched the app, which is the honest signal.
 */
export function isTelegram(): boolean {
  const wa = getWebApp();
  if (!wa) return false;
  return typeof wa.initData === 'string' && wa.initData.length > 0;
}

/** Compare against WebApp.version — features are gated per Bot API version. */
export function isVersionAtLeast(version: string): boolean {
  const wa = getWebApp();
  if (!wa) return false;
  try {
    return wa.isVersionAtLeast(version);
  } catch {
    return false;
  }
}

/** The launch user, when Telegram supplied one. Never trust this for auth — */
/** initData must be verified server-side against the bot token first. */
export function getTelegramUser(): TelegramWebAppUser | null {
  return getWebApp()?.initDataUnsafe?.user ?? null;
}

/** Raw initData string, to be sent to the backend for HMAC verification. */
export function getInitData(): string {
  return getWebApp()?.initData ?? '';
}

/**
 * Haptics. Falls back to navigator.vibrate on the open web, and to nothing
 * where neither exists (desktop browsers, iOS Safari).
 */
export const haptic = {
  selection(): void {
    const wa = getWebApp();
    if (wa?.HapticFeedback) {
      try {
        wa.HapticFeedback.selectionChanged();
        return;
      } catch {
        /* fall through to the web path */
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },

  impact(style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'light'): void {
    const wa = getWebApp();
    if (wa?.HapticFeedback) {
      try {
        wa.HapticFeedback.impactOccurred(style);
        return;
      } catch {
        /* fall through */
      }
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(10);
    }
  },

  notification(type: 'error' | 'success' | 'warning'): void {
    const wa = getWebApp();
    try {
      wa?.HapticFeedback?.notificationOccurred(type);
    } catch {
      /* no-op */
    }
  },
};
