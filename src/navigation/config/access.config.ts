/**
 * 🔐 ПРАВА ДОСТУПА
 *
 * Конфигурация прав доступа для разных ботов и функций.
 */

import { getBotNameByToken } from '@/core/bot'

/**
 * Сотрудники HaimGroupMedia_bot
 */
export const HAIM_GROUP_STAFF_IDS = [
  '144022504', // @neuro_coder - Главный админ
  '289259562', // @Vyacheslav_Neklyudov
  '752224685', // @voskresenskaya13
  '7669741878', // @Arhustel
  '1036512726', // Сотрудник
]

/**
 * Сотрудники MetaMuse_Manifest_bot
 */
export const METAMUSE_STAFF_IDS = [
  '144022504', // @neuro_coder
  '352374518',
  '1064902106',
  '737300586',
  '447979523',
]

/**
 * Главный админ (имеет доступ ко всем ботам)
 */
export const SUPER_ADMIN_ID = '144022504'

/**
 * Результат проверки доступа к парсингу
 */
export interface ParsingAccessResult {
  hasAccess: boolean
  allowedProjects?: string[]
}

/**
 * Проверяет доступ к парсингу для конкретного бота
 */
export function getParsingAccess(
  userId: string,
  botToken: string
): ParsingAccessResult {
  const { bot_name } = getBotNameByToken(botToken)

  // 👑 Главный админ имеет доступ ко всем ботам
  if (userId === SUPER_ADMIN_ID) {
    return {
      hasAccess: true,
      allowedProjects: ['all'],
    }
  }

  // 🤖 HaimGroupMedia_bot
  if (bot_name === 'HaimGroupMedia_bot') {
    const hasAccess = HAIM_GROUP_STAFF_IDS.includes(userId)
    return {
      hasAccess,
      allowedProjects: hasAccess
        ? ['Coco Age', 'vyacheslav_nekludov']
        : undefined,
    }
  }

  // 🤖 MetaMuse_Manifest_bot
  if (bot_name === 'MetaMuse_Manifest_bot') {
    const hasAccess = METAMUSE_STAFF_IDS.includes(userId)
    return {
      hasAccess,
      allowedProjects: hasAccess ? ['all'] : undefined,
    }
  }

  // 🚫 Остальные боты - нет доступа
  return {
    hasAccess: false,
  }
}

/**
 * Проверяет, является ли пользователь админом
 */
export function isAdmin(userId: string | number): boolean {
  const id = userId.toString()
  return (
    id === SUPER_ADMIN_ID ||
    HAIM_GROUP_STAFF_IDS.includes(id) ||
    METAMUSE_STAFF_IDS.includes(id)
  )
}

/**
 * Проверяет, является ли пользователь супер-админом
 */
export function isSuperAdmin(userId: string | number): boolean {
  return userId.toString() === SUPER_ADMIN_ID
}
