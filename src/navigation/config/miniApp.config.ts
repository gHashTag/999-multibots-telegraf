/**
 * 🎬 КОНФИГУРАЦИЯ TELEGRAM MINI APP (VIBEE видеоредактор)
 *
 * The mini app is served from the owner's VPS: https://app.t27.ai/
 * (Caddy fronts the player SPA; deploy notes:
 * apps/vibee-editor/render/deploy/vps). Sources: apps/vibee-editor.
 */

import { Markup } from 'telegraf'
import type { KeyboardButton } from 'telegraf/types'

/**
 * The mini app URL: the target of the chat-menu button and every web_app
 * door. Overridable via VIBEE_EDITOR_URL to point at staging or another
 * domain without a rebuild.
 */
export const MINI_APP_URL =
  process.env.VIBEE_EDITOR_URL || 'https://app.t27.ai/'

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
  // MINI_APP_URL may end with a slash (the production default does); strip
  // trailing slashes before joining so the deeplink never carries '//?'.
  if (!startParam) return MINI_APP_URL
  const base = MINI_APP_URL.replace(/\/+$/, '')
  return `${base}/?tgWebAppStartParam=${encodeURIComponent(startParam)}`
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
