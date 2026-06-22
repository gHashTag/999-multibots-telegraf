/**
 * 🎯 ЕДИНЫЙ ИСТОЧНИК ПРАВДЫ ДЛЯ ВСЕЙ НАВИГАЦИИ БОТА
 *
 * Этот файл содержит ВСЮ конфигурацию навигации:
 * - Кнопки главного меню
 * - Режимы и сцены
 * - Права доступа
 * - Проверки подписки
 *
 * ⚠️ ВАЖНО: Все остальные файлы должны импортировать из этого файла!
 */

import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { ModeEnum } from '@/interfaces/modes'
import { ADMIN_IDS_ARRAY } from '@/config'
import { getBotNameByToken } from '@/core/bot'

// ========================================
// 1. ТИПЫ И ИНТЕРФЕЙСЫ
// ========================================

export interface NavigationButton {
  ru: string
  en: string
  mode: string | ModeEnum
  admin_only?: boolean
  requires_subscription?: boolean
  icon?: string
  category?: 'ai' | 'tools' | 'admin' | 'navigation' | 'payment' | 'video'
}

export interface NavigationConfig {
  buttons: NavigationButton[]
  levels: Record<number, { title_ru: string; title_en: string; admin_only?: boolean }>
}

// ========================================
// 2. ОСНОВНАЯ КОНФИГУРАЦИЯ КНОПОК
// ========================================

/**
 * Главное меню бота - единственный источник правды
 * Порядок: ИИ функции → Инструменты → Админ → Навигация → Оплата
 */
export const NAVIGATION_BUTTONS: NavigationButton[] = [
  // === ИИ ФУНКЦИИ ===
  {
    ru: '🤖 Цифровое тело',
    en: '🤖 Digital Body',
    mode: ModeEnum.DigitalAvatarBody,
    category: 'ai',
    icon: '🤖'
  },
  {
    ru: '📸 Нейрофото',
    en: '📸 NeuroPhoto',
    mode: ModeEnum.NeuroPhoto,
    category: 'ai',
    icon: '📸'
  },
  {
    ru: '🔍 Промпт из фото',
    en: '🔍 Prompt from Photo',
    mode: ModeEnum.ImageToPrompt,
    category: 'ai',
    icon: '🔍'
  },
  {
    ru: '🧠 Мозг аватара',
    en: '🧠 Avatar Brain',
    mode: ModeEnum.Avatar,
    category: 'ai',
    icon: '🧠'
  },
  {
    ru: '💭 Чат с аватаром',
    en: '💭 Chat with avatar',
    mode: ModeEnum.ChatWithAvatar,
    category: 'ai',
    icon: '💭'
  },
  {
    ru: '🤖 Выбор модели ИИ',
    en: '🤖 Choose AI Model',
    mode: ModeEnum.SelectModel,
    category: 'ai',
    icon: '🤖'
  },
  {
    ru: '🎤 Голос аватара',
    en: '🎤 Avatar Voice',
    mode: ModeEnum.Voice,
    category: 'ai',
    icon: '🎤'
  },
  {
    ru: '🎙️ Текст в голос',
    en: '🎙️ Text to Voice',
    mode: ModeEnum.TextToSpeech,
    category: 'ai',
    icon: '🎙️'
  },

  {
    ru: '💬 AI Чат',
    en: '💬 AI Chat',
    mode: ModeEnum.AiChat,
    category: 'ai',
    icon: '💬'
  },

  // === ВИДЕО И ФОТО ===
  {
    ru: '🎥 Фото в видео',
    en: '🎥 Photo to Video',
    mode: ModeEnum.ImageToVideo,
    category: 'tools',
    icon: '🎥'
  },
  {
    ru: '🎥 Видео из текста',
    en: '🎥 Text to Video',
    mode: ModeEnum.TextToVideo,
    category: 'tools',
    icon: '🎥'
  },
  {
    ru: '🖼️ Текст в фото',
    en: '🖼️ Text to Photo',
    mode: ModeEnum.TextToImage,
    category: 'tools',
    icon: '🖼️'
  },
  {
    ru: '🎨 ИИ Фотошоп',
    en: '🎨 AI Photoshop',
    mode: ModeEnum.AiPhotoshop,
    category: 'tools',
    icon: '🎨'
  },
  {
    ru: '⬆️ Увеличить качество фото',
    en: '⬆️ Upscale Photo Quality',
    mode: ModeEnum.ImageUpscaler,
    category: 'tools',
    icon: '⬆️'
  },

  // === ПРОДВИНУТЫЕ ИНСТРУМЕНТЫ ===
  {
    ru: '🌀 Infinity Морфинг',
    en: '🌀 Infinity Morphing',
    mode: ModeEnum.MorphingWizard,
    category: 'tools',
    icon: '🌀',
    requires_subscription: true
  },
  {
    ru: '🎭 Замена лица',
    en: '🎭 Face Swap',
    mode: ModeEnum.FaceSwap,
    category: 'tools',
    icon: '🎭'
  },
  {
    ru: '🦸‍♂️ ИИ Герои',
    en: '🦸‍♂️ AI Heroes',
    mode: 'ai_heroes',
    category: 'tools',
    icon: '🦸‍♂️',
    requires_subscription: true
  },

  // === АДМИНСКИЕ ФУНКЦИИ ===
  {
    ru: '🎤 Синхронизация губ',
    en: '🎤 Lip Sync',
    mode: 'lip_sync',
    category: 'admin',
    icon: '🎤',
    admin_only: true
  },
  {
    ru: '🎬 ИИ Рилс',
    en: '🎬 AI Reels',
    mode: ModeEnum.AiReelsEntryWizard,
    category: 'video',
    icon: '🎬',
    admin_only: true,
    requires_subscription: true
  },

  // === НАВИГАЦИЯ И ПОДДЕРЖКА ===
  {
    ru: '👥 Пригласить друга',
    en: '👥 Invite a friend',
    mode: ModeEnum.Invite,
    category: 'navigation',
    icon: '👥'
  },
  {
    ru: '💬 Техподдержка',
    en: '💬 Tech Support',
    mode: ModeEnum.Help,
    category: 'navigation',
    icon: '💬'
  },
  {
    ru: '🌐 EN',
    en: '🌐 RU',
    mode: ModeEnum.ChangeLanguageScene,
    category: 'navigation',
    icon: '🌐'
  },

  // === ОПЛАТА (ВНИЗУ!) ===
  {
    ru: '💫 Оформить подписку',
    en: '💫 Subscribe',
    mode: ModeEnum.SubscriptionScene,
    category: 'payment',
    icon: '💫'
  },
  {
    ru: '💎 Пополнить баланс',
    en: '💎 Top up balance',
    mode: ModeEnum.TopUpBalance,
    category: 'payment',
    icon: '💎'
  },
  {
    ru: '💰 Баланс',
    en: '💰 Balance',
    mode: ModeEnum.Balance,
    category: 'payment',
    icon: '💰'
  },
]

// ========================================
// 3. СЛУЖЕБНЫЕ КНОПКИ (не в главном меню)
// ========================================

export const SERVICE_BUTTONS = {
  main_menu: { ru: '🏠 Главное меню', en: '🏠 Main menu' },
  help: { ru: '❓ Помощь', en: '❓ Help' },
  cancel: { ru: 'Отмена', en: 'Cancel' },
  back: { ru: '◀️ Назад', en: '◀️ Back' },
}

// ========================================
// 4. ОБРАТНАЯ СОВМЕСТИМОСТЬ - levels[]
// ========================================

/**
 * Генерируем levels[] из NAVIGATION_BUTTONS
 * Для обратной совместимости со старым кодом
 */
export const levels: Record<number, { title_ru: string; title_en: string; admin_only?: boolean }> = {}

// Заполняем levels из NAVIGATION_BUTTONS
NAVIGATION_BUTTONS.forEach((btn, index) => {
  levels[index + 1] = {
    title_ru: btn.ru,
    title_en: btn.en,
    admin_only: btn.admin_only
  }
})

// Служебные кнопки (100+)
levels[100] = { title_ru: '💎 Пополнить баланс', title_en: '💎 Top up balance' }
levels[101] = { title_ru: '💰 Баланс', title_en: '💰 Balance' }
levels[102] = { title_ru: '👥 Пригласить друга', title_en: '👥 Invite a friend' }
levels[103] = { title_ru: '💬 Техподдержка', title_en: '💬 Support' }
levels[104] = { title_ru: '🏠 Главное меню', title_en: '🏠 Main menu' }
levels[105] = { title_ru: '💫 Оформить подписку', title_en: '💫 Subscribe' }
levels[106] = { title_ru: '🌐 EN', title_en: '🌐 RU' }
levels[107] = { title_ru: '⬆️ Увеличить качество фото', title_en: '⬆️ Upscale Photo Quality' }
levels[108] = { title_ru: '📺 Транскрибация Reels', title_en: '📺 Transcribe Reels' }

// ========================================
// 5. ФУНКЦИИ СОЗДАНИЯ КЛАВИАТУР
// ========================================

/**
 * Создает главное меню бота
 * Группировка как в старом mainMenu:
 * 1. Основные функции (по 2 в ряд)
 * 2. Баланс + Пополнить
 * 3. Пригласить + Поддержка
 * 4. Кнопка языка
 * 5. Оформить подписку (последний ряд)
 */
export const createMainMenuKeyboard = (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id

  // 🐛 DEBUG: Логируем определение языка
  console.log('🐛 [createMainMenuKeyboard] Language detection:', {
    telegramId: ctx.from?.id,
    isRu,
    isRuType: typeof isRu,
    telegramLanguage: ctx.from?.language_code,
    sessionLanguage: ctx.session?.language_code
  })

  // Разделяем кнопки по категориям
  const mainButtons = NAVIGATION_BUTTONS.filter(btn => {
    // Исключаем navigation и payment категории - они пойдут отдельно
    if (btn.category === 'navigation' || btn.category === 'payment') return false
    // Проверяем админские права
    if (btn.admin_only && (!userId || !ADMIN_IDS_ARRAY.includes(userId))) return false
    return true
  })

  // Получаем тексты основных кнопок
  const mainButtonTexts = mainButtons.map(btn => isRu ? btn.ru : btn.en)

  // 🐛 DEBUG: Логируем первые 3 кнопки
  console.log('🐛 [createMainMenuKeyboard] First 3 buttons:', {
    telegramId: ctx.from?.id,
    isRu,
    buttons: mainButtonTexts.slice(0, 3)
  })

  // Создаем клавиатуру
  const keyboard: string[][] = []

  // 1. Основные функции (по 2 кнопки в ряд)
  for (let i = 0; i < mainButtonTexts.length; i += 2) {
    const row = [mainButtonTexts[i]]
    if (mainButtonTexts[i + 1]) {
      row.push(mainButtonTexts[i + 1])
    }
    keyboard.push(row)
  }

  // 2. Баланс + Пополнить баланс
  keyboard.push([
    isRu ? '💰 Баланс' : '💰 Balance',
    isRu ? '💎 Пополнить баланс' : '💎 Top up balance'
  ])

  // 3. Пригласить друга + Техподдержка
  keyboard.push([
    isRu ? '👥 Пригласить друга' : '👥 Invite a friend',
    isRu ? '💬 Техподдержка' : '💬 Tech Support'
  ])

  // 4. Кнопка языка (отдельный ряд)
  keyboard.push([isRu ? '🌐 EN' : '🌐 RU'])

  // 5. Оформить подписку (последний ряд)
  keyboard.push([isRu ? '💫 Оформить подписку' : '💫 Subscribe'])

  return Markup.keyboard(keyboard).resize()
}

/**
 * Обрабатывает нажатие кнопки меню
 */
export const handleMenuButtonPress = async (ctx: MyContext, buttonText: string): Promise<boolean> => {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id

  // Находим кнопку по тексту
  const button = NAVIGATION_BUTTONS.find(btn =>
    btn.ru === buttonText || btn.en === buttonText
  )

  if (!button) return false

  // Проверка админских прав
  if (button.admin_only && (!userId || !ADMIN_IDS_ARRAY.includes(userId))) {
    await ctx.reply(
      isRu
        ? '🔒 Эта функция доступна только администраторам'
        : '🔒 This feature is only available to administrators'
    )
    return true
  }

  // Проверка подписки
  if (button.requires_subscription) {
    const hasSubscription = await checkSubscriptionGuard(ctx, button.mode as string)
    if (!hasSubscription) return true // Пользователь перенаправлен в subscriptionScene
  }

  // Устанавливаем режим
  ctx.session.mode = button.mode as ModeEnum

  // Переходим в сцену
  await ctx.scene.enter(ModeEnum.CheckBalanceScene)

  return true
}

// ========================================
// 6. ПРАВА ДОСТУПА (из старого mainMenu.ts)
// ========================================

// 🤖 Массив сотрудников HaimGroupMedia_bot
export const HAIM_GROUP_STAFF_IDS = [
  '144022504', // @neuro_coder - Главный админ
  '289259562', // @Vyacheslav_Neklyudov
  '752224685', // @voskresenskaya13
  '7669741878', // @Arhustel
  '164609458', // @artemfisenko
  '1036512726', // Сотрудник
]

// 🤖 Массив сотрудников MetaMuse_Manifest_bot
export const METAMUSE_STAFF_IDS = [
  '144022504', // @neuro_coder
  '352374518',
  '1064902106',
  '7669741878', // @Arhustel (общий)
  '737300586',
  '447979523',
]

/**
 * Проверяет доступ к парсингу для конкретного бота
 */
export function getParsingAccess(
  userId: string,
  botToken: string
): {
  hasAccess: boolean
  allowedProjects?: string[]
} {
  const { bot_name } = getBotNameByToken(botToken)

  // 👑 Главный админ имеет доступ ко всем ботам
  if (userId === '144022504') {
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
      allowedProjects: hasAccess ? ['Coco Age', 'vyacheslav_nekludov'] : undefined,
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

// ========================================
// 7. ЭКСПОРТЫ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ
// ========================================

export const MAIN_MENU_BUTTONS = NAVIGATION_BUTTONS // Алиас
export const simpleLevels = NAVIGATION_BUTTONS // Алиас
export const simpleMainMenu = NAVIGATION_BUTTONS // Алиас

/**
 * 🔧 WRAPPER для обратной совместимости с двумя сигнатурами:
 * 1. Старая: mainMenu({ isRu, subscription, ctx })
 * 2. Новая: mainMenu(ctx)
 */
export function mainMenu(
  ctxOrOptions: MyContext | { isRu?: boolean; subscription?: any; ctx: MyContext }
) {
  // Определяем, какую сигнатуру использовали
  let ctx: MyContext

  if ('ctx' in ctxOrOptions) {
    // Старая сигнатура: { isRu, subscription, ctx }
    ctx = ctxOrOptions.ctx
    console.log('🔄 [mainMenu WRAPPER] Old signature detected, extracting ctx:', {
      telegramId: ctx.from?.id,
      hasIsRu: 'isRu' in ctxOrOptions,
      hasSubscription: 'subscription' in ctxOrOptions
    })
  } else {
    // Новая сигнатура: ctx напрямую
    ctx = ctxOrOptions
    console.log('✅ [mainMenu WRAPPER] New signature detected, using ctx directly:', {
      telegramId: ctx.from?.id
    })
  }

  // Вызываем новую функцию с правильным ctx
  return createMainMenuKeyboard(ctx)
}
