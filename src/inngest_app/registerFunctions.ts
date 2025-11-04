/**
 * Register All Inngest Functions - заглушка для ботов
 *
 * Centralized registration for all migrated functions from ai-server
 * Для ботов эти функции НЕ ИСПОЛЬЗУЮТСЯ
 */

import { logger } from '@/utils/logger'

// Заглушки для совместимости - боты не используют inngest функции
export const allInngestFunctions: any[] = []

export const inngest = {
  createFunction: () => ({}),
  run: () => Promise.resolve({}),
  send: () => Promise.resolve({}),
}
