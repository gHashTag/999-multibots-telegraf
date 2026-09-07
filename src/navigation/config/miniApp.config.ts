/**
 * 🎬 КОНФИГУРАЦИЯ TELEGRAM MINI APP (VIBEE видеоредактор)
 *
 * Мини-апп задеплоен как сервис `vibee-editor` в Railway-проекте 999.
 * Исходники: apps/vibee-editor.
 */

import { Markup } from 'telegraf'
import type { KeyboardButton } from 'telegraf/types'

/**
 * URL мини-аппа. Переопределяется через VIBEE_EDITOR_URL,
 * чтобы можно было указать staging или кастомный домен без пересборки.
 */
const DEFAULT_MINI_APP_URL = 'https://app.t27.ai'

function configuredMiniAppUrl(): string {
  try {
    const url = new URL(process.env.VIBEE_EDITOR_URL || DEFAULT_MINI_APP_URL)
    if (url.protocol === 'https:' && !url.username && !url.password)
      return url.origin
  } catch {
    // A malformed deployment override must not turn app buttons into dead ends.
  }
  return DEFAULT_MINI_APP_URL
}

export const MINI_APP_URL = configuredMiniAppUrl()

export const MINI_APP_BUTTON = {
  id: 'videoEditor',
  ru: '🎬 Видеоредактор',
  en: '🎬 Video editor',
} as const

/**
 * Telegram отклоняет web_app-кнопки в reply-клавиатуре вне приватных чатов
 * (BUTTON_TYPE_INVALID), поэтому кнопку показываем только в личке.
 */
export function canShowMiniAppButton(chatType?: string): boolean {
  return chatType === 'private'
}

/**
 * Мини-апп открывается по стартовому маршруту и сам уводит на /feed.
 * startParam соответствует таблице START_PARAM_ROUTES в
 * apps/vibee-editor/player/src/components/Telegram/TelegramProvider.tsx —
 * значения: feed, search, learn, editor, create, avatar, video, image,
 * audio, profile.
 */
export function buildMiniAppUrl(startParam?: string): string {
  if (!startParam) return MINI_APP_URL
  return `${MINI_APP_URL}/?tgWebAppStartParam=${encodeURIComponent(startParam)}`
}

/**
 * Кнопка запуска мини-аппа для reply-клавиатуры.
 */
export function createMiniAppButton(
  isRu: boolean,
  startParam?: string
): KeyboardButton {
  return Markup.button.webApp(
    isRu ? MINI_APP_BUTTON.ru : MINI_APP_BUTTON.en,
    buildMiniAppUrl(startParam)
  )
}
