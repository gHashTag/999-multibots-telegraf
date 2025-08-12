import { SubscriptionType } from '@/interfaces/subscription.interface'
import { levels } from '@/menu/mainMenu'

// Карта доступных функций для каждого типа подписки
export const SUBSCRIPTION_FEATURES = {
  [SubscriptionType.STARS]: {
    available: ['👥 Пригласить друга', '💬 Техподдержка', '🌐 Смена языка'],
    blocked: [
      '🤖 Цифровое тело',
      '📸 Нейрофото',
      '🔍 Промпт из фото',
      '🧠 Мозг аватара',
      '💭 Чат с аватаром',
      '🤖 Выбор модели ИИ',
      '🎤 Голос аватара',
      '🎙️ Текст в голос',
      '🎥 Фото в видео',
      '🎥 Видео из текста',
      '🖼️ Текст в фото',
      '🎨 FLUX Kontext',
      '🧬 Морфинг',
      '⬆️ Увеличить качество фото',
      '📺 Транскрибация Reels',
      '💰 Баланс',
      '💎 Пополнить баланс',
    ],
  },
  [SubscriptionType.NEUROPHOTO]: {
    available: [
      '🤖 Цифровое тело',
      '📸 Нейрофото',
      '🔍 Промпт из фото',
      '⬆️ Увеличить качество фото',
      '📺 Транскрибация Reels',
      '💰 Баланс',
      '💎 Пополнить баланс',
      '👥 Пригласить друга',
      '💬 Техподдержка',
    ],
    blocked: [
      '🧠 Мозг аватара',
      '💭 Чат с аватаром',
      '🤖 Выбор модели ИИ',
      '🎤 Голос аватара',
      '🎙️ Текст в голос',
      '🎥 Фото в видео',
      '🎥 Видео из текста',
      '🖼️ Текст в фото',
      '🎨 FLUX Kontext',
      '🧬 Морфинг',
    ],
  },
  [SubscriptionType.NEUROVIDEO]: {
    available: [
      '🤖 Цифровое тело',
      '📸 Нейрофото',
      '🔍 Промпт из фото',
      '🧠 Мозг аватара',
      '💭 Чат с аватаром',
      '🤖 Выбор модели ИИ',
      '🎤 Голос аватара',
      '🎙️ Текст в голос',
      '🎥 Фото в видео',
      '🎥 Видео из текста',
      '🖼️ Текст в фото',
      '🎨 FLUX Kontext',
      '🧬 Морфинг',
      '⬆️ Увеличить качество фото',
      '📺 Транскрибация Reels',
      '💰 Баланс',
      '💎 Пополнить баланс',
      '👥 Пригласить друга',
      '💬 Техподдержка',
    ],
    blocked: [],
  },
  [SubscriptionType.NEUROTESTER]: {
    available: [
      '🤖 Цифровое тело',
      '📸 Нейрофото',
      '🔍 Промпт из фото',
      '🧠 Мозг аватара',
      '💭 Чат с аватаром',
      '🤖 Выбор модели ИИ',
      '🎤 Голос аватара',
      '🎙️ Текст в голос',
      '🎥 Фото в видео',
      '🎥 Видео из текста',
      '🖼️ Текст в фото',
      '🎨 FLUX Kontext',
      '🧬 Морфинг',
      '⬆️ Увеличить качество фото',
      '📺 Транскрибация Reels',
      '💰 Баланс',
      '💎 Пополнить баланс',
      '👥 Пригласить друга',
      '💬 Техподдержка',
    ],
    blocked: [],
  },
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

  // Проверяем по началу строки (эмодзи + первые слова)
  return features.available.some(f => featureName.startsWith(f.split(' ')[0]))
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
      message += features.available.map(f => `✅ ${f}`).join('\n')
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
      message += features.available.map(f => `✅ ${f}`).join('\n')
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
        .map(f => `✅ ${f}`)
        .join('\n')
      message += `\n\n🔒 <b>Для этой функции нужна подписка NEUROVIDEO:</b>\n`
      message += features.blocked
        .slice(0, 5)
        .map(f => `🚫 ${f}`)
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
        .map(f => `✅ ${f}`)
        .join('\n')
      message += `\n\n🔒 <b>NEUROVIDEO subscription required for:</b>\n`
      message += features.blocked
        .slice(0, 5)
        .map(f => `🚫 ${f}`)
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
