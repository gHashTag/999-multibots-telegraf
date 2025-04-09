import { Subscription } from '@/interfaces/supabase.interface'

import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import { MyContext, Level } from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'

export const levels: Record<number, Level> = {
  // digital_avatar_body
  1: {
    title_ru: '🤖 Цифровое тело',
    title_en: '🤖 Digital Body',
  },
  // neuro_photo
  2: {
    title_ru: '📸 Нейрофото',
    title_en: '📸 NeuroPhoto',
  },
  // ModeEnum.ImageToPrompt
  3: {
    title_ru: '🔍 Промпт из фото',
    title_en: '🔍 Prompt from Photo',
  },
  // avatar
  4: {
    title_ru: '🧠 Мозг аватара',
    title_en: '🧠 Avatar Brain',
  },
  // chat_with_avatar
  5: {
    title_ru: '💭 Чат с аватаром',
    title_en: '💭 Chat with avatar',
  },
  // select_model
  6: {
    title_ru: '🤖 Выбор модели ИИ',
    title_en: '🤖 Choose AI Model',
  },
  // voice
  7: {
    title_ru: '🎤 Голос аватара',
    title_en: '🎤 Avatar Voice',
  },
  // text_to_speech
  8: {
    title_ru: '🎙️ Текст в голос',
    title_en: '🎙️ Text to Voice',
  },
  // image_to_video
  9: {
    title_ru: '🎥 Фото в видео',
    title_en: '🎥 Photo to Video',
  },
  // text_to_video
  10: {
    title_ru: '🎥 Видео из текста',
    title_en: '🎥 Text to Video',
  },
  // text_to_image
  11: {
    title_ru: '🖼️ Текст в фото',
    title_en: '🖼️ Text to Image',
  },
  // lip_sync
  // 12: {
  //   title_ru: '🎤 Синхронизация губ',
  //   title_en: '🎤 Lip Sync',
  // },
  // 13: {
  //   title_ru: '🎥 Видео в URL',
  //   title_en: '🎥 Video in URL',
  // },
  // step0
  // paymentScene
  100: {
    title_ru: '💎 Пополнить баланс',
    title_en: '💎 Top up balance',
  },
  // balanceCommand
  101: {
    title_ru: '🤑 Баланс',
    title_en: '🤑 Balance',
  },
  // inviteCommand
  102: {
    title_ru: '👥 Пригласить друга',
    title_en: '👥 Invite a friend',
  },
  // helpCommand
  103: {
    title_ru: '❓ Помощь',
    title_en: '❓ Help',
  },
  104: {
    title_ru: '🛠 Техподдержка',
    title_en: '🛠 Tech Support',
  },
  105: {
    title_ru: '💫 Оформить подписку',
    title_en: '💫 Subscribe',
  },
}

export const mainMenuButton = {
  title_ru: '🏠 Главное меню',
  title_en: '🏠 Main menu',
}

export async function mainMenu({
  isRu,
  subscription = 'stars',
  level,
  additionalButtons = [],
}: {
  isRu: boolean
  inviteCount: number
  subscription: Subscription
  level: number
  ctx: MyContext
  additionalButtons?: Level[]
}): Promise<Markup.Markup<ReplyKeyboardMarkup>> {
  logger.info('🚀 Начало формирования главного меню', {
    description: 'Starting main menu creation',
    subscription,
    level,
    has_additional_buttons: additionalButtons.length > 0,
  })

  console.log('💻 CASE: mainMenu')

  // Основная конфигурация меню
  const subscriptionLevelsMap = {
    stars: [levels[105], levels[104]],
    neurophoto: [
      levels[1],
      levels[2],
      levels[3],
      levels[100],
      levels[101],
      levels[102],
      levels[103],
      levels[104],
      levels[105],
    ],
    neurobase: Object.values(levels),
    neuromeeting: Object.values(levels),
    neuroblogger: Object.values(levels),
    neurotester: Object.values(levels),
  }

  logger.info('📋 Определение доступных уровней', {
    description: 'Determining available levels',
    subscription,
    available_levels_count:
      subscriptionLevelsMap[subscription as keyof typeof subscriptionLevelsMap]
        ?.length || 0,
  })

  // Получаем основные кнопки для текущей подписки
  let availableLevels =
    subscriptionLevelsMap[subscription as keyof typeof subscriptionLevelsMap] ||
    []

  logger.info('🔍 Проверка уровней для neurophoto', {
    description: 'Checking neurophoto specific levels',
    subscription,
    level,
    is_neurophoto_with_level_3: subscription === 'neurophoto' && level >= 3,
  })

  // Для neurophoto при уровне 3 добавляем дополнительные кнопки
  if (subscription === 'neurophoto' && level >= 3) {
    logger.info('➕ Добавление дополнительных кнопок для neurophoto', {
      description: 'Adding extra buttons for neurophoto',
      additional_buttons_count: additionalButtons.length,
    })

    availableLevels = [
      ...availableLevels.filter(l => l.title_ru !== mainMenuButton.title_ru),
      ...additionalButtons,
    ]
  }

  // Удаляем дубликаты уровней
  availableLevels = Array.from(new Set(availableLevels))

  logger.info('🎯 Фильтрация уровней по подписке', {
    description: 'Filtering levels by subscription',
    subscription,
    is_full_access: ['neurotester', 'neurobase'].includes(subscription),
    available_levels_before: availableLevels.length,
  })

  // Для подписок с полным доступом не фильтруем по уровню
  if (!['neurotester', 'neurobase'].includes(subscription)) {
    availableLevels = availableLevels.filter(
      l =>
        // Оставляем кнопки, которые есть в subscriptionLevelsMap
        subscriptionLevelsMap[
          subscription as keyof typeof subscriptionLevelsMap
        ].includes(l) ||
        // Или это дополнительные кнопки
        additionalButtons.includes(l)
    )
  }

  logger.info('🎮 Формирование кнопок меню', {
    description: 'Creating menu buttons',
    available_levels_after_filter: availableLevels.length,
    buttons: availableLevels.map(l => (isRu ? l.title_ru : l.title_en)),
  })

  // Формируем кнопки
  const buttons = availableLevels.map(level =>
    Markup.button.text(isRu ? level.title_ru : level.title_en)
  )

  // Разбиваем на строки по 2 кнопки
  const buttonRows = []
  for (let i = 0; i < buttons.length; i += 2) {
    buttonRows.push(buttons.slice(i, i + 2))
  }

  logger.info('✅ Завершение формирования меню', {
    description: 'Menu creation completed',
    total_rows: buttonRows.length,
    total_buttons: buttons.length,
  })

  console.log(
    '👉 Available buttons:',
    buttons.map(b => b.text)
  )
  return Markup.keyboard(buttonRows).resize()
}
