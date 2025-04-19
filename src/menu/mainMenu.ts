import { SubscriptionType } from '@/interfaces/subscription.interface'
import { Markup } from 'telegraf'
import { ReplyKeyboardMarkup } from 'telegraf/typings/core/types/typegram'
import {
  MyContext,
  Level as ImportedLevel,
} from '@/interfaces/telegram-bot.interface'
import { logger } from '@/utils/logger'

import { checkPaymentStatus } from '@/core/supabase'

export const levels: Record<number, ImportedLevel> = {
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
    title_ru: '🏠 Главное меню',
    title_en: '🏠 Main menu',
  },
}

export const mainMenuButton = {
  title_ru: '🏠 Главное меню',
  title_en: '🏠 Main menu',
}

const adminIds = process.env.ADMIN_IDS?.split(',') || []

export async function mainMenu({
  isRu,
  inviteCount,
  subscription = SubscriptionType.STARS,
  level,
  ctx,
}: {
  isRu: boolean
  inviteCount: number
  subscription: SubscriptionType
  level: number
  ctx: MyContext
}): Promise<Markup.Markup<ReplyKeyboardMarkup>> {
  logger.info('CASE: mainMenu')
  let hasFullAccess = false //await checkPaymentStatus(ctx, subscription)
  logger.info(
    `[mainMenu] checkPaymentStatus result (hasFullAccess): ${hasFullAccess}`
  )

  const subscriptionButton = isRu ? levels[0].title_ru : levels[0].title_en

  const subscriptionLevelsMap: Record<SubscriptionType, ImportedLevel[]> = {
    [SubscriptionType.STARS]: [levels[0]],
    [SubscriptionType.NEUROPHOTO]: [
      levels[1],
      levels[2],
      levels[3],
      levels[100],
      levels[101],
      levels[102],
    ],
    [SubscriptionType.NEUROBASE]: Object.values(levels).slice(1),
    [SubscriptionType.NEUROMEETING]: Object.values(levels).slice(1),
    [SubscriptionType.NEUROBLOGGER]: Object.values(levels).slice(1),
    [SubscriptionType.NEUROTESTER]: Object.values(levels),
  }

  logger.info({ message: '[mainMenu] Input:', isRu, sub: subscription, level })

  let availableLevels: ImportedLevel[] =
    subscriptionLevelsMap[subscription] || []
  logger.info({
    message: '[mainMenu] Initial availableLevels from map',
    count: availableLevels.length,
    levels: availableLevels.map(l => (isRu ? l.title_ru : l.title_en)),
  })

  if (subscription === SubscriptionType.NEUROTESTER) {
    logger.info('[mainMenu] NEUROTESTER detected, setting full access')
    hasFullAccess = true
    availableLevels = Object.values(levels)
  } else if (subscription === SubscriptionType.STARS) {
    logger.info('[mainMenu] STARS subscription detected')
    const baseStarLevels = subscriptionLevelsMap[SubscriptionType.STARS] || []
    const unlockedLevels = Object.values(levels).slice(1, inviteCount + 1)
    availableLevels = [...baseStarLevels, ...unlockedLevels]
    logger.info({
      message: '[mainMenu] STARS levels calculated',
      inviteCount,
      baseStarLevels: baseStarLevels.map(l => (isRu ? l.title_ru : l.title_en)),
      unlockedLevels: unlockedLevels.map(l => (isRu ? l.title_ru : l.title_en)),
      finalAvailable: availableLevels.map(l =>
        isRu ? l.title_ru : l.title_en
      ),
    })
  }

  const additionalButtons = [levels[100], levels[101], levels[102], levels[103]]

  if (
    subscription === SubscriptionType.STARS ||
    !subscriptionLevelsMap[subscription]
  ) {
    additionalButtons.push(levels[0])
  }

  availableLevels = [...availableLevels, ...additionalButtons]

  const uniqueLevels = new Map<number, ImportedLevel>()
  Object.entries(levels).forEach(([key, levelData]) => {
    if (availableLevels.some(l => l === levelData)) {
      uniqueLevels.set(parseInt(key, 10), levelData)
    }
  })
  availableLevels = Array.from(uniqueLevels.values())

  logger.info({
    message:
      '[mainMenu] Available levels after adding additional & deduplicating',
    count: availableLevels.length,
    levels: availableLevels.map(l => (isRu ? l.title_ru : l.title_en)),
  })

  if (availableLevels.length === 0) {
    logger.warn(
      '[mainMenu] No available levels after all processing. Adding only subscription button.'
    )
    return Markup.keyboard([[Markup.button.text(subscriptionButton)]]).resize()
  }

  const buttons = availableLevels.map(levelData =>
    Markup.button.text(isRu ? levelData.title_ru : levelData.title_en)
  )

  logger.info({
    message: '[mainMenu] Final buttons generated',
    count: buttons.length,
    button_texts: buttons.map(b => ('text' in b ? b.text : '')),
  })

  const userId = ctx.from?.id?.toString()

  if (userId && adminIds.includes(userId)) {
    logger.info('[mainMenu] Adding admin buttons')
    const adminButtons = [
      Markup.button.text(isRu ? 'ADMIN: Цифровое тело' : 'ADMIN: Digital Body'),
      Markup.button.text(isRu ? 'ADMIN: Нейрофото' : 'ADMIN: NeuroPhoto'),
    ]
    buttons.push(...adminButtons)
  }

  const buttonRows = []
  for (let i = 0; i < buttons.length; i += 2) {
    buttonRows.push(buttons.slice(i, i + 2))
  }

  logger.info({ message: '[mainMenu] Generated buttonRows:', buttonRows })

  return Markup.keyboard(buttonRows).resize()
}
