import { Subscription } from '@/interfaces/supabase.interface'

import { checkPaymentStatus } from '@/core/supabase'
import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import { MyContext } from '@/interfaces/telegram-bot.interface'

interface Level {
  title_ru: string
  title_en: string
}

export const levels: Record<number, Level> = {
  0: {
    title_ru: '💫 Оформить подписку',
    title_en: '💫 Subscribe',
  },
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
  // image_to_prompt
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
  12: {
    title_ru: '🎤 Синхронизация губ',
    title_en: '🎤 Lip Sync',
  },
  // step0
  99: {
    title_ru: '🎮 Начать обучение',
    title_en: '🎮 Start learning',
  },
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
    title_ru: '🏠 Главное меню',
    title_en: '🏠 Main menu',
  },
}

export async function mainMenu({
  isRu,
  inviteCount,
  subscription = 'stars',
  ctx,
}: {
  isRu: boolean
  inviteCount: number
  subscription: Subscription
  ctx: MyContext
}): Promise<Markup.Markup<ReplyKeyboardMarkup>> {
  console.log('CASE: mainMenu')

  const hasFullAccess = await checkPaymentStatus(ctx)

  // Определяем доступные уровни в зависимости от подписки
  const subscriptionLevelsMap = {
    stars: [levels[0]],
    neurophoto: [
      levels[1],
      levels[2],
      levels[3],
      levels[100],
      levels[101],
      levels[102],
      levels[103],
      levels[0],
    ],
    neurobase: Object.values(levels).slice(1),
    neuromeeting: Object.values(levels).slice(1),
    neuroblogger: Object.values(levels).slice(1),
    neurotester: Object.values(levels).slice(1),
  }

  let availableLevels
  if (subscriptionLevelsMap[subscription]) {
    availableLevels = subscriptionLevelsMap[subscription]
  } else if (inviteCount === 0 && !hasFullAccess) {
    availableLevels = [levels[0]]
  } else {
    availableLevels = [levels[0]]
  }

  const helpButton = isRu ? levels[103].title_ru : levels[103].title_en
  const mainMenuButton = isRu ? levels[104].title_ru : levels[104].title_en

  if (availableLevels.length === 0) {
    console.warn(
      'No available levels for the current invite count and subscription status.'
    )
    return Markup.keyboard([
      [Markup.button.text(helpButton), Markup.button.text(mainMenuButton)],
    ]).resize()
  }

  const buttons = availableLevels.map(level =>
    Markup.button.text(isRu ? level.title_ru : level.title_en)
  )

  // Разбиваем кнопки на строки по две кнопки
  const buttonRows = []
  for (let i = 0; i < buttons.length; i += 2) {
    buttonRows.push(buttons.slice(i, i + 2))
  }

  // Добавляем дополнительные кнопки в конце если нет доступа ко всем уровням
  if (!hasFullAccess) {
    buttonRows.push([Markup.button.text(helpButton)])
  }
  return Markup.keyboard(buttonRows).resize()
}
