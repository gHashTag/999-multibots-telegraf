import { Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import { checkFullAccess } from '../handlers/checkFullAccess'
import { MyContext } from '../interfaces/telegram-bot.interface'
import { SubscriptionType } from '../interfaces/subscription.interface'
import { ADMIN_IDS_ARRAY } from '@/config'
import { getUserLanguage, isRussianWithUserChoice } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { getBotNameByToken } from '../core/bot'
import { getGenerationStatusBadgeAsync } from '@/helpers/getGenerationLimitMessage'

interface Level {
  title_ru: string
  title_en: string
  admin_only?: boolean // Опциональное поле для ограничения доступа только админам
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
    title_en: '🖼️ Text to Photo',
  },
  // ai_photoshop (formerly flux_kontext)
  12: {
    title_ru: '🎨 ИИ Фотошоп',
    title_en: '🎨 AI Photoshop',
  },
  // morphing
  13: {
    title_ru: '🌀 Infinity Морфинг',
    title_en: '🌀 Infinity Morphing',
    // Доступно всем пользователям с подпиской
  },
  // lip_sync - выбор моделей lip-sync (Kling, Sync, Veed Fabric)
  14: {
    title_ru: '🎤 Синхронизация губ',
    title_en: '🎤 Lip Sync',
    admin_only: true, // 🔒 ВРЕМЕННО: только для админов пока тестируется интеграция
  },
  // face_swap - замена лица на видео/фото
  15: {
    title_ru: '🎭 Замена лица',
    title_en: '🎭 Face Swap',
  },
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
  104: {
    title_ru: '🏠 Главное меню',
    title_en: '🏠 Main menu',
  },
  105: {
    title_ru: '💫 Оформить подписку',
    title_en: '💫 Subscribe',
  },
  106: {
    title_ru: '🌐 EN',
    title_en: '🌐 RU',
  },
  107: {
    title_ru: '⬆️ Увеличить качество фото',
    title_en: '⬆️ Upscale Photo Quality',
  },
  108: {
    title_ru: '📺 Транскрибация Reels',
    title_en: '📺 Transcribe Reels',
  },
  // Competitor monitoring button - admin only access - opens Instagram Parser Scene directly
  109: {
    title_ru: '🔍 Мониторинг конкурентов',
    title_en: '🔍 Competitor Monitoring',
    admin_only: true, // Скрыто для обычных пользователей - только для администраторов
  },
  // AI Reels generation button - creates Instagram-style reels with AI (admin only)
  110: {
    title_ru: '🎬 ИИ Рилс',
    title_en: '🎬 AI Reels',
    admin_only: true, // Доступно только администраторам
  },
  // AI Heroes transformation - Transform into superheroes from different universes
  111: {
    title_ru: '🦸‍♂️ ИИ Герои',
    title_en: '🦸‍♂️ AI Heroes',
  },
  // Removed: Plus button for adding new models - not needed in production menu
}

// Удаляем дублированную проверку - используем только ADMIN_IDS_ARRAY из config

// 🔍 ПЕРСОНАЛИЗИРОВАННЫЕ МАССИВЫ СОТРУДНИКОВ ПО БОТАМ

// 🤖 Массив сотрудников HaimGroupMedia_bot (ограниченный доступ к парсингу)
const HAIM_GROUP_STAFF_IDS = [
  '144022504', // @neuro_coder - Главный админ и владелец проекта ID 37
  '289259562', // @Vyacheslav_Neklyudov - Админ
  '752224685', // @voskresenskaya13 - Админ
  '7669741878', // @Arhustel - Админ
  '164609458', // @artemfisenko - Админ
  '1036512726', // 🆕 НОВЫЙ СОТРУДНИК - Полный доступ к ИИ Рилс
  '752224685', // 🆕 НОВЫЙ СОТРУДНИК - Полный доступ к ИИ Рилс (уже был в списке)
]

// 🤖 Массив сотрудников MetaMuse_Manifest_bot (полный доступ к парсингу)
const METAMUSE_STAFF_IDS = [
  '144022504', // @neuro_coder - Админ
  '352374518', // Админ
  '1064902106', // Админ
  '7669741878', // @Arhustel - Админ (общий)
  '737300586', // Админ
  '447979523', // Админ
]

// 🔍 Функция определения доступа к парсингу
function getParsingAccess(
  userId: string,
  botToken: string
): {
  hasAccess: boolean
  allowedProjects?: string[]
} {
  const { bot_name } = getBotNameByToken(botToken)

  // 👑 ГЛАВНЫЙ АДМИН ИМЕЕТ ДОСТУП КО ВСЕМ БОТАМ И ВСЕМ ПРОЕКТАМ
  if (userId === '144022504') {
    return {
      hasAccess: true,
      allowedProjects: ['all'], // Полный доступ ко всем проектам
    }
  }

  // 🤖 Персонализированные правила для конкретных ботов
  if (bot_name === 'HaimGroupMedia_bot') {
    const hasAccess = HAIM_GROUP_STAFF_IDS.includes(userId)

    return {
      hasAccess,
      allowedProjects: hasAccess
        ? ['Coco Age', 'vyacheslav_nekludov']
        : undefined,
    }
  }

  if (bot_name === 'MetaMuse_Manifest_bot') {
    const hasAccess = METAMUSE_STAFF_IDS.includes(userId)

    return {
      hasAccess,
      allowedProjects: hasAccess ? ['all'] : undefined, // Все проекты
    }
  }

  // 🌐 УНИВЕРСАЛЬНАЯ ЛОГИКА ДЛЯ ОСТАЛЬНЫХ БОТОВ
  // Главные админы из ADMIN_IDS_ARRAY тоже получают доступ
  if (ADMIN_IDS_ARRAY.includes(parseInt(userId))) {
    return {
      hasAccess: true,
      allowedProjects: ['all'], // Полный доступ для админов
    }
  }

  // По умолчанию нет доступа
  return {
    hasAccess: false,
    allowedProjects: undefined,
  }
}

// Экспортируем функцию и массивы для использования в других модулях
export { HAIM_GROUP_STAFF_IDS, METAMUSE_STAFF_IDS, getParsingAccess }

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

  // ✅ ДЕТАЛЬНОЕ ЛОГИРОВАНИЕ ЯЗЫКА В MAINMENU
  const telegramId = ctx.from?.id?.toString()
  const userId = ctx.from?.id?.toString() // 🔧 Определяем userId в самом начале
  logger.info(`[mainMenu] 🎹 MENU CREATION STARTED:`, {
    telegramId,
    inputIsRu: isRu,
    subscription,
    sessionLanguage: ctx.session?.userLanguage,
    telegramLanguage: ctx.from?.language_code,
  })

  const currentSubscription =
    subscription === null ? SubscriptionType.STARS : subscription
  console.log(
    `[mainMenu LOG] Input subscription: ${subscription}, Effective subscription: ${currentSubscription}`
  )

  // ✅ ПРОВЕРЯЕМ АСИНХРОННУЮ ФУНКЦИЮ ЯЗЫКА (БД ONLY!)
  const dbLanguage = await getUserLanguage(ctx)
  const isRussianFromDB = await isRussianWithUserChoice(ctx)

  logger.info(`[mainMenu] Language consistency check:`, {
    telegramId,
    inputIsRu: isRu,
    dbLanguage,
    isRussianFromDB,
    areConsistent: isRu === isRussianFromDB,
    sessionExists: !!ctx.session,
  })

  let hasFullAccess = checkFullAccess(currentSubscription)
  console.log(`[mainMenu LOG] hasFullAccess: ${hasFullAccess}`)

  const subscriptionLevelsMap: Record<SubscriptionType, Level[]> = {
    [SubscriptionType.STARS]: [],
    [SubscriptionType.NEUROPHOTO]: [
      levels[1],
      levels[2],
      levels[3],
      levels[107],
      levels[108],
    ],
    [SubscriptionType.NEUROVIDEO]: Object.values(levels), // Все
    [SubscriptionType.NEUROTESTER]: Object.values(levels), // Все возможности для тестера
  }

  const filterServiceLevels = (lvl: Level) =>
    lvl !== levels[100] &&
    lvl !== levels[101] &&
    lvl !== levels[102] &&
    lvl !== levels[103] &&
    lvl !== levels[104] &&
    lvl !== levels[105] &&
    lvl !== levels[106] // ✅ ИСКЛЮЧАЕМ кнопку языка из основных кнопок

  let availableLevels: Level[] = []

  // ✅ ПОКАЗЫВАЕМ ВСЕ КНОПКИ ВСЕМ ПОЛЬЗОВАТЕЛЯМ (ИСПРАВЛЕНО)
  // Проверка доступа будет происходить при нажатии на кнопку
  hasFullAccess = true
  console.log(`[mainMenu LOG] Full access for all subscriptions (FIXED)`)

  // Показываем ВСЕ основные функции ВСЕМ пользователям
  // Фильтруем только служебные кнопки и админские функции
  // Используем ADMIN_IDS_ARRAY для единой проверки (уже импортирован в начале файла)

  // Проверяем доступ для админов и сотрудников Хаим Групп
  const isMainAdmin = userId && ADMIN_IDS_ARRAY.includes(parseInt(userId))
  const isHaimStaff = userId && HAIM_GROUP_STAFF_IDS.includes(userId)
  const hasAdminAccess = isMainAdmin || isHaimStaff

  console.log(
    `[mainMenu DEBUG] User ${userId}: isMainAdmin=${isMainAdmin}, isHaimStaff=${isHaimStaff}, hasAdminAccess=${hasAdminAccess}`
  )

  // Показываем кнопки всем пользователям, НЕ зависимо от подписки
  availableLevels = Object.values(levels)
    .filter(filterServiceLevels)
    .filter(level => {
      const shouldInclude = !(level.admin_only && !hasAdminAccess)
      if (level.admin_only) {
        console.log(
          `[mainMenu DEBUG] Admin-only level ${level.title_ru}: hasAdminAccess=${hasAdminAccess}, shouldInclude=${shouldInclude}`
        )
      }
      return shouldInclude
    })

  // Добавляем кнопку мониторинга конкурентов для админов и сотрудников Хаим Групп
  if (userId && levels[109]) {
    if (hasAdminAccess) {
      // Добавляем кнопку мониторинга конкурентов для администраторов (теперь открывает парсер)
      if (!availableLevels.includes(levels[109])) {
        availableLevels.push(levels[109])
        logger.info(
          '[mainMenu] Added competitor monitoring button for admin/staff (opens parser)',
          {
            userId,
            isMainAdmin,
            isHaimStaff,
            hasAdminAccess: true,
          }
        )
      }
    }
  }

  console.log(
    `[mainMenu LOG] Showing ALL buttons for subscription: ${currentSubscription}`
  )

  availableLevels = Array.from(new Set(availableLevels))
  console.log(
    `[mainMenu LOG] Determined availableLevels count: ${availableLevels.length}`
  )

  // Создаем кнопки с учетом лимитов генераций для AI Heroes
  const levelButtons = []
  for (const lvl of availableLevels) {
    let buttonText = isRu ? lvl.title_ru : lvl.title_en


  

  const adminSpecificButtons = []

  // Админские кнопки для основных админов
  if (userId && ADMIN_IDS_ARRAY.includes(parseInt(userId))) {
    adminSpecificButtons.push(
      Markup.button.text(isRu ? '🤖 Цифровое тело 2' : '🤖 Digital Body 2'),
      Markup.button.text(isRu ? '📸 Нейрофото 2' : '📸  NeuroPhoto 2')
    )
    console.log('[mainMenu LOG] Added admin buttons.')
  }

  // --- Создаем кнопки, которые нужны почти всегда ---
  const supportButton = Markup.button.text(
    isRu ? levels[103].title_ru : levels[103].title_en // "💬 Техподдержка"
  )
  const subscribeButton = Markup.button.text(
    isRu ? levels[105].title_ru : levels[105].title_en // "💫 Оформить подписку"
  )
  // ✅ Добавляем кнопку смены языка
  const languageButton = Markup.button.text(
    isRu ? levels[106].title_ru : levels[106].title_en // "🌐 EN" или "🌐 RU"
  )
  // --- ---

  const allFunctionalButtons = [...levelButtons, ...adminSpecificButtons]
  const buttonRows = []
  for (let i = 0; i < allFunctionalButtons.length; i += 2) {
    buttonRows.push(allFunctionalButtons.slice(i, i + 2))
  }

  const bottomRowButtons = [] // Кнопки ПЕРЕД последним рядом (Подписка)

  // Добавляем кнопки "Баланс" и "Пополнить баланс" для всех пользователей
  const balanceButton = Markup.button.text(
    isRu ? levels[101].title_ru : levels[101].title_en // "💰 Баланс"
  )
  const topUpButton = Markup.button.text(
    isRu ? levels[100].title_ru : levels[100].title_en // "💎 Пополнить баланс"
  )
  const inviteButton = Markup.button.text(
    isRu ? levels[102].title_ru : levels[102].title_en // "👥 Пригласить друга"
  )

  console.log(
    `[mainMenu LOG] Adding balance and top-up buttons for subscription: ${currentSubscription}`
  )

  // Баланс и Пополнить идут в основные ряды для всех пользователей
  buttonRows.push([balanceButton, topUpButton])

  // Пригласить и Поддержка идут в предпоследний ряд
  bottomRowButtons.push([inviteButton, supportButton])

  // ✅ Кнопка языка добавляется для ВСЕХ типов подписок в отдельном ряду
  bottomRowButtons.push([languageButton])
  console.log(
    `[mainMenu LOG] Generated bottomRowButtons (before Subscribe): ${JSON.stringify(bottomRowButtons)}`
  )

  // Собираем все ряды, КРОМЕ последнего (Подписка)
  const finalKeyboard = [...buttonRows, ...bottomRowButtons]

  // Добавляем кнопку "Оформить подписку" для ВСЕХ пользователей (включая STARS)
  console.log(`[mainMenu LOG] Adding subscribe button: ${subscribeButton.text}`)
  finalKeyboard.push([subscribeButton])

  console.log(`[mainMenu LOG] Total button rows: ${finalKeyboard.length}`)
  console.log(
    `[mainMenu LOG] Final keyboard structure:`,
    JSON.stringify(finalKeyboard.map(row => row.map(btn => btn.text)))
  )

  return Markup.keyboard(finalKeyboard).resize()
}
