import { SubscriptionType } from '@/interfaces/subscription.interface'

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

// Названия функций по ID (для отображения пользователю)
const FEATURE_NAMES: Record<number, { ru: string; en: string }> = {
  [FEATURE_IDS.DIGITAL_BODY]: { ru: '🧍 Цифровое тело', en: '🧍 Digital Body' },
  [FEATURE_IDS.NEURO_PHOTO]: { ru: '📸 НейроФото', en: '📸 NeuroPhoto' },
  [FEATURE_IDS.IMAGE_TO_PROMPT]: { ru: '🔍 Фото в промпт', en: '🔍 Image to Prompt' },
  [FEATURE_IDS.AVATAR_BRAIN]: { ru: '🧠 Мозг аватара', en: '🧠 Avatar Brain' },
  [FEATURE_IDS.CHAT_WITH_AVATAR]: { ru: '💬 Чат с аватаром', en: '💬 Chat with Avatar' },
  [FEATURE_IDS.SELECT_MODEL]: { ru: '🤖 Выбор модели', en: '🤖 Select Model' },
  [FEATURE_IDS.VOICE]: { ru: '🎙️ Голос', en: '🎙️ Voice' },
  [FEATURE_IDS.TEXT_TO_SPEECH]: { ru: '🗣️ Текст в речь', en: '🗣️ Text to Speech' },
  [FEATURE_IDS.IMAGE_TO_VIDEO]: { ru: '🎬 Фото в видео', en: '🎬 Image to Video' },
  [FEATURE_IDS.TEXT_TO_VIDEO]: { ru: '📝 Текст в видео', en: '📝 Text to Video' },
  [FEATURE_IDS.TEXT_TO_IMAGE]: { ru: '🖼️ Текст в фото', en: '🖼️ Text to Image' },
  [FEATURE_IDS.FLUX_KONTEXT]: { ru: '✨ Flux Kontext', en: '✨ Flux Kontext' },
  [FEATURE_IDS.MORPHING]: { ru: '🌀 Морфинг', en: '🌀 Morphing' },
  [FEATURE_IDS.TOP_UP_BALANCE]: { ru: '💳 Пополнить баланс', en: '💳 Top Up Balance' },
  [FEATURE_IDS.BALANCE]: { ru: '💰 Баланс', en: '💰 Balance' },
  [FEATURE_IDS.INVITE_FRIEND]: { ru: '👥 Пригласить друга', en: '👥 Invite Friend' },
  [FEATURE_IDS.SUPPORT]: { ru: '🆘 Поддержка', en: '🆘 Support' },
  [FEATURE_IDS.MAIN_MENU]: { ru: '🏠 Главное меню', en: '🏠 Main Menu' },
  [FEATURE_IDS.SUBSCRIBE]: { ru: '⭐ Подписка', en: '⭐ Subscribe' },
  [FEATURE_IDS.LANGUAGE]: { ru: '🌍 Язык', en: '🌍 Language' },
  [FEATURE_IDS.UPSCALE_PHOTO]: { ru: '🔍 Улучшить фото', en: '🔍 Upscale Photo' },
  [FEATURE_IDS.TRANSCRIBE_REELS]: { ru: '🎬 ИИ Рилс', en: '🎬 AI Reels' },
}

// Хелпер для получения названия функции по ID
function getFeatureName(id: number, isRu: boolean): string {
  const names = FEATURE_NAMES[id]
  if (!names) return ''
  return isRu ? names.ru : names.en
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
    // ✅ ИСПРАВЛЕНИЕ: Добавляем маппинг для AI Reels
    '🎬 ИИ Рилс': FEATURE_IDS.TRANSCRIBE_REELS,
    '🎬 AI Reels': FEATURE_IDS.TRANSCRIBE_REELS,
    'ИИ Рилс': FEATURE_IDS.TRANSCRIBE_REELS,
    'AI Reels': FEATURE_IDS.TRANSCRIBE_REELS,
  }

  // Сначала проверяем специальную карту команд
  if (COMMAND_TO_FEATURE_MAP[featureName]) {
    return COMMAND_TO_FEATURE_MAP[featureName]
  }

  // Проверяем по всем FEATURE_NAMES
  for (const [id, names] of Object.entries(FEATURE_NAMES)) {
    if (
      featureName === names.ru ||
      featureName === names.en ||
      featureName.startsWith(names.ru.split(' ')[0]) || // По эмодзи
      featureName.startsWith(names.en.split(' ')[0]) // По эмоджи
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
        .map(id => getFeatureName(id, true))
        .filter(Boolean)
        .map(name => `✅ ${name}`)
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
        .map(id => getFeatureName(id, false))
        .filter(Boolean)
        .map(name => `✅ ${name}`)
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
        .map(id => getFeatureName(id, true))
        .filter(Boolean)
        .map(name => `✅ ${name}`)
        .join('\n')
      message += `\n\n🔒 <b>Для этой функции нужна подписка NEUROVIDEO:</b>\n`
      message += features.blocked
        .slice(0, 5)
        .map(id => getFeatureName(id, true))
        .filter(Boolean)
        .map(name => `🚫 ${name}`)
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
        .map(id => getFeatureName(id, false))
        .filter(Boolean)
        .map(name => `✅ ${name}`)
        .join('\n')
      message += `\n\n🔒 <b>NEUROVIDEO subscription required for:</b>\n`
      message += features.blocked
        .slice(0, 5)
        .map(id => getFeatureName(id, false))
        .filter(Boolean)
        .map(name => `🚫 ${name}`)
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
