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
export const MINI_APP_URL =
  process.env.VIBEE_EDITOR_URL ||
  'https://vibee-editor-production.up.railway.app'

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
 * The mini app opens on a start route and moves on to /feed by itself.
 * startParam must be a key of START_PARAM_ROUTES in
 * apps/vibee-editor/player/src/components/Telegram/TelegramProvider.tsx --
 * the table is the only list; an unknown value silently lands on the feed.
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
