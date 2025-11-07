import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { ModeEnum } from '@/interfaces/modes'
import { ADMIN_IDS_ARRAY } from '@/config'
import { getBotNameByToken } from '@/core/bot'

// ✅ ПРОСТАЯ СИСТЕМА КНОПОК (вместо сложной levels)
// 🎯 ПОРЯДОК: Нейрофункции → Техподдержка → Язык → Оформить подписку + Пополнить баланс (ВНИЗУ!)
export const MAIN_MENU_BUTTONS = [
  // Основные ИИ функции
  { ru: '🤖 Цифровое тело', en: '🤖 Digital Body', mode: ModeEnum.DigitalAvatarBody },
  { ru: '📸 Нейрофото', en: '📸 NeuroPhoto', mode: ModeEnum.NeuroPhoto },
  { ru: '🔍 Промпт из фото', en: '🔍 Prompt from Photo', mode: 'prompt_from_photo' },
  { ru: '🧠 Мозг аватара', en: '🧠 Avatar Brain', mode: 'avatar_brain' },
  { ru: '💭 Чат с аватаром', en: '💭 Chat with avatar', mode: 'chat_with_avatar' },
  { ru: '🤖 Выбор модели ИИ', en: '🤖 Choose AI Model', mode: 'select_model' },
  { ru: '🎤 Голос аватара', en: '🎤 Avatar Voice', mode: 'voice_avatar' },
  { ru: '🎙️ Текст в голос', en: '🎙️ Text to Voice', mode: 'text_to_speech' },
  { ru: '🎥 Фото в видео', en: '🎥 Photo to Video', mode: 'image_to_video' },
  { ru: '🎥 Видео из текста', en: '🎥 Text to Video', mode: 'text_to_video' },
  { ru: '🖼️ Текст в фото', en: '🖼️ Text to Photo', mode: 'text_to_image' },
  { ru: '🎨 ИИ Фотошоп', en: '🎨 AI Photoshop', mode: 'ai_photoshop' },
  { ru: '🌀 Infinity Морфинг', en: '🌀 Infinity Morphing', mode: 'morphing' },
  { ru: '🎤 Синхронизация губ', en: '🎤 Lip Sync', mode: 'lip_sync', admin_only: true },
  { ru: '🎭 Замена лица', en: '🎭 Face Swap', mode: 'face_swap' },
  { ru: '⬆️ Увеличить качество фото', en: '⬆️ Upscale Photo Quality', mode: ModeEnum.ImageUpscaler },  // ✅ ДОБАВЛЕНО: Кнопка увеличения качества
  { ru: '🔍 Мониторинг конкурентов', en: '🔍 Competitor Monitoring', mode: 'competitor_monitoring', admin_only: true },
  { ru: '🦸‍♂️ ИИ Герои', en: '🦸‍♂️ AI Heroes', mode: 'ai_heroes' },
  { ru: '🎬 ИИ Рилс', en: '🎬 AI Reels', mode: 'ai_reels', admin_only: true },

  // Пригласить друга + Техподдержка
  { ru: '👥 Пригласить друга', en: '👥 Invite a friend', mode: 'invite' },
  { ru: '💬 Техподдержка', en: '💬 Tech Support', mode: 'tech_support' },

  // Кнопка языка
  { ru: '🌐 EN', en: '🌐 RU', mode: 'language' },

  // 💫 ОПЛАТА ВНИЗУ (ПО ТРЕБОВАНИЮ ПОЛЬЗОВАТЕЛЯ!)
  { ru: '💫 Оформить подписку', en: '💫 Subscribe', mode: 'subscription' },
  { ru: '💎 Пополнить баланс', en: '💎 Top up balance', mode: 'top_up' },

  // Баланс отдельной строкой под оплатой
  { ru: '💰 Баланс', en: '💰 Balance', mode: 'balance' },
]

// ✅ ПРОСТАЯ ФУНКЦИЯ СОЗДАНИЯ МЕНЮ
export const createMainMenuKeyboard = (ctx: MyContext) => {
  const isRu = isRussianFromState(ctx)
  const buttons = MAIN_MENU_BUTTONS.map(btn => 
    isRu ? btn.ru : btn.en
  )

  // Создаем клавиатуру с кнопками (по 2 в ряд)
  const keyboard = []
  for (let i = 0; i < buttons.length; i += 2) {
    const row = [buttons[i]]
    if (buttons[i + 1]) {
      row.push(buttons[i + 1])
    }
    keyboard.push(row)
  }

  return Markup.keyboard(keyboard).resize()
}

// ✅ ПРОСТАЯ ФУНКЦИЯ ОБРАБОТКИ НАЖАТИЯ КНОПКИ
export const handleMenuButtonPress = async (ctx: MyContext, buttonText: string) => {
  const isRu = isRussianFromState(ctx)
  const button = MAIN_MENU_BUTTONS.find(btn => 
    btn.ru === buttonText || btn.en === buttonText
  )

  if (!button) return false

  // Проверка админских прав
  if (button.admin_only) {
    const isAdmin = ctx.from?.id && ADMIN_IDS_ARRAY?.includes(ctx.from.id)
    if (!isAdmin) {
      await ctx.reply(isRu ? '🔒 Эта функция доступна только администраторам' : '🔒 This feature is only available to administrators')
      return true
    }
  }

  // Проверка подписки (если требуется)
  const requiresSubscription = ['morphing', 'ai_heroes', 'competitor_monitoring', 'ai_reels'].includes(button.mode)
  if (requiresSubscription) {
    const hasSubscription = await checkSubscriptionGuard(ctx, button.mode)
    if (!hasSubscription) return true // Пользователь перенаправлен в subscriptionScene
  }

  // Переход в сцену
  if (typeof button.mode === 'string') {
    // Для строковых модов (старые)
    ctx.session.mode = button.mode
  } else {
    // Для ModeEnum
    ctx.session.mode = button.mode as ModeEnum
  }

  await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  return true
}

// Экспорт для обратной совместимости (другие имена)
export const simpleLevels = MAIN_MENU_BUTTONS
export const simpleMainMenu = MAIN_MENU_BUTTONS

// ========================================
// КОНСТАНТЫ ИЗ СТАРОГО mainMenu.ts
// ========================================

// 🤖 Массив сотрудников HaimGroupMedia_bot (ограниченный доступ к парсингу)
export const HAIM_GROUP_STAFF_IDS = [
  '144022504', // @neuro_coder - Главный админ и владелец проекта ID 37
  '289259562', // @Vyacheslav_Neklyudov - Админ
  '752224685', // @voskresenskaya13 - Админ
  '7669741878', // @Arhustel - Админ
  '164609458', // @artemfisenko - Админ
  '1036512726', // Сотрудник - Полный доступ к ИИ Рилс
]

// 🤖 Массив сотрудников MetaMuse_Manifest_bot (полный доступ к парсингу)
export const METAMUSE_STAFF_IDS = [
  '144022504', // @neuro_coder - Админ
  '352374518', // Админ
  '1064902106', // Админ
  '7669741878', // @Arhustel - Админ (общий)
  '737300586', // Админ
  '447979523', // Админ
]

// 🔍 Функция определения доступа к парсингу
export function getParsingAccess(
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
      allowedProjects: hasAccess ? ['all'] : undefined,
    }
  }

  // 🚫 Для остальных ботов - нет доступа к парсингу
  return {
    hasAccess: false,
  }
}

// ========================================
// ОБЁРТКА ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ С levels[]
// ========================================

// Создаём объект levels из MAIN_MENU_BUTTONS для обратной совместимости
export const levels: Record<number, { title_ru: string; title_en: string; admin_only?: boolean }> = {}

MAIN_MENU_BUTTONS.forEach((btn, index) => {
  levels[index + 1] = {
    title_ru: btn.ru,
    title_en: btn.en,
    admin_only: btn.admin_only
  }
})

// Добавляем служебные кнопки (100+)
levels[100] = { title_ru: '💎 Пополнить баланс', title_en: '💎 Top up balance' }
levels[101] = { title_ru: '💰 Баланс', title_en: '💰 Balance' }
levels[102] = { title_ru: '👥 Пригласить друга', title_en: '👥 Invite a friend' }
levels[103] = { title_ru: '💬 Техподдержка', title_en: '💬 Support' }
levels[104] = { title_ru: '🏠 Главное меню', title_en: '🏠 Main menu' }
levels[105] = { title_ru: '💫 Оформить подписку', title_en: '💫 Subscribe' }
levels[106] = { title_ru: '🌐 EN', title_en: '🌐 RU' }

// ✅ Функция mainMenu для обратной совместимости (теперь использует simpleMenu)
export const mainMenu = createMainMenuKeyboard
