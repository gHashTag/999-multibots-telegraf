/**
 * Админы платформы. Список telegram_id. Настраивается сборкой:
 *   VITE_ADMIN_IDS="144022504,987654321"
 * По умолчанию — владелец (@t27_dev, 144022504).
 *
 * ВАЖНО ПРО ДОВЕРИЕ. Эта проверка КЛИЕНТСКАЯ и служит только для UX (показать
 * админу dev-режим, скрыть его от платящих юзеров). Настоящие привилегии
 * (бесплатная генерация, служебные действия) сервер проверяет сам по
 * ПОДТВЕРЖДЁННОЙ подписи initData — клиенту тут верить нельзя.
 */
import { getTelegramUser } from '../lib/telegram'

export const ADMIN_IDS: string[] = (
  (import.meta.env.VITE_ADMIN_IDS as string | undefined) || '144022504'
)
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)

/** Текущий пользователь — админ? (по launch-user из Telegram). */
export function isAdmin(): boolean {
  try {
    const u = getTelegramUser()
    return !!u && ADMIN_IDS.includes(String(u.id))
  } catch {
    return false
  }
}
