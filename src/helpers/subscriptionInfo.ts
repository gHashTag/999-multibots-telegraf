import { SubscriptionType } from '@/interfaces/subscription.interface'
import { levels } from '@/menu/mainMenu'

// Идентификаторы функций для проверки доступа
const FEATURE_IDS = {
  DIGITAL_BODY: 1,
  NEURO_PHOTO: 2,
  IMAGE_TO_PROMPT: 3,
  AVATAR_BRAIN: 4,
  CHAT_WITH_AVATAR: 5,
  SELECT_MODEL: 6,
  VOICE: 7,
  TEXT_TO_SPEECH: 8,
  IMAGE_TO_VIDEO: 9,
  TEXT_TO_VIDEO: 10,
  TEXT_TO_IMAGE: 11,
  FLUX_KONTEXT: 12,
  MORPHING: 13,
  TOP_UP_BALANCE: 100,
  BALANCE: 101,
  INVITE_FRIEND: 102,
  SUPPORT: 103,
  MAIN_MENU: 104,
  SUBSCRIBE: 105,
  LANGUAGE: 106,
  UPSCALE_PHOTO: 107,
  TRANSCRIBE_REELS: 108,
}

// Карта доступных функций для каждого типа подписки (используем ID)
export const SUBSCRIPTION_FEATURES = {
  [SubscriptionType.STARS]: {
    available: [
      FEATURE_IDS.INVITE_FRIEND,
      FEATURE_IDS.SUPPORT,
      FEATURE_IDS.LANGUAGE,
    ],
    blocked: [
      FEATURE_IDS.DIGITAL_BODY,
      FEATURE_IDS.NEURO_PHOTO,
      FEATURE_IDS.IMAGE_TO_PROMPT,
      FEATURE_IDS.AVATAR_BRAIN,
      FEATURE_IDS.CHAT_WITH_AVATAR,
      FEATURE_IDS.SELECT_MODEL,
      FEATURE_IDS.VOICE,
      FEATURE_IDS.TEXT_TO_SPEECH,
      FEATURE_IDS.IMAGE_TO_VIDEO,
      FEATURE_IDS.TEXT_TO_VIDEO,
      FEATURE_IDS.TEXT_TO_IMAGE,
      FEATURE_IDS.FLUX_KONTEXT,
      FEATURE_IDS.MORPHING,
      FEATURE_IDS.UPSCALE_PHOTO,
      FEATURE_IDS.TRANSCRIBE_REELS,
      // Баланс доступен только с подпиской
      FEATURE_IDS.BALANCE,
      FEATURE_IDS.TOP_UP_BALANCE,
    ],
  },
  [SubscriptionType.NEUROPHOTO]: {
    available: [
      FEATURE_IDS.DIGITAL_BODY,
      FEATURE_IDS.NEURO_PHOTO,
      FEATURE_IDS.IMAGE_TO_PROMPT,
      FEATURE_IDS.UPSCALE_PHOTO,
      FEATURE_IDS.TRANSCRIBE_REELS,
      FEATURE_IDS.BALANCE,
      FEATURE_IDS.TOP_UP_BALANCE,
      FEATURE_IDS.INVITE_FRIEND,
      FEATURE_IDS.SUPPORT,
    ],
    blocked: [
      FEATURE_IDS.AVATAR_BRAIN,
      FEATURE_IDS.CHAT_WITH_AVATAR,
      FEATURE_IDS.SELECT_MODEL,
      FEATURE_IDS.VOICE,
      FEATURE_IDS.TEXT_TO_SPEECH,
      FEATURE_IDS.IMAGE_TO_VIDEO,
      FEATURE_IDS.TEXT_TO_VIDEO,
      FEATURE_IDS.TEXT_TO_IMAGE,
      FEATURE_IDS.FLUX_KONTEXT,
      FEATURE_IDS.MORPHING,
    ],
  },
  [SubscriptionType.NEUROVIDEO]: {
    available: [
      FEATURE_IDS.DIGITAL_BODY,
      FEATURE_IDS.NEURO_PHOTO,
      FEATURE_IDS.IMAGE_TO_PROMPT,
      FEATURE_IDS.AVATAR_BRAIN,
      FEATURE_IDS.CHAT_WITH_AVATAR,
      FEATURE_IDS.SELECT_MODEL,
      FEATURE_IDS.VOICE,
      FEATURE_IDS.TEXT_TO_SPEECH,
      FEATURE_IDS.IMAGE_TO_VIDEO,
      FEATURE_IDS.TEXT_TO_VIDEO,
      FEATURE_IDS.TEXT_TO_IMAGE,
      FEATURE_IDS.FLUX_KONTEXT,
      FEATURE_IDS.MORPHING,
      FEATURE_IDS.UPSCALE_PHOTO,
      FEATURE_IDS.TRANSCRIBE_REELS,
      FEATURE_IDS.BALANCE,
      FEATURE_IDS.TOP_UP_BALANCE,
      FEATURE_IDS.INVITE_FRIEND,
      FEATURE_IDS.SUPPORT,
    ],
    blocked: [],
  },
  [SubscriptionType.NEUROTESTER]: {
    available: [
      FEATURE_IDS.DIGITAL_BODY,
      FEATURE_IDS.NEURO_PHOTO,
      FEATURE_IDS.IMAGE_TO_PROMPT,
      FEATURE_IDS.AVATAR_BRAIN,
      FEATURE_IDS.CHAT_WITH_AVATAR,
      FEATURE_IDS.SELECT_MODEL,
      FEATURE_IDS.VOICE,
      FEATURE_IDS.TEXT_TO_SPEECH,
      FEATURE_IDS.IMAGE_TO_VIDEO,
      FEATURE_IDS.TEXT_TO_VIDEO,
      FEATURE_IDS.TEXT_TO_IMAGE,
      FEATURE_IDS.FLUX_KONTEXT,
      FEATURE_IDS.MORPHING,
      FEATURE_IDS.UPSCALE_PHOTO,
      FEATURE_IDS.TRANSCRIBE_REELS,
      FEATURE_IDS.BALANCE,
      FEATURE_IDS.TOP_UP_BALANCE,
      FEATURE_IDS.INVITE_FRIEND,
      FEATURE_IDS.SUPPORT,
    ],
    blocked: [],
  },
}

/**
 * Находит ID функции по названию (поддерживает оба языка)
 */
function findFeatureId(featureName: string): number | null {
  // Специальная карта для команд, которые не совпадают с menu levels
  const COMMAND_TO_FEATURE_MAP: Record<string, number> = {
    'NeuroVideo': FEATURE_IDS.IMAGE_TO_VIDEO, // Ключевое исправление!
    'TextToVideo': FEATURE_IDS.TEXT_TO_VIDEO,
    'ImageToVideo': FEATURE_IDS.IMAGE_TO_VIDEO,
    'NeuroPhoto': FEATURE_IDS.NEURO_PHOTO,
    'TextToImage': FEATURE_IDS.TEXT_TO_IMAGE,
    // ✅ ИСПРАВЛЕНИЕ: Добавляем маппинг для морфинга
    '🌀 Infinity Морфинг': FEATURE_IDS.MORPHING,
    '🌀 Infinity Morphing': FEATURE_IDS.MORPHING,
    'Infinity Морфинг': FEATURE_IDS.MORPHING,
    'Infinity Morphing': FEATURE_IDS.MORPHING,
    'Морфинг': FEATURE_IDS.MORPHING,
    'Morphing': FEATURE_IDS.MORPHING,
    '🧬 Морфинг': FEATURE_IDS.MORPHING,
    '🧬 Morphing': FEATURE_IDS.MORPHING,
  }

  // Сначала проверяем специальную карту команд
  if (COMMAND_TO_FEATURE_MAP[featureName]) {
    return COMMAND_TO_FEATURE_MAP[featureName]
  }

  // Проверяем по всем levels
  for (const [id, level] of Object.entries(levels)) {
    if (
      featureName === level.title_ru ||
      featureName === level.title_en ||
      featureName.startsWith(level.title_ru.split(' ')[0]) || // По эмодзи
      featureName.startsWith(level.title_en.split(' ')[0]) // По эмоджи
    ) {
      return parseInt(id)
    }
  }
  return null
}

/**
 * Проверяет, доступна ли функция для данной подписки
 */
export function isFeatureAvailable(
  featureName: string,
  subscriptionType: SubscriptionType | null
): boolean {
  if (!subscriptionType) {
    subscriptionType = SubscriptionType.STARS
  }

  const features = SUBSCRIPTION_FEATURES[subscriptionType]
  if (!features) return false

  // Находим ID функции по названию
  const featureId = findFeatureId(featureName)
  if (featureId === null) return false

  // Проверяем, есть ли ID в списке доступных
  return features.available.includes(featureId)
}

/**
 * Возвращает сообщение о доступности функций для подписки
 */
export function getSubscriptionMessage(
  subscriptionType: SubscriptionType | null,
  isRu: boolean,
  attemptedFeature?: string
): string {
  const subscription = subscriptionType || SubscriptionType.STARS
  const features = SUBSCRIPTION_FEATURES[subscription]

  let message = ''

  if (subscription === SubscriptionType.STARS) {
    // Сообщение для пользователей без подписки
    if (isRu) {
      message = `❌ <b>Эта функция недоступна без подписки</b>\n\n`
      if (attemptedFeature) {
        message += `Вы попытались использовать: <b>${attemptedFeature}</b>\n\n`
      }
      message += `📋 <b>С бесплатным аккаунтом доступно:</b>\n`
      message += features.available
        .map(id => (levels[id] ? `✅ ${levels[id].title_ru}` : ''))
        .filter(Boolean)
        .join('\n')
      message += `\n\n🔒 <b>Для полного доступа оформите подписку:</b>\n`
      message += `• NEUROPHOTO - работа с фото и изображениями\n`
      message += `• NEUROVIDEO - все функции включая видео\n`
      message += `\n💫 Нажмите "Оформить подписку" для выбора тарифа`
    } else {
      message = `❌ <b>This feature is not available without subscription</b>\n\n`
      if (attemptedFeature) {
        message += `You tried to use: <b>${attemptedFeature}</b>\n\n`
      }
      message += `📋 <b>Available with free account:</b>\n`
      message += features.available
        .map(id => (levels[id] ? `✅ ${levels[id].title_en}` : ''))
        .filter(Boolean)
        .join('\n')
      message += `\n\n🔒 <b>For full access get a subscription:</b>\n`
      message += `• NEUROPHOTO - photo and image features\n`
      message += `• NEUROVIDEO - all features including video\n`
      message += `\n💫 Press "Subscribe" to choose a plan`
    }
  } else if (subscription === SubscriptionType.NEUROPHOTO) {
    // Сообщение для NEUROPHOTO подписки
    if (isRu) {
      message = `⚠️ <b>Эта функция требует расширенную подписку</b>\n\n`
      if (attemptedFeature) {
        message += `Вы попытались использовать: <b>${attemptedFeature}</b>\n\n`
      }
      message += `📋 <b>В вашей подписке NEUROPHOTO доступно:</b>\n`
      message += features.available
        .slice(0, 5)
        .map(id => (levels[id] ? `✅ ${levels[id].title_ru}` : ''))
        .filter(Boolean)
        .join('\n')
      message += `\n\n🔒 <b>Для этой функции нужна подписка NEUROVIDEO:</b>\n`
      message += features.blocked
        .slice(0, 5)
        .map(id => (levels[id] ? `🚫 ${levels[id].title_ru}` : ''))
        .filter(Boolean)
        .join('\n')
      message += `\n\n💫 Обновите подписку для доступа ко всем функциям`
    } else {
      message = `⚠️ <b>This feature requires an extended subscription</b>\n\n`
      if (attemptedFeature) {
        message += `You tried to use: <b>${attemptedFeature}</b>\n\n`
      }
      message += `📋 <b>Available in your NEUROPHOTO subscription:</b>\n`
      message += features.available
        .slice(0, 5)
        .map(id => (levels[id] ? `✅ ${levels[id].title_en}` : ''))
        .filter(Boolean)
        .join('\n')
      message += `\n\n🔒 <b>NEUROVIDEO subscription required for:</b>\n`
      message += features.blocked
        .slice(0, 5)
        .map(id => (levels[id] ? `🚫 ${levels[id].title_en}` : ''))
        .filter(Boolean)
        .join('\n')
      message += `\n\n💫 Upgrade your subscription for full access`
    }
  } else {
    // Для NEUROVIDEO и NEUROTESTER - все доступно
    if (isRu) {
      message = `✅ У вас полный доступ ко всем функциям бота!`
    } else {
      message = `✅ You have full access to all bot features!`
    }
  }

  return message
}

/**
 * Возвращает название подписки на нужном языке
 */
export function getSubscriptionName(
  subscriptionType: SubscriptionType | null,
  isRu: boolean
): string {
  if (!subscriptionType || subscriptionType === SubscriptionType.STARS) {
    return isRu ? 'Без подписки' : 'No subscription'
  }

  switch (subscriptionType) {
    case SubscriptionType.NEUROPHOTO:
      return 'NEUROPHOTO'
    case SubscriptionType.NEUROVIDEO:
      return 'NEUROVIDEO'
    case SubscriptionType.NEUROTESTER:
      return isRu ? 'NEUROTESTER (Тестер)' : 'NEUROTESTER (Tester)'
    default:
      return isRu ? 'Неизвестная подписка' : 'Unknown subscription'
  }
}
