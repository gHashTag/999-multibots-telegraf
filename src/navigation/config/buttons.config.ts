/**
 * 🎯 ЕДИНАЯ КОНФИГУРАЦИЯ КНОПОК НАВИГАЦИИ
 *
 * Все тексты кнопок определены в одном месте.
 * Это позволяет:
 * 1. Легко менять текст кнопки везде сразу
 * 2. Не дублировать массивы вариантов текста
 * 3. Централизовать логику сопоставления кнопок
 */

import { ModeEnum } from '@/interfaces/modes'

export interface ButtonConfig {
  /** Уникальный идентификатор кнопки */
  id: string
  /** Текст на русском */
  ru: string
  /** Текст на английском */
  en: string
  /** Дополнительные варианты текста (команды, сокращения) */
  aliases: string[]
  /** Callback data для inline кнопок */
  action?: string
  /** Сцена для перехода */
  sceneId?: string
  /** Режим для установки в сессию */
  mode?: ModeEnum | string
  /** Требует выхода из текущей сцены перед переходом */
  leaveFirst?: boolean
  /** Прямой переход без CheckBalanceScene */
  directScene?: boolean
}

/**
 * Кнопки навигации (Главное меню, Назад, Отмена)
 */
export const NAVIGATION_BUTTONS: Record<string, ButtonConfig> = {
  mainMenu: {
    id: 'mainMenu',
    ru: '🏠 Главное меню',
    en: '🏠 Main menu',
    aliases: ['главное меню', 'main menu', '/menu', 'меню', 'menu'],
    action: 'go_main_menu',
    sceneId: ModeEnum.MainMenu,
    leaveFirst: true,
  },
  back: {
    id: 'back',
    ru: '◀️ Назад',
    en: '◀️ Back',
    aliases: ['назад', 'back'],
    action: 'go_back',
    leaveFirst: true,
  },
  cancel: {
    id: 'cancel',
    ru: 'Отмена',
    en: 'Cancel',
    aliases: ['отмена', 'cancel', '/cancel'],
    action: 'cancel',
    leaveFirst: true,
  },
  help: {
    id: 'help',
    ru: '❓ Справка',
    en: '❓ Help',
    aliases: ['справка', 'help', '/help'],
    action: 'go_help',
    sceneId: ModeEnum.Help,
    directScene: true,
  },
}

/**
 * Кнопки оплаты (Звездами, Рублями, Криптой)
 * Вынесено из hardcoded вариантов в registerGlobalNavigationMiddleware.ts
 */
export const PAYMENT_BUTTONS: Record<string, ButtonConfig> = {
  stars: {
    id: 'stars',
    ru: '⭐️ Звездами',
    en: '⭐️ Stars',
    aliases: ['звездами', 'stars'],
    action: 'pay_stars',
    sceneId: ModeEnum.StarPaymentScene,
  },
  rubles: {
    id: 'rubles',
    ru: '💳 Рублями',
    en: '💳 Rubles',
    aliases: ['рублями', 'rubles'],
    action: 'pay_rubles',
    sceneId: ModeEnum.RublePaymentScene,
  },
  crypto: {
    id: 'crypto',
    ru: '💎 Криптой',
    en: '💎 Crypto',
    aliases: ['криптой', 'crypto', 'usdc'],
    action: 'pay_crypto',
    sceneId: ModeEnum.CryptoPaymentScene,
  },
}

/**
 * Кнопки категорий (Фото, Видео, Аудио, Аватары, Инструменты, Профиль)
 */
export const CATEGORY_BUTTONS: Record<string, ButtonConfig> = {
  photo: {
    id: 'photo',
    ru: '📸 Фото',
    en: '📸 Photo',
    aliases: ['фото', 'photo'],
    action: 'category_photo',
    sceneId: 'photo_category',
  },
  video: {
    id: 'video',
    ru: '🎥 Видео',
    en: '🎥 Video',
    aliases: ['видео', 'video'],
    action: 'category_video',
    sceneId: 'video_category',
  },
  audio: {
    id: 'audio',
    ru: '🎙️ Аудио',
    en: '🎙️ Audio',
    aliases: ['аудио', 'audio'],
    action: 'category_audio',
    sceneId: 'audio_category',
  },
  avatars: {
    id: 'avatars',
    ru: '🤖 Аватары',
    en: '🤖 Avatars',
    aliases: ['аватары', 'avatars'],
    action: 'category_avatars',
    sceneId: 'avatars_category',
  },
  profile: {
    id: 'profile',
    ru: '👤 Профиль',
    en: '👤 Profile',
    aliases: ['профиль', 'profile'],
    action: 'category_profile',
    sceneId: 'profile_category',
  },
}

/**
 * Кнопки профиля (Баланс, Подписка, Пригласить друга, Техподдержка)
 */
export const PROFILE_BUTTONS: Record<string, ButtonConfig> = {
  balance: {
    id: 'balance',
    ru: '💰 Баланс',
    en: '💰 Balance',
    aliases: ['баланс', 'balance'],
    action: 'go_balance',
    sceneId: ModeEnum.BalanceScene, // ✅ ИСПРАВЛЕНО: Прямой переход (CheckBalanceScene удалён)
    mode: ModeEnum.Balance,
    directScene: true,
  },
  topUp: {
    id: 'topUp',
    ru: '💎 Пополнить баланс',
    en: '💎 Top up Balance',
    aliases: ['пополнить баланс', 'top up balance', 'пополнить'],
    action: 'go_top_up',
    sceneId: ModeEnum.PaymentScene, // ✅ ИСПРАВЛЕНО: Прямой переход (CheckBalanceScene удалён)
    mode: ModeEnum.TopUpBalance,
    directScene: true,
  },
  subscription: {
    id: 'subscription',
    ru: '💫 Оформить подписку',
    en: '💫 Subscribe',
    aliases: ['оформить подписку', 'subscribe', 'подписка'],
    action: 'go_subscription',
    sceneId: ModeEnum.SubscriptionScene,
    mode: ModeEnum.SubscriptionScene,
    directScene: true,
  },
  invite: {
    id: 'invite',
    ru: '👥 Пригласить друга',
    en: '👥 Invite Friend',
    aliases: ['пригласить друга', 'invite a friend', 'invite friend'],
    action: 'go_invite',
    sceneId: ModeEnum.InviteScene, // ✅ ИСПРАВЛЕНО: Прямой переход (CheckBalanceScene удалён)
    mode: ModeEnum.Invite,
    directScene: true,
  },
  support: {
    id: 'support',
    ru: '💬 Техподдержка',
    en: '💬 Tech Support',
    aliases: ['техподдержка', 'tech support', 'support', '/support'],
    action: 'go_support',
    directScene: true,
  },
  language: {
    id: 'language',
    ru: '🌐 Язык',
    en: '🌐 Language',
    aliases: ['язык', 'language', '🌐 EN', '🌐 RU'],
    action: 'go_language',
    directScene: true,
  },
}

/**
 * Все кнопки в одном объекте для удобства поиска
 */
export const ALL_BUTTONS: Record<string, ButtonConfig> = {
  ...NAVIGATION_BUTTONS,
  ...PAYMENT_BUTTONS,
  ...CATEGORY_BUTTONS,
  ...PROFILE_BUTTONS,
}

/**
 * Получить текст кнопки по языку
 */
export function getButtonText(
  button: ButtonConfig,
  isRussian: boolean
): string {
  return isRussian ? button.ru : button.en
}

/**
 * Получить все варианты текста кнопки (для совместимости со старым кодом)
 */
export function getButtonVariants(button: ButtonConfig): string[] {
  return [
    button.ru,
    button.en,
    button.ru.toLowerCase(),
    button.en.toLowerCase(),
    ...button.aliases,
  ]
}

/**
 * 🏠 Получить текст кнопки "Главное меню"
 */
export function getMainMenuText(isRussian: boolean): string {
  return getButtonText(NAVIGATION_BUTTONS.mainMenu, isRussian)
}

/**
 * ◀️ Получить текст кнопки "Назад"
 */
export function getBackText(isRussian: boolean): string {
  return getButtonText(NAVIGATION_BUTTONS.back, isRussian)
}

/**
 * ❌ Получить текст кнопки "Отмена"
 */
export function getCancelText(isRussian: boolean): string {
  return getButtonText(NAVIGATION_BUTTONS.cancel, isRussian)
}

/**
 * ❓ Получить текст кнопки "Справка"
 */
export function getHelpText(isRussian: boolean): string {
  return getButtonText(NAVIGATION_BUTTONS.help, isRussian)
}

/**
 * ⭐️ Получить текст кнопки "Звездами"
 */
export function getStarsText(isRussian: boolean): string {
  return getButtonText(PAYMENT_BUTTONS.stars, isRussian)
}

/**
 * 💳 Получить текст кнопки "Рублями"
 */
export function getRublesText(isRussian: boolean): string {
  return getButtonText(PAYMENT_BUTTONS.rubles, isRussian)
}

/**
 * 💎 Получить текст кнопки "Криптой"
 */
export function getCryptoText(isRussian: boolean): string {
  return getButtonText(PAYMENT_BUTTONS.crypto, isRussian)
}

// ═══════════════════════════════════════════════════════════════════════════
// 📦 ПРЕДГЕНЕРИРОВАННЫЕ ВАРИАНТЫ ДЛЯ MIDDLEWARE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Варианты кнопки "Звездами" для матчинга в middleware
 */
export const STARS_PAYMENT_VARIANTS = getButtonVariants(PAYMENT_BUTTONS.stars)

/**
 * Варианты кнопки "Рублями" для матчинга в middleware
 */
export const RUBLES_PAYMENT_VARIANTS = getButtonVariants(PAYMENT_BUTTONS.rubles)

/**
 * Варианты кнопки "Криптой" для матчинга в middleware
 */
export const CRYPTO_PAYMENT_VARIANTS = getButtonVariants(PAYMENT_BUTTONS.crypto)
