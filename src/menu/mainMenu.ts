import type { Message, Update } from "telegraf/types"
import { checkFullAccess } from '../handlers/checkFullAccess'
import { Markup } from 'telegraf'
import type { MyContext } from '../interfaces/telegram-bot.interface'
import { SubscriptionType } from '../interfaces/subscription.interface'

interface Level {
  title_ru: string
  title_en: string
}

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
    title_ru: '💰 Баланс',
    title_en: '💰 Balance',
  },
  // inviteCommand
  102: {
    title_ru: '👥 Пригласить друга',
    title_en: '👥 Invite a friend',
  },
  // helpCommand
  103: {
    title_ru: '💬 Техподдержка',
    title_en: '💬 Support',
  },
  // Возвращаем Главное меню
  104: {
    title_ru: '🏠 Главное меню',
    title_en: '🏠 Main menu',
  },
  105: {
    title_ru: '💫 Оформить подписку',
    title_en: '💫 Subscribe',
  },
  // Возвращаем Справку
  106: {
    title_ru: '❓ Справка',
    title_en: '❓ Help',
  },
}

const adminIds = process.env.ADMIN_IDS?.split(',') || []

export async function mainMenu({
  isRu,
  subscription = SubscriptionType.STARS,
  ctx,
}: {
  isRu: boolean
  subscription: SubscriptionType | null
  ctx: MyContext
}): Promise<Markup.Markup<ReplyKeyboardMarkup>> {
  console.log('💻 CASE: mainMenu - Entering function')

  const currentSubscription =
    subscription === null ? SubscriptionType.STARS : subscription
  console.log(
    `[mainMenu LOG] Input subscription: ${subscription}, Effective subscription: ${currentSubscription}`
  )

  let hasFullAccess = checkFullAccess(currentSubscription)
  console.log(`[mainMenu LOG] hasFullAccess: ${hasFullAccess}`)

  const subscriptionLevelsMap: Record<SubscriptionType, Level[]> = {
    [SubscriptionType.STARS]: [],
    [SubscriptionType.NEUROPHOTO]: [levels[1], levels[2], levels[3]],
    [SubscriptionType.NEUROBASE]: Object.values(levels), // Все
    [SubscriptionType.NEUROBLOGGER]: Object.values(levels), // Все
    [SubscriptionType.NEUROTESTER]: Object.values(levels), // Все
  }

  let availableLevels: Level[] =
    subscriptionLevelsMap[currentSubscription] || []

  // Фильтруем ВСЕ сервисные кнопки
  const filterServiceLevels = (lvl: Level) =>
    lvl !== levels[100] && // Пополнить баланс
    lvl !== levels[101] && // Баланс
    lvl !== levels[102] && // Пригласить друга
    lvl !== levels[103] && // Техподдержка
    lvl !== levels[104] && // Главное меню (не показываем кнопку саму на себя)
    lvl !== levels[105] && // Оформить подписку
    lvl !== levels[106] // Справка

  if (
    currentSubscription === SubscriptionType.NEUROTESTER ||
    currentSubscription === SubscriptionType.NEUROBASE ||
    currentSubscription === SubscriptionType.NEUROBLOGGER
  ) {
    hasFullAccess = true
    console.log(
      `[mainMenu LOG] Overriding hasFullAccess to true for ${currentSubscription}`
    )
    if (currentSubscription === SubscriptionType.NEUROTESTER) {
      availableLevels = Object.values(levels).filter(filterServiceLevels)
    } else {
      availableLevels =
        subscriptionLevelsMap[currentSubscription].filter(filterServiceLevels)
    }
  } else if (currentSubscription === SubscriptionType.STARS) {
    availableLevels = []
  }
  availableLevels = Array.from(new Set(availableLevels))
  console.log(
    `[mainMenu LOG] Determined availableLevels count: ${availableLevels.length}`
  )

  const levelButtons = availableLevels.map(lvl =>
    Markup.button.text(isRu ? lvl.title_ru : lvl.title_en)
  )

  const userId = ctx.from?.id?.toString()
  const adminSpecificButtons = []
  if (userId && adminIds.includes(userId)) {
    adminSpecificButtons.push(
      Markup.button.text(isRu ? '🤖 Цифровое тело 2' : '🤖 Digital Body 2'),
      Markup.button.text(isRu ? '📸 Нейрофото 2' : '📸  NeuroPhoto 2')
    )
    console.log('[mainMenu LOG] Added admin buttons.')
  }

  const allFunctionalButtons = [...levelButtons, ...adminSpecificButtons]
  const buttonRows = []
  for (let i = 0; i < allFunctionalButtons.length; i += 2) {
    buttonRows.push(allFunctionalButtons.slice(i, i + 2))
  }

  // --- ВОЗВРАЩАЕМ ЛОГИКУ ДЛЯ НИЖНЕГО РЯДА ---
  const bottomRowButtons = []
  const helpButton = Markup.button.text(
    isRu ? levels[106].title_ru : levels[106].title_en // Кнопка Справка
  )
  const supportButton = Markup.button.text(
    isRu ? levels[103].title_ru : levels[103].title_en // Кнопка Техподдержка
  )
  // Кнопка Назад (go_back) здесь не нужна, так как это главное меню.
  // Кнопка Главное меню (levels[104]) здесь тоже не нужна.

  if (currentSubscription === SubscriptionType.STARS) {
    const subscribeButton = Markup.button.text(
      isRu ? levels[105].title_ru : levels[105].title_en
    )
    // Для STARS: Подписка | Справка | Техподдержка
    bottomRowButtons.push([subscribeButton, helpButton, supportButton])
  } else {
    const balanceButton = Markup.button.text(
      isRu ? levels[101].title_ru : levels[101].title_en
    )
    const topUpButton = Markup.button.text(
      isRu ? levels[100].title_ru : levels[100].title_en
    )
    const inviteButton = Markup.button.text(
      isRu ? levels[102].title_ru : levels[102].title_en
    )
    buttonRows.push([balanceButton, topUpButton]) // Баланс | Пополнить
    // Для остальных: Пригласить | Справка | Техподдержка
    bottomRowButtons.push([inviteButton, helpButton, supportButton])
  }
  // --- КОНЕЦ ВОЗВРАТА НИЖНЕГО РЯДА ---

  const finalKeyboard = [...buttonRows, ...bottomRowButtons]
  console.log(`[mainMenu LOG] Total button rows: ${finalKeyboard.length}`)

  return Markup.keyboard(finalKeyboard).resize()
}
