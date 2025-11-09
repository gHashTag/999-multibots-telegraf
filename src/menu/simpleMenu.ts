<<<<<<< HEAD
import { Markup } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { ModeEnum } from '@/interfaces/modes'
import { ADMIN_IDS_ARRAY } from '@/config'

// ✅ ПРОСТАЯ СИСТЕМА КНОПОК (вместо сложной levels)
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

  // Сервисные кнопки
  { ru: '💎 Пополнить баланс', en: '💎 Top up balance', mode: 'top_up' },
  { ru: '⚙️ Настройки', en: '⚙️ Settings', mode: 'settings' },
  { ru: '📊 Статистика', en: '📊 Statistics', mode: 'statistics' },
  { ru: '💬 Техподдержка', en: '💬 Tech Support', mode: 'tech_support' },
  { ru: '🏷️ Промо', en: '🏷️ Promo', mode: 'promo' },
  { ru: '💫 Оформить подписку', en: '💫 Subscribe', mode: 'subscription' },
  { ru: '💰 Анализ расходов', en: '💰 Expense Analysis', mode: 'expense_analysis' },
  { ru: '🔍 Мониторинг конкурентов', en: '🔍 Competitor Monitoring', mode: 'competitor_monitoring' },
  { ru: '🦸‍♂️ ИИ Герои', en: '🦸‍♂️ AI Heroes', mode: 'ai_heroes' },
  { ru: '🎬 ИИ Рилс', en: '🎬 AI Reels', mode: 'ai_reels' },
  { ru: 'ℹ️ Справка', en: 'ℹ️ Help', mode: 'help' },
  { ru: '🎯 Улучшение промпта', en: '🎯 Prompt Improvement', mode: 'prompt_improvement' },
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
=======
/**
 * ⚠️ DEPRECATED: Этот файл оставлен для обратной совместимости
 *
 * ✅ НОВЫЙ ИСТОЧНИК ПРАВДЫ: src/navigation/unified-navigation.config.ts
 *
 * Все новые импорты должны быть из:
 * import { ... } from '@/navigation/unified-navigation.config'
 *
 * Этот файл просто реэкспортирует из нового конфига для обратной совместимости
 */

// ✅ ПРОСТОЕ РЕШЕНИЕ: Реэкспортируем всё напрямую без алиасов
export * from '@/navigation/unified-navigation.config'
>>>>>>> origin/production
