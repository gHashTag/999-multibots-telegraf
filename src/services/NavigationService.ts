/**
 * 🎯 ЕДИНЫЙ СЕРВИС НАВИГАЦИИ
 *
 * Этот модуль централизованно управляет ВСЕЙ навигацией бота:
 * - Структура меню (категории и функции)
 * - Регистрация обработчиков (hears, actions)
 * - Переходы между сценами
 * - Проверки прав доступа
 * - Генерация клавиатур
 *
 * ⚠️ ВСЯ навигация должна работать через этот модуль!
 * НЕ создавайте обработчики в других местах!
 */

import { Telegraf, Markup } from 'telegraf'
import type { ReplyKeyboardMarkup } from 'telegraf/types'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'
import { getBotNameByToken } from '@/core/bot'
import { getReferalsCountAndUserData } from '@/core/supabase'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { categoryScenes } from '@/scenes/categoryScenes'

// ✅ ДЛЯ ОБРАТНОЙ СОВМЕСТИСТИ - экспортируем levels из старой системы
// Это нужно для файлов, которые импортируют levels из simpleMenu.ts
export interface Level {
  title_ru: string
  title_en: string
  admin_only?: boolean
}

export const levels: Record<number, Level> = {
  1: { title_ru: '🤖 Цифровое тело', title_en: '🤖 Digital Body' },
  2: { title_ru: '📸 Нейрофото', title_en: '📸 NeuroPhoto' },
  3: { title_ru: '🔍 Промпт из фото', title_en: '🔍 Prompt from Photo' },
  4: { title_ru: '🧠 Мозг аватара', title_en: '🧠 Avatar Brain' },
  5: { title_ru: '💭 Чат с аватаром', title_en: '💭 Chat with avatar' },
  6: { title_ru: '🤖 Выбор модели ИИ', title_en: '🤖 Choose AI Model' },
  7: { title_ru: '🎤 Голос аватара', title_en: '🎤 Avatar Voice' },
  8: { title_ru: '🎙️ Текст в голос', title_en: '🎙️ Text to Voice' },
  9: { title_ru: '🎥 Фото в видео', title_en: '🎥 Photo to Video' },
  10: { title_ru: '🎥 Видео из текста', title_en: '🎥 Text to Video' },
  11: { title_ru: '🖼️ Текст в фото', title_en: '🖼️ Text to Photo' },
  12: { title_ru: '🎨 ИИ Фотошоп', title_en: '🎨 AI Photoshop' },
  13: { title_ru: '🌀 Infinity Морфинг', title_en: '🌀 Infinity Morphing' },
  14: {
    title_ru: '🎤 Синхронизация губ',
    title_en: '🎤 Lip Sync',
    admin_only: true,
  },
  15: { title_ru: '🎭 Замена лица', title_en: '🎭 Face Swap' },
  16: {
    title_ru: '⬆️ Увеличить качество фото',
    title_en: '⬆️ Upscale Photo Quality',
  },
  17: { title_ru: '💬 Техподдержка', title_en: '💬 Support' },
  100: { title_ru: '💎 Пополнить баланс', title_en: '💎 Top up balance' },
  101: { title_ru: '💰 Баланс', title_en: '💰 Balance' },
  102: { title_ru: '👥 Пригласить друга', title_en: '👥 Invite a friend' },
  103: { title_ru: '💬 Техподдержка', title_en: '💬 Support' },
  104: { title_ru: '🏠 Главное меню', title_en: '🏠 Main menu' },
  105: { title_ru: '💫 Оформить подписку', title_en: '💫 Subscribe' },
  106: { title_ru: '🌐 EN', title_en: '🌐 RU' },
  108: { title_ru: '📺 Транскрибация Reels', title_en: '📺 Transcribe Reels' },
}

// ✅ ДЛЯ ОБРАТНОЙ СОВМЕСТИМОСТИ - mainMenu
export const mainMenu = {
  levels,
}

import { generateNeuroPhotoHybrid } from '@/services/generateNeuroPhotoHybrid'
import { getUserProfileAndSettings } from '@/db/userSettings'
import { getUserData } from '@/core/supabase'
import {
  handleFluxKontextModelSelection,
  handleFluxKontextImage,
} from '@/commands/fluxKontextCommand'
import { defaultSession } from '@/store'
import { Scenes } from 'telegraf'
import { message } from 'telegraf/filters'
import { SubscriptionType as SubscriptionTypeEnum } from '@/interfaces/subscription.interface'
import { getUserDetailsSubscription } from '@/core/supabase'
import { getUserInfo } from '@/handlers/getUserInfo'
import { handleRestartVideoGeneration } from '@/handlers/handleVideoRestart'
import { handleVideoStatusUpdate } from '@/handlers/handleTextToVideoDirect'
import { sendMediaToPulse } from '@/helpers/pulse'
import { handleHelloWorld } from '@/commands/handleHelloWorld'
import { priceCommand } from '@/commands/priceCommand'
import { setupInteractiveStats } from '@/commands/interactiveStatsCommand'
import {
  handleAddBalanceCommand,
  handleCheckBalanceCommand,
} from '@/handlers/adminCommands'
import expenseAnalysisCommand from '@/commands/expenseAnalysisCommand'
import { setupAutoFixerCommands } from '@/commands/autofixer/autofixer.command'
import { autoFixerConfigScene } from '@/commands/autofixer/autofixer-config.scene'
import { requireAdmin } from '@/middleware/adminOnly'
import { setupAutonomousMonitor } from '@/commands/autonomousMonitor'
import { registerMultiPhotoActions } from '@/handlers/multiPhotoActions'
import { handleHelpCommand } from '@/commands/helpCommand'
import { get100Command } from '@/commands/get100Command'
import { handleTechSupport } from '@/commands/handleTechSupport'
import { handleBuy } from '@/handlers/handleBuy'
import { handleCancelButton } from '@/services/CancelButtonService'
import { registerPaymentActions } from '@/handlers/paymentActions'
import {
  avatarBrainWizard,
  textToVideoWizard,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  imageToPromptWizard,
  imageUpscalerWizard,
  faceSwapWizard,
  improvePromptWizard,
  sizeWizard,
  textToImageWizard,
  imageToVideoWizard,
  cancelPredictionsWizard,
  trainFluxModelWizard,
  uploadTrainFluxModelScene,
  digitalAvatarBodyWizard,
  digitalAvatarBodyWizardV2,
  selectModelWizard,
  voiceAvatarWizard,
  textToSpeechWizard,
  paymentScene,
  rublePaymentScene,
  starPaymentScene,
  levelQuestWizard,
  neuroCoderScene,
  lipSyncWizard,
  veedFabricWizard,
  aiReelsWizard,
  aiReelsEntryWizard,
  aiReelsRenderWizard,
  hedraRenderWizard,
  heygenRenderWizard,
  falRenderWizard,
  startScene,
  chatWithAvatarWizard,
  helpScene,
  balanceScene,
  menuScene,
  subscriptionScene,
  inviteScene,
  getRuBillWizard,
  subscriptionCheckScene,
  createUserScene,
  checkBalanceScene,
  uploadVideoScene,
  videoTranscriptionWizard,
  aiPhotoshopScene,
  avatarTransformScene,
  instagramScrapingWizard,
  instagramParserScene,
  instagramParserWizard,
  morphingWizard,
} from '@/scenes'

// ========================================
// 1. ТИПЫ И ИНТЕРФЕЙСЫ
// ========================================

export interface NavigationItem {
  /** Текст кнопки на русском */
  ru: string
  /** Текст кнопки на английском */
  en: string
  /** Режим/сцена для перехода */
  mode: string | ModeEnum
  /** Категория (для группировки) */
  category:
    | 'photo'
    | 'video'
    | 'audio'
    | 'avatars'
    | 'tools'
    | 'profile'
    | 'category'
  /** Иконка */
  icon: string
  /** Требует подписку */
  requiresSubscription?: boolean
  /** Только для админов */
  adminOnly?: boolean
  /** Прямой переход (без CheckBalanceScene) */
  directScene?: boolean
}

export interface CategoryConfig {
  /** ID категории */
  id: string
  /** Название категории */
  ru: string
  en: string
  /** Иконка */
  icon: string
  /** Функции в этой категории */
  items: NavigationItem[]
}

// ========================================
// 2. СТРУКТУРА НАВИГАЦИИ
// ========================================

/**
 * КАТЕГОРИИ УРОВНЯ 1 (Главное меню)
 */
export const CATEGORIES: CategoryConfig[] = [
  {
    id: 'photo',
    ru: '📸 Фото',
    en: '📸 Photo',
    icon: '📸',
    items: [
      {
        ru: '📸 Нейрофото',
        en: '📸 NeuroPhoto',
        mode: ModeEnum.NeuroPhoto,
        category: 'photo',
        icon: '📸',
        requiresSubscription: true,
      },
      {
        ru: '🖼️ Текст в фото',
        en: '🖼️ Text to Photo',
        mode: ModeEnum.TextToImage,
        category: 'photo',
        icon: '🖼️',
        requiresSubscription: true,
      },
      {
        ru: '🔍 Промпт из фото',
        en: '🔍 Prompt from Photo',
        mode: ModeEnum.ImageToPrompt,
        category: 'photo',
        icon: '🔍',
        requiresSubscription: true,
      },
      {
        ru: '🎨 ИИ Фотошоп',
        en: '🎨 AI Photoshop',
        mode: 'ai_photoshop',
        category: 'photo',
        icon: '🎨',
        requiresSubscription: true,
        directScene: true,
      },
      {
        ru: '⬆️ Увеличить качество',
        en: '⬆️ Upscale Quality',
        mode: ModeEnum.ImageUpscaler,
        category: 'photo',
        icon: '⬆️',
        requiresSubscription: true,
      },
      {
        ru: '🎭 Замена лица',
        en: '🎭 Face Swap',
        mode: 'face_swap',
        category: 'photo',
        icon: '🎭',
        requiresSubscription: true,
      },
      {
        ru: '🌀 Infinity Морфинг',
        en: '🌀 Infinity Morphing',
        mode: 'morphing',
        category: 'photo',
        icon: '🌀',
        requiresSubscription: true,
      },
    ],
  },
  {
    id: 'video',
    ru: '🎥 Видео',
    en: '🎥 Video',
    icon: '🎥',
    items: [
      {
        ru: '🎥 Видео из текста',
        en: '🎥 Text to Video',
        mode: ModeEnum.TextToVideo,
        category: 'video',
        icon: '🎥',
        requiresSubscription: true,
      },
      {
        ru: '🎥 Фото в видео',
        en: '🎥 Photo to Video',
        mode: ModeEnum.ImageToVideo,
        category: 'video',
        icon: '🎥',
        requiresSubscription: true,
      },
      {
        ru: '🎬 ИИ Рилс',
        en: '🎬 AI Reels',
        mode: 'ai_reels',
        category: 'video',
        icon: '🎬',
        requiresSubscription: true,
      },
      {
        ru: '🎤 Синхронизация губ',
        en: '🎤 Lip Sync',
        mode: 'lip_sync',
        category: 'video',
        icon: '🎤',
        requiresSubscription: true,
        adminOnly: true,
      },
    ],
  },
  {
    id: 'audio',
    ru: '🎙️ Аудио',
    en: '🎙️ Audio',
    icon: '🎙️',
    items: [
      {
        ru: '🎤 Голос аватара',
        en: '🎤 Avatar Voice',
        mode: ModeEnum.Voice,
        category: 'audio',
        icon: '🎤',
        requiresSubscription: true,
      },
      {
        ru: '🎙️ Текст в голос',
        en: '🎙️ Text to Speech',
        mode: ModeEnum.TextToSpeech,
        category: 'audio',
        icon: '🎙️',
        requiresSubscription: true,
      },
      {
        ru: '📺 Транскрибация',
        en: '📺 Transcription',
        mode: ModeEnum.VideoTranscription,
        category: 'audio',
        icon: '📺',
        requiresSubscription: true,
      },
    ],
  },
  {
    id: 'avatars',
    ru: '🤖 Аватары',
    en: '🤖 Avatars',
    icon: '🤖',
    items: [
      {
        ru: '🤖 Цифровое тело',
        en: '🤖 Digital Body',
        mode: ModeEnum.DigitalAvatarBody,
        category: 'avatars',
        icon: '🤖',
        requiresSubscription: true,
      },
      {
        ru: '🧠 Мозг аватара',
        en: '🧠 Avatar Brain',
        mode: ModeEnum.Avatar,
        category: 'avatars',
        icon: '🧠',
        requiresSubscription: true,
      },
      {
        ru: '💭 Чат с аватаром',
        en: '💭 Chat with Avatar',
        mode: ModeEnum.ChatWithAvatar,
        category: 'avatars',
        icon: '💭',
        requiresSubscription: true,
      },
      {
        ru: '🤖 Выбор модели ИИ',
        en: '🤖 Choose AI Model',
        mode: ModeEnum.SelectModel,
        category: 'avatars',
        icon: '🤖',
        requiresSubscription: true,
      },
    ],
  },
  {
    id: 'tools',
    ru: '🛠️ Инструменты',
    en: '🛠️ Tools',
    icon: '🛠️',
    items: [
      {
        ru: '🦸‍♂️ ИИ Герои',
        en: '🦸‍♂️ AI Heroes',
        mode: 'ai_heroes',
        category: 'tools',
        icon: '🦸‍♂️',
        requiresSubscription: true,
      },
      {
        ru: '🔍 Мониторинг конкурентов',
        en: '🔍 Competitor Monitoring',
        mode: 'competitor_monitoring',
        category: 'tools',
        icon: '🔍',
        requiresSubscription: true,
        adminOnly: true,
      },
      {
        ru: '🔍 Парсинг Instagram',
        en: '🔍 Instagram Parsing',
        mode: ModeEnum.InstagramScrapingWizard,
        category: 'tools',
        icon: '🔍',
        adminOnly: true,
      },
    ],
  },
  {
    id: 'profile',
    ru: '👤 Профиль',
    en: '👤 Profile',
    icon: '👤',
    items: [
      {
        ru: '💰 Баланс',
        en: '💰 Balance',
        mode: ModeEnum.Balance,
        category: 'profile',
        icon: '💰',
        requiresSubscription: true,
      },
      {
        ru: '💎 Пополнить баланс',
        en: '💎 Top up Balance',
        mode: ModeEnum.TopUpBalance,
        category: 'profile',
        icon: '💎',
        requiresSubscription: true,
      },
      {
        ru: '💫 Оформить подписку',
        en: '💫 Subscribe',
        mode: ModeEnum.SubscriptionScene,
        category: 'profile',
        icon: '💫',
        directScene: true,
      },
      {
        ru: '👥 Пригласить друга',
        en: '👥 Invite Friend',
        mode: ModeEnum.Invite,
        category: 'profile',
        icon: '👥',
      },
      {
        ru: '💬 Техподдержка',
        en: '💬 Tech Support',
        mode: ModeEnum.Help,
        category: 'profile',
        icon: '💬',
        directScene: true,
      },
      {
        ru: '🌐 Язык',
        en: '🌐 Language',
        mode: 'language',
        category: 'profile',
        icon: '🌐',
      },
    ],
  },
]

// ========================================
// 3. ФУНКЦИИ НАВИГАЦИИ
// ========================================

/**
 * Инициализация навигации и регистрация всех обработчиков
 * ✅ ЕДИНАЯ ТОЧКА ВХОДА для всей навигации бота
 *
 * Эта функция регистрирует:
 * - Команды бота (/start, /menu, /help)
 * - Глобальные middleware (перехватчики навигации)
 * - Обработчики категорий (hears)
 * - Обработчики функций (hears)
 * - Обработчики профиля (hears) - включая реферальную систему
 * - Глобальные обработчики (hears) - Главное меню, Назад, Справка
 * - Action-обработчики (callback_query) - go_main_menu и т.д.
 * - Специальные обработчики (Сгенерировать еще, Улучшить промт и т.д.)
 */
export function initializeNavigation(
  bot: Telegraf<MyContext>,
  options?: { skipGlobalMiddleware?: boolean }
): void {
  try {
    logger.info('🎯 [NavigationService] Initializing navigation service...')

    // 1. Регистрируем глобальные middleware (перехватчики навигации)
    // ⚠️ ВАЖНО: Если skipGlobalMiddleware=true, пропускаем регистрацию (уже зарегистрирован в registerCommands)
    if (!options?.skipGlobalMiddleware) {
      registerGlobalNavigationMiddleware(bot)
    } else {
      logger.info(
        '⏭️ [NavigationService] Skipping global middleware registration (already registered)'
      )
    }

    // 2. Регистрируем команды бота
    registerNavigationCommands(bot)

    // 3. Регистрируем все обработчики
    registerCategoryHandlers(bot)
    registerFunctionHandlers(bot)
    registerProfileHandlers(bot) // Специальные обработчики для профиля (включая реферальную систему)
    registerGlobalHandlers(bot)
    registerNavigationActions(bot) // Action-обработчики навигации
    registerSpecialHandlers(bot) // Специальные обработчики (Сгенерировать еще, Улучшить промт и т.д.)

    logger.info(
      '✅ [NavigationService] Navigation service initialized successfully'
    )
  } catch (error) {
    logger.error('❌ [NavigationService] Error during initialization:', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    throw error
  }
}

/**
 * Получить все сцены категорий для регистрации в Stage
 * ✅ Экспортируем для использования в registerCommands.ts
 */
export function getCategoryScenes() {
  return categoryScenes
}

/**
 * Регистрация глобальных middleware для навигации
 * Перехватывает кнопки "Главное меню" и "Отмена" ДО stage.middleware
 */
function registerGlobalNavigationMiddleware(bot: Telegraf<MyContext>): void {
  bot.use(async (ctx, next) => {
    if (ctx.message && 'text' in ctx.message) {
      const rawText = ctx.message.text || ''
      const text = rawText.trim()

      // ✅ СПЕЦИАЛЬНЫЙ ЛОГ ДЛЯ ОТЛАДКИ ПЛАТЕЖЕЙ
      if (text === '💳 Рублями' || text === '💳 Rubles') {
        logger.info('🔍 [PAYMENT DEBUG] Rubles button in global middleware', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
          rawText,
          willCallNext: true,
        })
      }

      logger.info('🛰 [NavigationService] Global middleware - text message', {
        telegramId: ctx.from?.id,
        currentScene: ctx.scene?.current?.id,
        rawText,
      })

      // Глобальная кнопка "Главное меню" - работает ВЕЗДЕ
      if (text === '🏠 Главное меню' || text === '🏠 Main menu') {
        logger.info('🔥 [NavigationService] Main Menu pressed (middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })
        try {
          await ctx.scene.leave()
          await showMainMenu(ctx)
          // ✅ КРИТИЧЕСКИ ВАЖНО: Останавливаем дальнейшую обработку ДАЖЕ при ошибке
          return // Останавливаем дальнейшую обработку
        } catch (error) {
          logger.error(
            '❌ [NavigationService] Error in main menu middleware:',
            {
              error,
              telegramId: ctx.from?.id,
            }
          )
          // ✅ КРИТИЧЕСКИ ВАЖНО: При ошибке тоже останавливаем обработку, чтобы избежать двойного вызова
          return // Останавливаем дальнейшую обработку даже при ошибке
        }
      }

      // Глобальная кнопка "Отмена" - работает ВЕЗДЕ
      if (text === 'Отмена' || text === 'Cancel') {
        // Если мы в сцене chat_with_avatar — даём сцене самой обработать отмену
        if (ctx.scene?.current?.id === ModeEnum.ChatWithAvatar) {
          logger.info(
            '🔥 [NavigationService] Cancel pressed in chat_with_avatar - delegating to scene',
            {
              telegramId: ctx.from?.id,
              currentScene: ctx.scene?.current?.id,
            }
          )
          return next()
        }

        logger.info('🔥 [NavigationService] Cancel pressed (middleware)', {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
        })
        try {
          const { handleCancelButton } = await import(
            '@/services/CancelButtonService'
          )
          const handled = await handleCancelButton(ctx as any)
          if (handled) {
            return // Останавливаем дальнейшую обработку
          }
        } catch (error) {
          logger.error('❌ [NavigationService] Error in cancel middleware:', {
            error,
            telegramId: ctx.from?.id,
          })
        }
      }
    }

    return next()
  })

  logger.info('✅ [NavigationService] Registered global navigation middleware')
}

/**
 * Регистрация команд бота (/start, /menu, /help)
 */
function registerNavigationCommands(bot: Telegraf<MyContext>): void {
  // Команда /start
  bot.command('start', async ctx => {
    if (ctx.chat.type !== 'private') {
      return // Игнорируем в группах
    }

    const telegramId = ctx.from?.id?.toString() || 'unknown'

    logger.info('🚀 [NavigationService] /start command', {
      telegramId: ctx.from?.id,
      chatType: ctx.chat.type,
    })

    // Защита от спама команд /start
    const now = Date.now()
    const lastStartTime = (ctx.session as any).lastStartCommand || 0
    const timeDiff = now - lastStartTime
    const minInterval = 2000 // 2 секунды минимум между командами /start

    if (timeDiff < minInterval) {
      logger.info('🚫 [NavigationService] Start command spam detected', {
        telegramId,
        timeDiff,
      })
      return
    }

    // Обновляем время последней команды /start
    ;(ctx.session as any).lastStartCommand = now

    try {
      // При старте всегда сбрасываем сессию
      ctx.session = { ...defaultSession }
      logger.info('✅ [NavigationService] Session reset')

      // ВАЖНО: Извлекаем реферальный код из команды /start
      if (ctx.message && 'text' in ctx.message) {
        const parts = ctx.message.text.split(' ')
        if (parts.length > 1) {
          const startParam = parts[1]
          logger.info('📝 [NavigationService] Start parameter detected', {
            startParam,
          })

          // Проверяем, не промо ли это
          const { extractPromoFromContext } = await import(
            '@/helpers/contextUtils'
          )
          const promoInfo = extractPromoFromContext(ctx)

          if (!promoInfo?.isPromo && /^\d+$/.test(startParam)) {
            // Это реферальный код (только цифры)
            ctx.session.inviteCode = startParam
            logger.info('🔗 [NavigationService] Referral code set', {
              startParam,
            })
          }
        }
      }

      await ctx.scene.leave() // Явно выходим из любой сцены

      // Проверяем, существует ли пользователь
      const { getUserDetailsSubscription } = await import('@/core/supabase')
      const userDetails = await getUserDetailsSubscription(telegramId)

      if (!userDetails.isExist) {
        // Если пользователь не существует, сначала создаем его
        logger.info('🆕 [NavigationService] User does not exist, creating', {
          telegramId,
          inviteCode: ctx.session.inviteCode || 'none',
        })
        await ctx.scene.enter(ModeEnum.CreateUserScene)
      } else {
        // Если пользователь существует, переходим в startScene
        logger.info('✅ [NavigationService] User exists, entering startScene', {
          telegramId,
          userId: userDetails.id,
        })
        await ctx.scene.enter('startScene')
      }
    } catch (error) {
      logger.error('❌ [NavigationService] Error in /start command:', {
        error,
        telegramId,
      })
    }
  })

  // Команда /menu
  bot.command('menu', async ctx => {
    if (ctx.chat.type !== 'private') {
      return // Игнорируем в группах
    }

    logger.info('📋 [NavigationService] /menu command', {
      telegramId: ctx.from?.id,
    })

    try {
      await ctx.scene.leave() // Выходим из текущей, если есть
      await showMainMenu(ctx)
    } catch (error) {
      logger.error('❌ [NavigationService] Error in /menu command:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Команда /help
  bot.command('help', async ctx => {
    if (ctx.chat.type !== 'private') {
      return // Игнорируем в группах
    }

    logger.info('❓ [NavigationService] /help command', {
      telegramId: ctx.from?.id,
    })

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.Help)
    } catch (error) {
      logger.error('❌ [NavigationService] Error in /help command:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  logger.info('✅ [NavigationService] Registered navigation commands')
}

/**
 * Регистрация обработчиков категорий (уровень 1)
 */
function registerCategoryHandlers(bot: Telegraf<MyContext>): void {
  logger.info(
    `🎯 [registerCategoryHandlers] Registering handlers for ${CATEGORIES.length} categories`
  )

  CATEGORIES.forEach(category => {
    logger.info(
      `🎯 [registerCategoryHandlers] Registering handler for category: ${category.id} (${category.ru})`
    )

    // Обработчик для входа в категорию
    bot.hears([category.ru, category.en], async ctx => {
      logger.info(`🎯 [NavigationService] Category selected: ${category.id}`, {
        telegramId: ctx.from?.id,
        categoryId: category.id,
        categoryRu: category.ru,
        categoryEn: category.en,
      })

      try {
        await ctx.scene.leave()
        await showCategoryMenu(ctx, category.id)
      } catch (error) {
        logger.error(
          `❌ [NavigationService] Error showing category ${category.id}:`,
          {
            error: error instanceof Error ? error.message : String(error),
            stack: error instanceof Error ? error.stack : undefined,
            telegramId: ctx.from?.id,
          }
        )
      }
    })
  })

  logger.info(
    `✅ [NavigationService] Registered ${CATEGORIES.length} category handlers`
  )
}

/**
 * Регистрация обработчиков функций (уровень 2)
 * ⚠️ ИСКЛЮЧАЕМ обработчики профиля - они регистрируются отдельно
 */
function registerFunctionHandlers(bot: Telegraf<MyContext>): void {
  let registeredCount = 0

  CATEGORIES.forEach(category => {
    // Пропускаем категорию профиля - она обрабатывается отдельно
    if (category.id === 'profile') {
      return
    }

    category.items.forEach(item => {
      // Обработчик для функции
      bot.hears([item.ru, item.en], async ctx => {
        logger.info(`🎯 [NavigationService] Function selected: ${item.ru}`, {
          telegramId: ctx.from?.id,
          mode: item.mode,
        })

        try {
          await handleFunctionNavigation(ctx, item)
        } catch (error) {
          logger.error(
            `❌ [NavigationService] Error navigating to ${item.mode}:`,
            {
              error,
              telegramId: ctx.from?.id,
            }
          )
        }
      })

      registeredCount++
    })
  })

  logger.info(
    `✅ [NavigationService] Registered ${registeredCount} function handlers (excluding profile)`
  )
}

/**
 * Регистрация обработчиков для специальных кнопок профиля
 * (Баланс, Пополнить баланс, Подписка, Пригласить друга, Техподдержка, Язык)
 */
function registerProfileHandlers(bot: Telegraf<MyContext>): void {
  const profileCategory = CATEGORIES.find(cat => cat.id === 'profile')
  if (!profileCategory) {
    logger.warn('⚠️ [NavigationService] Profile category not found')
    return
  }

  profileCategory.items.forEach(item => {
    // Специальная обработка для кнопки "Пригласить друга" (реферальная система)
    if (item.mode === ModeEnum.Invite) {
      bot.hears([item.ru, item.en], async ctx => {
        logger.info(`👥 [NavigationService] Invite friend pressed`, {
          telegramId: ctx.from?.id,
          mode: item.mode,
        })

        try {
          // Реферальная система доступна всем пользователям (без проверки подписки)
          ctx.session.mode = ModeEnum.Invite
          await ctx.scene.enter(ModeEnum.CheckBalanceScene)
          logger.info(
            '✅ [NavigationService] Successfully entered Invite scene',
            {
              telegramId: ctx.from?.id,
            }
          )
        } catch (error) {
          logger.error(`❌ [NavigationService] Error handling ${item.ru}:`, {
            error,
            telegramId: ctx.from?.id,
          })
          const isRu = isRussianFromState(ctx)
          await ctx.reply(
            isRu
              ? '❌ Произошла ошибка. Попробуйте позже.'
              : '❌ An error occurred. Please try again.'
          )
        }
      })
      return
    }

    // Специальная обработка для кнопки "Техподдержка"
    if (item.mode === ModeEnum.Help && item.ru === '💬 Техподдержка') {
      bot.hears([item.ru, item.en], async ctx => {
        logger.info(`💬 [NavigationService] Tech Support pressed`, {
          telegramId: ctx.from?.id,
          mode: item.mode,
        })

        try {
          await ctx.scene.leave()
          await handleTechSupport(ctx)
          logger.info(
            '✅ [NavigationService] Tech Support handler executed successfully',
            {
              telegramId: ctx.from?.id,
            }
          )
        } catch (error) {
          logger.error(`❌ [NavigationService] Error handling ${item.ru}:`, {
            error,
            telegramId: ctx.from?.id,
          })
          const isRu = isRussianFromState(ctx)
          await ctx.reply(
            isRu
              ? '❌ Произошла ошибка. Попробуйте позже.'
              : '❌ An error occurred. Please try again.'
          )
        }
      })
      return
    }

    // Специальная обработка для кнопок баланса и пополнения
    if (item.mode === ModeEnum.Balance || item.mode === ModeEnum.TopUpBalance) {
      bot.hears([item.ru, item.en], async ctx => {
        logger.info(`🔍 [PAYMENT DEBUG] 💰 [NavigationService] ${item.ru} pressed`, {
          telegramId: ctx.from?.id,
          mode: item.mode,
          currentScene: ctx.scene?.current?.id,
          hasScene: !!ctx.scene?.current,
        })

        try {
          const telegramId = ctx.from?.id?.toString() || ''
          logger.info(`🔍 [PAYMENT DEBUG] Getting user subscription data...`, {
            telegramId: ctx.from?.id,
          })
          const { subscriptionType } =
            await getReferalsCountAndUserData(telegramId)
          const isRu = isRussianFromState(ctx)
          
          logger.info(`🔍 [PAYMENT DEBUG] Subscription check result:`, {
            telegramId: ctx.from?.id,
            subscriptionType,
            hasSubscription: !!subscriptionType && subscriptionType !== SubscriptionType.STARS,
          })

          if (
            !subscriptionType ||
            subscriptionType === SubscriptionType.STARS
          ) {
            // Пользователь без подписки
            const message =
              item.mode === ModeEnum.TopUpBalance
                ? isRu
                  ? '❌ <b>Пополнение баланса недоступно без подписки</b>\n\n' +
                    '💳 Функция пополнения баланса доступна только для пользователей с активной подпиской.\n\n' +
                    '📋 <b>Доступные тарифы:</b>\n' +
                    '• NEUROPHOTO - работа с фото и изображениями\n' +
                    '• NEUROVIDEO - все функции включая видео\n\n' +
                    '💫 Нажмите "Оформить подписку" в главном меню для выбора тарифа'
                  : '❌ <b>Balance top-up is not available without subscription</b>\n\n' +
                    '💳 The balance top-up feature is only available for users with an active subscription.\n\n' +
                    '📋 <b>Available plans:</b>\n' +
                    '• NEUROPHOTO - photo and image features\n' +
                    '• NEUROVIDEO - all features including video\n\n' +
                    '💫 Press "Subscribe" in the main menu to choose a plan'
                : isRu
                  ? '❌ <b>Просмотр баланса недоступен без подписки</b>\n\n' +
                    '💳 Функции баланса доступны только для пользователей с активной подпиской.\n\n' +
                    '📋 <b>Доступные тарифы:</b>\n' +
                    '• NEUROPHOTO - работа с фото и изображениями\n' +
                    '• NEUROVIDEO - все функции включая видео\n\n' +
                    '💫 Нажмите "Оформить подписку" в главном меню для выбора тарифа'
                  : '❌ <b>Balance view is not available without subscription</b>\n\n' +
                    '💳 Balance features are only available for users with an active subscription.\n\n' +
                    '📋 <b>Available plans:</b>\n' +
                    '• NEUROPHOTO - photo and image features\n' +
                    '• NEUROVIDEO - all features including video\n\n' +
                    '💫 Press "Subscribe" in the main menu to choose a plan'

            await ctx.replyWithHTML(message)
            await showMainMenu(ctx)
            return
          }

          // У пользователя есть подписка - продолжаем
          ctx.session.mode = item.mode as ModeEnum
          ctx.session.subscription = subscriptionType

          logger.info(`🔍 [PAYMENT DEBUG] User has subscription, entering scene...`, {
            telegramId: ctx.from?.id,
            mode: item.mode,
            willEnterPaymentScene: item.mode === ModeEnum.TopUpBalance,
          })

          if (item.mode === ModeEnum.TopUpBalance) {
            logger.info(`🔍 [PAYMENT DEBUG] About to enter PaymentScene...`, {
              telegramId: ctx.from?.id,
              currentScene: ctx.scene?.current?.id,
              willLeaveCurrentScene: !!ctx.scene?.current,
            })
            
            // ✅ КРИТИЧЕСКИ ВАЖНО: Выходим из текущей сцены перед входом в PaymentScene
            if (ctx.scene?.current) {
              logger.info(`🔍 [PAYMENT DEBUG] Leaving current scene before entering PaymentScene`, {
                telegramId: ctx.from?.id,
                currentSceneId: ctx.scene.current.id,
              })
              await ctx.scene.leave()
            }
            
            try {
              logger.info(`🔍 [PAYMENT DEBUG] About to call ctx.scene.enter(${ModeEnum.PaymentScene})...`, {
                telegramId: ctx.from?.id,
                timestamp: new Date().toISOString(),
                currentSceneBeforeEnter: ctx.scene?.current?.id,
                sceneId: ModeEnum.PaymentScene,
              })
              
              await ctx.scene.enter(ModeEnum.PaymentScene)
              
              logger.info(`✅ [PAYMENT DEBUG] ctx.scene.enter() completed successfully`, {
                telegramId: ctx.from?.id,
                timestamp: new Date().toISOString(),
                newSceneId: ctx.scene?.current?.id,
                sceneCurrent: ctx.scene?.current,
                hasScene: !!ctx.scene?.current,
              })
              
              // ✅ ДОПОЛНИТЕЛЬНАЯ ПРОВЕРКА: Убеждаемся, что сцена действительно активировалась
              if (ctx.scene?.current?.id !== ModeEnum.PaymentScene) {
                logger.error(`❌ [PAYMENT DEBUG] Scene enter() completed, but user is NOT in PaymentScene!`, {
                  telegramId: ctx.from?.id,
                  expectedScene: ModeEnum.PaymentScene,
                  actualScene: ctx.scene?.current?.id,
                  sceneCurrent: ctx.scene?.current,
                })
              } else {
                logger.info(`✅ [PAYMENT DEBUG] Scene verification PASSED: User is in PaymentScene`, {
                  telegramId: ctx.from?.id,
                  sceneId: ctx.scene?.current?.id,
                })
              }
            } catch (enterError) {
              logger.error(`❌ [PAYMENT DEBUG] Error entering PaymentScene:`, {
                error: enterError instanceof Error ? enterError.message : String(enterError),
                stack: enterError instanceof Error ? enterError.stack : undefined,
                telegramId: ctx.from?.id,
                timestamp: new Date().toISOString(),
              })
              const isRu = isRussianFromState(ctx)
              await ctx.reply(
                isRu
                  ? '❌ Произошла ошибка при переходе к оплате. Попробуйте позже.'
                  : '❌ An error occurred while switching to payment. Please try again later.'
              )
            }
          } else if (item.mode === ModeEnum.Balance) {
            // ✅ Для показа баланса используем BalanceScene, а не CheckBalanceScene
            await ctx.scene.enter('balance_scene')
          } else {
            await ctx.scene.enter(ModeEnum.CheckBalanceScene)
          }
        } catch (error) {
          logger.error(`❌ [NavigationService] Error handling ${item.ru}:`, {
            error,
            telegramId: ctx.from?.id,
          })
        }
      })
    } else {
      // Для остальных кнопок профиля используем стандартную обработку
      bot.hears([item.ru, item.en], async ctx => {
        await handleFunctionNavigation(ctx, item)
      })
    }
  })

  logger.info(
    `✅ [NavigationService] Registered ${profileCategory.items.length} profile handlers`
  )
}

/**
 * Регистрация глобальных обработчиков (Главное меню, Назад и т.д.)
 * ⚠️ ВАЖНО: Обработчик "🏠 Главное меню" уже зарегистрирован в registerGlobalNavigationMiddleware
 * Здесь регистрируем только дополнительные глобальные обработчики
 */
function registerGlobalHandlers(bot: Telegraf<MyContext>): void {
  // ❌ УДАЛЕНО: Обработчик "🏠 Главное меню" - дублирует registerGlobalNavigationMiddleware
  // Кнопка "Главное меню" обрабатывается в registerGlobalNavigationMiddleware (middleware)
  // чтобы перехватывать её ДО всех других обработчиков

  // Кнопка "Назад" (возврат в главное меню)
  bot.hears(['◀️ Назад', '◀️ Back'], async ctx => {
    logger.info('◀️ [NavigationService] Back button pressed', {
      telegramId: ctx.from?.id,
    })

    try {
      await ctx.scene.leave()
      await showMainMenu(ctx)
    } catch (error) {
      logger.error('❌ [NavigationService] Error going back:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  logger.info('✅ [NavigationService] Registered global handlers')
}

/**
 * Регистрация action-обработчиков навигации (callback_query)
 */
function registerNavigationActions(bot: Telegraf<MyContext>): void {
  // Глобальный action для перехода в главное меню (оптимизирован через фабрику)
  bot.action(
    'go_main_menu',
    withErrorHandling(async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
      await showMainMenu(ctx)
    }, 'go_main_menu')
  )

  // Дополнительные навигационные action-обработчики
  bot.action(
    'upscale_another_photo',
    createSceneActionHandler('upscale_another_photo', ModeEnum.ImageUpscaler)
  )

  bot.action('go_help', createSceneActionHandler('go_help', 'helpScene'))

  bot.action(
    'go_back',
    withErrorHandling(async ctx => {
      await ctx.answerCbQuery()
      await ctx.scene.leave()
    }, 'go_back')
  )

  logger.info('✅ [NavigationService] Registered navigation action handlers')
}

/**
 * Регистрация специальных обработчиков (Сгенерировать еще, Улучшить промт и т.д.)
 */
function registerSpecialHandlers(bot: Telegraf<MyContext>): void {
  // Обработчик "Сгенерировать еще (Фото в Видео)"
  bot.hears('🔄 Сгенерировать еще (Фото в Видео)', async ctx => {
    logger.info('🔄 [NavigationService] Generate more (Image to Video)', {
      telegramId: ctx.from?.id,
    })
    try {
      ctx.session.mode = ModeEnum.ImageToVideo
      await ctx.scene.enter(ModeEnum.CheckBalanceScene)
    } catch (error) {
      logger.error('❌ [NavigationService] Error entering ImageToVideo:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Обработчик "Создать еще (Текст в Видео)"
  bot.hears(
    ['✨ Создать еще (Текст в Видео)', '✨ Create More (Text to Video)'],
    async ctx => {
      logger.info('✨ [NavigationService] Create more (Text to Video)', {
        telegramId: ctx.from?.id,
      })
      try {
        ctx.session.mode = ModeEnum.TextToVideo
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      } catch (error) {
        logger.error('❌ [NavigationService] Error entering TextToVideo:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке начать новую генерацию. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to start a new generation. Please try returning to the main menu.'
        )
      }
    }
  )

  // Обработчик "Выбрать другую модель (Видео)"
  bot.hears(
    ['🖼 Выбрать другую модель (Видео)', '🖼 Select Another Model (Video)'],
    async ctx => {
      logger.info('🖼 [NavigationService] Select another model (Video)', {
        telegramId: ctx.from?.id,
      })
      try {
        ctx.session.mode = ModeEnum.TextToVideo
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.CheckBalanceScene)
      } catch (error) {
        logger.error('❌ [NavigationService] Error selecting model:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке выбора другой модели. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to select another model. Please try returning to the main menu.'
        )
      }
    }
  )

  // Обработчик "Создать еще морфинг"
  bot.hears(
    ['🧬 Создать еще морфинг', '🧬 Create Another Morphing'],
    async ctx => {
      logger.info('🧬 [NavigationService] Create another morphing', {
        telegramId: ctx.from?.id,
      })
      try {
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter('morphing_wizard')
      } catch (error) {
        logger.error('❌ [NavigationService] Error entering morphing:', {
          error,
          telegramId: ctx.from?.id,
        })
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при попытке создать морфинг. Попробуйте вернуться в главное меню.'
            : 'An error occurred while trying to create morphing. Please try returning to the main menu.'
        )
      }
    }
  )

  // Обработчик "Улучшить промт"
  bot.hears(['✨ Улучшить промт', '✨ Improve Prompt'], async ctx => {
    logger.info('✨ [NavigationService] Improve prompt', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.enter(ModeEnum.ImprovePromptWizard, {
        prompt: ctx.session.prompt,
        mode: ctx.session.mode,
      })
    } catch (error) {
      logger.error('❌ [NavigationService] Error entering ImprovePrompt:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Обработчик "Размер"
  bot.hears(['📝 Размер', '📝 Size'], async ctx => {
    logger.info('📝 [NavigationService] Size button', {
      telegramId: ctx.from?.id,
    })
    try {
      ctx.session.mode = ModeEnum.ChangeSize
      await ctx.scene.enter(ModeEnum.SizeWizard)
    } catch (error) {
      logger.error('❌ [NavigationService] Error entering SizeWizard:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Обработчик "Помощь"
  bot.hears(['❓ Помощь', '❓ Help'], async ctx => {
    logger.info('❓ [NavigationService] Help button', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.enter(ModeEnum.Help)
    } catch (error) {
      logger.error('❌ [NavigationService] Error entering Help:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Обработчик "О боте"
  bot.hears(['ℹ️ О боте', 'ℹ️ About'], async ctx => {
    logger.info('ℹ️ [NavigationService] About button', {
      telegramId: ctx.from?.id,
    })
    try {
      await ctx.scene.enter(ModeEnum.Help)
    } catch (error) {
      logger.error('❌ [NavigationService] Error entering Help:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  })

  // Обработчик для кнопок 1️⃣, 2️⃣, 3️⃣, 4️⃣ (выбор количества изображений)
  bot.hears(['1️⃣', '2️⃣', '3️⃣', '4️⃣'], async ctx => {
    logger.info('🔢 [NavigationService] Number button pressed', {
      telegramId: ctx.from?.id,
      text: ctx.message && 'text' in ctx.message ? ctx.message.text : 'unknown',
    })

    if (!('text' in ctx.message)) {
      logger.warn('Non-text message received for number hears')
      return
    }

    const text = ctx.message.text
    const isRu = isRussianFromState(ctx)
    const prompt = ctx.session.prompt
    const telegramId = ctx.from.id

    // Парсинг эмодзи кнопок
    let numImages: number
    if (['1️⃣', '2️⃣', '3️⃣', '4️⃣'].includes(text)) {
      numImages = ['1️⃣', '2️⃣', '3️⃣', '4️⃣'].indexOf(text) + 1
    } else {
      numImages = parseInt(text, 10)
    }

    const { profile, settings } = await getUserProfileAndSettings(telegramId)

    if (!profile || !settings) {
      logger.error('Failed to get profile or settings for hears handler', {
        telegramId,
      })
      await ctx.reply(
        isRu
          ? 'Ошибка: Не удалось получить данные пользователя.'
          : 'Error: Could not retrieve user data.'
      )
      return
    }

    if (!prompt) {
      logger.error('Prompt not found in session for hears handler', {
        telegramId,
        sessionMode: ctx.session?.mode,
      })
      await ctx.reply(
        isRu
          ? 'Ошибка: Не найден текст для генерации. Попробуйте снова.'
          : 'Error: Prompt not found. Please try again.'
      )
      return
    }

    // Генерация для NeuroPhoto
    if (ctx.session.mode === ModeEnum.NeuroPhoto) {
      const trigger_word = ctx.session.userModel.trigger_word as string
      const userData = await getUserData(telegramId.toString())
      let genderPromptPart = 'person'
      if (userData?.gender === 'female') {
        genderPromptPart = 'female'
      } else if (userData?.gender === 'male') {
        genderPromptPart = 'male'
      }

      const detailPrompt = `Cinematic Lighting, ethereal light, intricate details, extremely detailed, incredible details, full colored, complex details, insanely detailed and intricate, hypermaximalist, extremely detailed with rich colors. masterpiece, best quality, aerial view, HDR, UHD, unreal engine, Representative, fair skin, beautiful face, Rich in details High quality, gorgeous, glamorous, 8k, super detail, gorgeous light and shadow, detailed decoration, detailed lines`
      const fullPrompt = `Fashionable ${trigger_word} ${genderPromptPart}, ${prompt}, ${detailPrompt}`

      const { getAspectRatio } = await import('@/core/supabase')
      const userAspectRatio = await getAspectRatio(telegramId)

      const { getBotNameByUsername, getBotNameByToken } = await import(
        '@/core/bot'
      )
      let bot_name: string
      if (ctx.botInfo?.username) {
        const usernameResult = getBotNameByUsername(ctx.botInfo.username)
        bot_name =
          usernameResult.bot_name ||
          getBotNameByToken(ctx.telegram.token).bot_name
      } else {
        bot_name = getBotNameByToken(ctx.telegram.token).bot_name
      }

      try {
        await generateNeuroPhotoHybrid(
          fullPrompt,
          ctx.session.userModel.model_url,
          numImages,
          telegramId.toString(),
          ctx,
          bot_name,
          userAspectRatio
        )
      } catch (error) {
        logger.error('Error generating NeuroPhoto:', { error, telegramId })
        await ctx.reply(
          isRu
            ? 'Произошла ошибка при генерации. Попробуйте позже.'
            : 'An error occurred during generation. Please try again later.'
        )
      }
    }
  })

  // Обработчик Avatar Transform кнопок
  bot.hears(
    ['👨‍💼 Мужской образ', '👨‍💼 Male look', '👩‍💼 Женский образ', '👩‍💼 Female look'],
    async ctx => {
      logger.info('👤 [NavigationService] Avatar Transform button', {
        telegramId: ctx.from?.id,
      })

      try {
        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? '🔄 Похоже, вы вышли из процесса трансформации.\n\nЧтобы создать новый образ, используйте команду /start'
            : '🔄 It seems you have exited the transformation process.\n\nTo create a new look, use the /start command',
          Markup.removeKeyboard()
        )

        await ctx.scene.leave()
        await showMainMenu(ctx)
      } catch (error) {
        logger.error(
          '❌ [NavigationService] Error handling Avatar Transform:',
          {
            error,
            telegramId: ctx.from?.id,
          }
        )
      }
    }
  )

  // Админские функции
  bot.hears('🤖 Цифровое тело 2', async ctx => {
    logger.info('🤖 [NavigationService] Digital Body 2 (Admin)', {
      telegramId: ctx.from?.id,
    })

    const userId = ctx.from?.id
    const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false

    if (!isAdmin) {
      await ctx.reply('❌ У вас нет доступа к этой функции.')
      return
    }

    const hasSubscription = await checkSubscriptionGuard(
      ctx,
      '🤖 Цифровое тело 2'
    )
    if (!hasSubscription) {
      return
    }

    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.DigitalAvatarBodyV2
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  bot.hears('📸 Нейрофото 2', async ctx => {
    logger.info('📸 [NavigationService] NeuroPhoto 2 (Admin)', {
      telegramId: ctx.from?.id,
    })

    const userId = ctx.from?.id
    const isAdmin = userId ? ADMIN_IDS_ARRAY.includes(userId) : false

    if (!isAdmin) {
      await ctx.reply('❌ У вас нет доступа к этой функции.')
      return
    }

    const hasSubscription = await checkSubscriptionGuard(ctx, '📸 Нейрофото 2')
    if (!hasSubscription) {
      return
    }

    await ctx.scene.leave()
    ctx.session.mode = ModeEnum.NeuroPhoto
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  })

  // FLUX Kontext обработчики
  bot.hears(['💼 FLUX Kontext Pro'], async ctx => {
    logger.info('💼 [NavigationService] FLUX Kontext Pro', {
      telegramId: ctx.from?.id,
    })

    if (ctx.session) {
      ctx.session.mode = ModeEnum.FluxKontext
    }

    await handleFluxKontextModelSelection(ctx, 'pro')
  })

  bot.hears(['🚀 FLUX Kontext Max'], async ctx => {
    logger.info('🚀 [NavigationService] FLUX Kontext Max', {
      telegramId: ctx.from?.id,
    })

    if (ctx.session) {
      ctx.session.mode = ModeEnum.FluxKontext
    }

    await handleFluxKontextModelSelection(ctx, 'max')
  })

  bot.hears(['✨ Ещё редактирование', '✨ More editing'], async ctx => {
    logger.info('✨ [NavigationService] More editing', {
      telegramId: ctx.from?.id,
    })

    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '📷 Отправьте новое изображение для редактирования:'
        : '📷 Send a new image for editing:',
      {
        reply_markup: {
          remove_keyboard: true,
        },
      }
    )

    if (ctx.session) {
      ctx.session.awaitingFluxKontextImage = true
    }
  })

  // AI Photoshop обработчик
  bot.hears(['🔄 Другой режим', '🔄 Different mode'], async ctx => {
    logger.info('🔄 [NavigationService] Different mode', {
      telegramId: ctx.from?.id,
    })

    await ctx.scene.leave()
    await ctx.scene.enter('ai_photoshop_scene')
  })

  // Парсинг Instagram (только для админов)
  bot.hears(['🔍 Парсинг', '🔍 Parsing'], async ctx => {
    const userId = ctx.from?.id?.toString()
    const botToken = ctx.telegram.token

    logger.info('🔍 [NavigationService] Instagram Parsing', {
      telegramId: ctx.from?.id,
      userId,
    })

    if (!userId) {
      await ctx.reply('❌ Ошибка: не удалось определить пользователя.')
      return
    }

    const isAdmin = ADMIN_IDS_ARRAY.includes(parseInt(userId))

    if (!isAdmin) {
      await ctx.reply('❌ У вас нет доступа к функции парсинга Instagram.')
      return
    }

    try {
      await ctx.scene.leave()
      await ctx.scene.enter(ModeEnum.InstagramParserScene)
    } catch (error) {
      logger.error('❌ [NavigationService] Error entering Instagram parser:', {
        error,
        telegramId: ctx.from?.id,
      })
      await ctx.reply(
        '❌ Произошла ошибка при запуске парсинга. Попробуйте позже.'
      )
    }
  })

  // Смена языка
  bot.hears(['🌐 EN', '🌐 RU'], async ctx => {
    const telegramId = ctx.from?.id?.toString()
    logger.info('🌐 [NavigationService] Language switch', {
      telegramId: ctx.from?.id,
    })

    try {
      const currentLang = isRussianFromState(ctx)
      const newLang = !currentLang

      if (ctx.session) {
        ctx.session.userLanguage = newLang ? 'ru' : 'en'
      }

      if (telegramId) {
        const { updateUserLanguage } = await import('@/core/supabase')
        await updateUserLanguage(telegramId, newLang ? 'ru' : 'en')
      }

      await ctx.reply(
        newLang
          ? '🌐 Язык изменён на русский'
          : '🌐 Language changed to English'
      )

      await ctx.scene.leave()
      await showMainMenu(ctx)

      logger.info('✅ Language switched successfully', {
        telegramId: ctx.from?.id,
        newLanguage: newLang ? 'ru' : 'en',
      })
    } catch (error) {
      logger.error('❌ [NavigationService] Error switching language:', {
        error,
        telegramId: ctx.from?.id,
      })

      await ctx.reply(
        isRussianFromState(ctx)
          ? '❌ Произошла ошибка при смене языка.'
          : '❌ Error occurred while changing language.'
      )
    }
  })

  logger.info('✅ [NavigationService] Registered special handlers')
}

/**
 * Создать клавиатуру главного меню (без отправки сообщения)
 * ✅ Используется в menuScene для получения клавиатуры
 */
export function createMainMenuKeyboard(ctx: MyContext): Markup.Markup<ReplyKeyboardMarkup> {
  const isRu = isRussianFromState(ctx)
  const userId = ctx.from?.id

  // Фильтруем категории по правам доступа
  const visibleCategories = CATEGORIES.filter(cat => {
    const hasAdminOnlyItems = cat.items.some(item => item.adminOnly)
    if (hasAdminOnlyItems && (!userId || !ADMIN_IDS_ARRAY.includes(userId))) {
      return cat.items.some(item => !item.adminOnly)
    }
    return true
  })

  // Создаем клавиатуру (по 2 кнопки в ряд)
  const buttons: string[][] = []

  // 1. Категории (по 2 в ряд)
  for (let i = 0; i < visibleCategories.length; i += 2) {
    const row: string[] = []
    row.push(isRu ? visibleCategories[i].ru : visibleCategories[i].en)
    if (visibleCategories[i + 1]) {
      row.push(isRu ? visibleCategories[i + 1].ru : visibleCategories[i + 1].en)
    }
    buttons.push(row)
  }

  // 2. ✅ ВАЖНЫЕ КНОПКИ (всегда на главном меню)
  const importantButtons: string[] = []

  // Получаем функции из категории "Профиль"
  const profileCategory = CATEGORIES.find(cat => cat.id === 'profile')
  if (profileCategory) {
    const subscriptionBtn = profileCategory.items.find(
      item => item.ru === '💫 Оформить подписку'
    )
    const balanceBtn = profileCategory.items.find(
      item => item.ru === '💰 Баланс'
    )
    const topUpBtn = profileCategory.items.find(
      item => item.ru === '💎 Пополнить баланс'
    )
    const helpBtn = profileCategory.items.find(
      item => item.ru === '💬 Техподдержка'
    )

    if (subscriptionBtn) {
      importantButtons.push(isRu ? subscriptionBtn.ru : subscriptionBtn.en)
    }
    if (balanceBtn && userId) {
      importantButtons.push(isRu ? balanceBtn.ru : balanceBtn.en)
    }
    if (topUpBtn && userId) {
      importantButtons.push(isRu ? topUpBtn.ru : topUpBtn.en)
    }
    if (helpBtn) {
      importantButtons.push(isRu ? helpBtn.ru : helpBtn.en)
    }
  }

  // Добавляем важные кнопки (по 2 в ряд)
  if (importantButtons.length > 0) {
    for (let i = 0; i < importantButtons.length; i += 2) {
      const row: string[] = []
      row.push(importantButtons[i])
      if (importantButtons[i + 1]) {
        row.push(importantButtons[i + 1])
      }
      buttons.push(row)
    }
  }

  return Markup.keyboard(buttons).resize()
}

/**
 * Показать главное меню (категории + важные кнопки)
 */
export async function showMainMenu(ctx: MyContext): Promise<void> {
  logger.info('🎯 [showMainMenu] Starting to show main menu', {
    telegramId: ctx.from?.id,
    currentScene: (ctx as any).scene?.current?.id,
  })

  const isRu = isRussianFromState(ctx)
  const keyboard = createMainMenuKeyboard(ctx)

  const message = isRu
    ? '🏠 Главное меню\n\nВыберите категорию или действие:'
    : '🏠 Main Menu\n\nChoose a category or action:'

  logger.info('🎯 [showMainMenu] Sending menu message', {
    telegramId: ctx.from?.id,
    messageLength: message.length,
    buttonsCount: keyboard.reply_markup.keyboard?.length || 0,
  })

  await ctx.reply(message, { reply_markup: keyboard.reply_markup })

  logger.info('✅ [showMainMenu] Menu message sent successfully', {
    telegramId: ctx.from?.id,
  })
}

/**
 * Показать меню категории
 */
export async function showCategoryMenu(
  ctx: MyContext,
  categoryId: string
): Promise<void> {
  try {
    const isRu = isRussianFromState(ctx)
    const userId = ctx.from?.id

    logger.info(`🎯 [showCategoryMenu] Showing category: ${categoryId}`, {
      telegramId: ctx.from?.id,
      userId,
    })

    const category = CATEGORIES.find(cat => cat.id === categoryId)
    if (!category) {
      logger.error(`❌ [NavigationService] Category not found: ${categoryId}`)
      await showMainMenu(ctx)
      return
    }

    // Фильтруем функции по правам доступа
    const visibleItems = category.items.filter(item => {
      if (item.adminOnly && (!userId || !ADMIN_IDS_ARRAY.includes(userId))) {
        return false
      }
      return true
    })

    logger.info(`🎯 [showCategoryMenu] Visible items: ${visibleItems.length}`, {
      telegramId: ctx.from?.id,
      categoryId,
      totalItems: category.items.length,
      visibleItems: visibleItems.length,
    })

    // Создаем клавиатуру (по 2 кнопки в ряд)
    const buttons: string[][] = []
    for (let i = 0; i < visibleItems.length; i += 2) {
      const row: string[] = []
      row.push(isRu ? visibleItems[i].ru : visibleItems[i].en)
      if (visibleItems[i + 1]) {
        row.push(isRu ? visibleItems[i + 1].ru : visibleItems[i + 1].en)
      }
      buttons.push(row)
    }

    // Добавляем навигационные кнопки
    buttons.push(['🏠 Главное меню', '◀️ Назад'])

    const keyboard = Markup.keyboard(buttons).resize()

    const categoryName = isRu ? category.ru : category.en
    const message = isRu
      ? `${categoryName}\n\nВыберите функцию:`
      : `${categoryName}\n\nChoose a function:`

    logger.info(
      `🎯 [showCategoryMenu] Sending menu with ${buttons.length} rows`,
      {
        telegramId: ctx.from?.id,
        categoryId,
      }
    )

    await ctx.reply(message, { reply_markup: keyboard.reply_markup })
  } catch (error) {
    logger.error(
      `❌ [showCategoryMenu] Error showing category ${categoryId}:`,
      {
        error,
        telegramId: ctx.from?.id,
        categoryId,
      }
    )

    const isRu = isRussianFromState(ctx)
    await ctx.reply(
      isRu
        ? '❌ Произошла ошибка при показе меню категории. Попробуйте позже.'
        : '❌ An error occurred while showing category menu. Please try again later.'
    )
  }
}

/**
 * Обработка навигации к функции
 */
async function handleFunctionNavigation(
  ctx: MyContext,
  item: NavigationItem
): Promise<void> {
  const userId = ctx.from?.id
  const isRu = isRussianFromState(ctx)

  // Проверка админских прав
  if (item.adminOnly && (!userId || !ADMIN_IDS_ARRAY.includes(userId))) {
    await ctx.reply(
      isRu
        ? '🔒 Эта функция доступна только администраторам'
        : '🔒 This feature is only available to administrators'
    )
    return
  }

  // Проверка подписки
  if (item.requiresSubscription) {
    const hasSubscription = await checkSubscriptionGuard(ctx, item.ru)
    if (!hasSubscription) {
      return // Пользователь перенаправлен в subscriptionScene
    }
  }

  // Выходим из текущей сцены
  await ctx.scene.leave()

  // Устанавливаем режим
  ctx.session.mode = item.mode as ModeEnum

  // Переходим в сцену
  if (item.directScene) {
    // Прямой переход (без CheckBalanceScene)
    await ctx.scene.enter(item.mode as string)
  } else {
    // Стандартный переход через CheckBalanceScene
    await ctx.scene.enter(ModeEnum.CheckBalanceScene)
  }

  logger.info(`✅ [NavigationService] Navigated to ${item.mode}`, {
    telegramId: ctx.from?.id,
  })
}

/**
 * Получить все функции категории
 */
export function getCategoryItems(categoryId: string): NavigationItem[] {
  const category = CATEGORIES.find(cat => cat.id === categoryId)
  return category ? category.items : []
}

// ========================================
// 4. HELPER-ФУНКЦИИ ДЛЯ ОПТИМИЗАЦИИ
// ========================================

/**
 * Обертка для обработки ошибок в action-обработчиках
 */
function withErrorHandling<T extends MyContext>(
  handler: (ctx: T) => Promise<void>,
  actionName: string
) {
  return async (ctx: T) => {
    try {
      await handler(ctx)
    } catch (error) {
      logger.error(`Error in ${actionName} action:`, {
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
        telegramId: ctx.from?.id,
      })
      const isRu = isRussianFromState(ctx)
      try {
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка. Попробуйте позже.'
            : '❌ An error occurred. Please try again later.'
        )
      } catch {
        // Игнорируем ошибки отправки сообщения
      }
    }
  }
}

/**
 * Фабрика для создания простых action-обработчиков (переход в сцену)
 */
function createSceneActionHandler(
  actionName: string,
  sceneId: string | ModeEnum,
  options?: {
    beforeEnter?: (ctx: MyContext) => Promise<void>
    afterEnter?: (ctx: MyContext) => Promise<void>
    requireSubscription?: boolean
    subscriptionFeature?: string
  }
) {
  return withErrorHandling(async (ctx: MyContext) => {
    logger.info(`GLOBAL ACTION: ${actionName}`, {
      telegramId: ctx.from?.id,
    })

    await ctx.answerCbQuery()

    // Проверка подписки, если требуется
    if (options?.requireSubscription) {
      const hasSubscription = await checkSubscriptionGuard(
        ctx,
        options.subscriptionFeature || actionName
      )
      if (!hasSubscription) {
        return
      }
    }

    // Выполняем beforeEnter, если есть
    if (options?.beforeEnter) {
      await options.beforeEnter(ctx)
    }

    await ctx.scene.leave()
    await ctx.scene.enter(sceneId as string)

    // Выполняем afterEnter, если есть
    if (options?.afterEnter) {
      await options.afterEnter(ctx)
    }
  }, actionName)
}

/**
 * Фабрика для создания action-обработчиков с сообщением
 */
function createMessageActionHandler(
  actionName: string,
  getMessage: (isRu: boolean) => string,
  options?: {
    beforeReply?: (ctx: MyContext) => Promise<void>
    afterReply?: (ctx: MyContext) => Promise<void>
  }
) {
  return withErrorHandling(async (ctx: MyContext) => {
    logger.info(`GLOBAL ACTION: ${actionName}`, {
      telegramId: ctx.from?.id,
    })

    await ctx.answerCbQuery()

    if (options?.beforeReply) {
      await options.beforeReply(ctx)
    }

    const isRu = isRussianFromState(ctx)
    await ctx.reply(getMessage(isRu))

    if (options?.afterReply) {
      await options.afterReply(ctx)
    }
  }, actionName)
}

/**
 * Получить информацию о пользователе из контекста
 */
function getUserInfoFromContext(ctx: MyContext) {
  return {
    telegramId: ctx.from?.id?.toString() || '',
    username: ctx.from?.username || '',
    isRu: isRussianFromState(ctx),
  }
}

/**
 * Проверить, что пользователь в приватном чате
 */
function requirePrivateChat(ctx: MyContext): boolean {
  return ctx.chat.type === 'private'
}

/**
 * Найти функцию по тексту кнопки
 */
export function findItemByText(text: string): NavigationItem | undefined {
  for (const category of CATEGORIES) {
    const item = category.items.find(
      item => item.ru === text || item.en === text
    )
    if (item) return item
  }
  return undefined
}

/**
 * Найти функцию по mode
 */
export function findItemByMode(
  mode: string | ModeEnum
): NavigationItem | undefined {
  for (const category of CATEGORIES) {
    const item = category.items.find(item => item.mode === mode)
    if (item) return item
  }
  return undefined
}

/**
 * Получить тексты кнопки по mode (для замены levels[])
 */
export function getButtonTextsByMode(
  mode: string | ModeEnum
): { ru: string; en: string } | null {
  const item = findItemByMode(mode)
  if (!item) return null
  return { ru: item.ru, en: item.en }
}

/**
 * Получить все тексты кнопок из категории
 */
export function getCategoryButtonTexts(
  categoryId: string
): Array<{ ru: string; en: string }> {
  const category = CATEGORIES.find(cat => cat.id === categoryId)
  if (!category) return []
  return category.items.map(item => ({ ru: item.ru, en: item.en }))
}

/**
 * Получить все тексты кнопок (плоский список)
 */
export function getAllButtonTexts(): Array<{
  ru: string
  en: string
  mode: string | ModeEnum
}> {
  const result: Array<{ ru: string; en: string; mode: string | ModeEnum }> = []
  for (const category of CATEGORIES) {
    for (const item of category.items) {
      result.push({ ru: item.ru, en: item.en, mode: item.mode })
    }
  }
  return result
}

// ========================================
// 4. СПЕЦИАЛЬНЫЕ КНОПКИ (для удобства)
// ========================================

/**
 * Получить тексты специальных кнопок (не в категориях)
 */
export function getSpecialButtonTexts(
  buttonType: 'main_menu' | 'help' | 'cancel' | 'back'
): { ru: string; en: string } {
  const specialButtons: Record<string, { ru: string; en: string }> = {
    main_menu: { ru: '🏠 Главное меню', en: '🏠 Main menu' },
    help: { ru: '💬 Техподдержка', en: '💬 Tech Support' },
    cancel: { ru: 'Отмена', en: 'Cancel' },
    back: { ru: '◀️ Назад', en: '◀️ Back' },
  }
  return specialButtons[buttonType] || { ru: '', en: '' }
}

// ========================================
// 5. ПРАВА ДОСТУПА
// ========================================

// 🤖 Массив сотрудников HaimGroupMedia_bot
export const HAIM_GROUP_STAFF_IDS = [
  '144022504', // @neuro_coder - Главный админ
  '289259562', // @Vyacheslav_Neklyudov
  '752224685', // @voskresenskaya13
  '7669741878', // @Arhustel
  '1036512726', // Сотрудник
]

// 🤖 Массив сотрудников MetaMuse_Manifest_bot
export const METAMUSE_STAFF_IDS = [
  '144022504', // @neuro_coder
  '352374518',
  '1064902106',
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
      allowedProjects: hasAccess
        ? ['Coco Age', 'vyacheslav_nekludov']
        : undefined,
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
// 8. СЦЕНЫ И STAGE (из registerCommands.ts)
// ========================================

// Проверка всех сцен перед созданием Stage
const scenesToRegister = [
  startScene,
  menuScene,
  helpScene,
  inviteScene,
  paymentScene,
  rublePaymentScene,
  starPaymentScene,
  subscriptionScene,
  subscriptionCheckScene,
  checkBalanceScene,
  balanceScene,
  neuroPhotoWizard,
  neuroPhotoWizardV2,
  textToImageWizard,
  textToVideoWizard,
  imageToVideoWizard,
  imageToPromptWizard,
  imageUpscalerWizard,
  improvePromptWizard,
  trainFluxModelWizard,
  uploadTrainFluxModelScene,
  uploadVideoScene,
  sizeWizard,
  aiPhotoshopScene,
  morphingWizard,
  voiceAvatarWizard,
  textToSpeechWizard,
  videoTranscriptionWizard,
  lipSyncWizard,
  veedFabricWizard,
  aiReelsWizard,
  aiReelsEntryWizard,
  aiReelsRenderWizard,
  hedraRenderWizard,
  heygenRenderWizard,
  falRenderWizard,
  avatarTransformScene,
  avatarBrainWizard,
  chatWithAvatarWizard,
  selectModelWizard,
  digitalAvatarBodyWizard,
  digitalAvatarBodyWizardV2,
  getRuBillWizard,
  levelQuestWizard,
  createUserScene,
  neuroCoderScene,
  instagramScrapingWizard,
  autoFixerConfigScene,
  instagramParserScene,
  instagramParserWizard,
  faceSwapWizard,
  // ✅ ДОБАВЛЯЕМ СЦЕНЫ КАТЕГОРИЙ (из NavigationService)
  ...getCategoryScenes(),
]

// 🔍 DEBUG: Print scene names from array definition
const sceneNames = [
  'startScene',
  'menuScene',
  'helpScene',
  'inviteScene',
  'paymentScene',
  'rublePaymentScene',
  'starPaymentScene',
  'subscriptionScene',
  'subscriptionCheckScene',
  'checkBalanceScene',
  'balanceScene',
  'neuroPhotoWizard',
  'neuroPhotoWizardV2',
  'textToImageWizard',
  'textToVideoWizard',
  'imageToVideoWizard',
  'imageToPromptWizard',
  'imageUpscalerWizard',
  'improvePromptWizard',
  'trainFluxModelWizard',
  'uploadTrainFluxModelScene',
  'uploadVideoScene',
  'sizeWizard',
  'aiPhotoshopScene',
  'morphingWizard',
  'voiceAvatarWizard',
  'textToSpeechWizard',
  'videoTranscriptionWizard',
  'lipSyncWizard',
  'veedFabricWizard',
  'aiReelsWizard',
  'aiReelsEntryWizard',
  'aiReelsRenderWizard',
  'hedraRenderWizard',
  'heygenRenderWizard',
  'falRenderWizard',
  'avatarTransformScene',
  'avatarBrainWizard',
  'chatWithAvatarWizard',
  'selectModelWizard',
  'digitalAvatarBodyWizard',
  'digitalAvatarBodyWizardV2',
  'getRuBillWizard',
  'levelQuestWizard',
  'createUserScene',
  'neuroCoderScene',
  'instagramScrapingWizard',
  'autoFixerConfigScene',
  'instagramParserScene',
  'instagramParserWizard',
  'faceSwapWizard',
]

// Validate scenes (critical errors only)
scenesToRegister.forEach((scene, index) => {
  const hasId = scene?.id != null
  const hasMiddleware = typeof scene?.middleware === 'function'
  const isValid = hasId && hasMiddleware

  if (!isValid || scene === undefined || scene === null) {
    console.error(
      `❌ CRITICAL: Invalid scene at index ${index}: ${sceneNames[index]}`
    )
    throw new Error(
      `CRITICAL: Invalid scene at index ${index}: ${sceneNames[index]}`
    )
  }
})

export const stage = new Scenes.Stage<MyContext>(scenesToRegister as any)

// Function to send the promotional message
const sendGroupCommandReply = async (ctx: MyContext) => {
  try {
    const botUsername = ctx.botInfo.username
    const message = `🕉️ Привет! Команды для меня, ${botUsername}, работают только в нашем личном чате. ✨\n\nЯ часть большой семьи ботов! 🤖❤️ Чтобы пообщаться со мной или использовать мои возможности, пожалуйста, напиши мне напрямую: @${botUsername}\n\n*Ом Шанти!* 🙏`
    await ctx.reply(message)
  } catch (e) {
    logger.error(
      `Error replying to command in group for ${
        ctx.botInfo?.username || 'unknown bot'
      }:`,
      {
        error: e instanceof Error ? e.message : String(e),
        chatId: ctx.chat?.id,
        userId: ctx.from?.id,
      }
    )
  }
}

// ========================================
// 9. РЕГИСТРАЦИЯ ВСЕХ КОМАНД И ОБРАБОТЧИКОВ
// ========================================

/**
 * ✅ ЕДИНАЯ ФУНКЦИЯ РЕГИСТРАЦИИ ВСЕХ КОМАНД И ОБРАБОТЧИКОВ
 * Перенесена из registerCommands.ts для централизации всей логики
 */
export function registerCommands({ bot }: { bot: Telegraf<MyContext> }) {
  logger.info(
    '🎯 [NavigationService] Registering all bot commands and handlers'
  )

  try {
    // 1. Логгер для ВСЕХ входящих обновлений
    bot.use((ctx, next) => {
      const messageText =
        ctx.message && 'text' in ctx.message ? ctx.message.text : undefined

      // ✅ СПЕЦИАЛЬНЫЙ ЛОГ ДЛЯ ОТЛАДКИ ПЛАТЕЖЕЙ
      if (messageText === '💳 Рублями' || messageText === '💳 Rubles') {
        logger.info('🔍 [PAYMENT DEBUG] Rubles button detected in raw update', {
          updateId: ctx.update.update_id,
          currentScene: ctx.scene?.current?.id,
          messageText,
          hasScene: !!ctx.scene?.current,
        })
      }

      logger.info('>>> RAW UPDATE RECEIVED', {
        updateId: ctx.update.update_id,
        updateType: ctx.updateType,
        messageText,
        callbackData:
          ctx.callbackQuery && 'data' in ctx.callbackQuery
            ? ctx.callbackQuery.data
            : undefined,
        sceneInfo: ctx.scene?.current?.id,
      })

      // СПЕЦИАЛЬНЫЙ ЛОГ ДЛЯ /instagram
      if (messageText === '/instagram') {
        // Instagram command detected, proceeding to handler
      }

      return next()
    })

    // 2. ✅ КРИТИЧЕСКИ ВАЖНО: Глобальный перехватчик навигации ДОЛЖЕН быть ДО stage.middleware()
    // чтобы перехватывать кнопки "🏠 Главное меню" и "Отмена" ДО того, как они попадут в сцену
    registerGlobalNavigationMiddleware(bot)

    // 3. Middleware сцен (ДОЛЖЕН БЫТЬ ПОСЛЕ СЕССИИ - сессия теперь регистрируется в bot.ts)
    bot.use(stage.middleware())

    // 4. РЕГИСТРАЦИЯ ОБРАБОТЧИКОВ ПЛАТЕЖЕЙ
    registerPaymentActions(bot)

    // 5. ИНИЦИАЛИЗАЦИЯ НАВИГАЦИИ (команды /start, /menu, /help и все обработчики)
    // ⚠️ ВАЖНО: registerGlobalNavigationMiddleware уже вызван выше, поэтому в initializeNavigation
    // он не будет вызван повторно (нужно проверить, что он не вызывается дважды)
    logger.info('🎯 [NavigationService] Initializing navigation service...')
    initializeNavigation(bot, { skipGlobalMiddleware: true })
    logger.info(
      '✅ [NavigationService] Navigation service initialized successfully'
    )

    // 6. РЕГИСТРАЦИЯ ДРУГИХ КОМАНД (не навигация)

    // Фабрика для команд с проверкой приватного чата и подписки
    const createCommandHandler =
      (
        commandName: string,
        handler: (ctx: MyContext) => Promise<void>,
        options?: {
          requireSubscription?: boolean
          subscriptionFeature?: string
        }
      ) =>
      async (ctx: MyContext) => {
        if (!requirePrivateChat(ctx)) {
          return sendGroupCommandReply(ctx)
        }

        if (options?.requireSubscription) {
          const hasSubscription = await checkSubscriptionGuard(
            ctx,
            options.subscriptionFeature || commandName
          )
          if (!hasSubscription) {
            return
          }
        }

        await handler(ctx)
      }

    bot.command(
      'get100',
      createCommandHandler(
        'get100',
        async ctx => {
          if (!ctx.session.userModel) {
            ctx.session.userModel = {
              model_name: 'default',
              trigger_word: '',
              model_url: 'placeholder/placeholder:placeholder',
              finetune_id: '',
            }
          }
          await get100Command(ctx)
        },
        { requireSubscription: true, subscriptionFeature: '/get100' }
      )
    )

    bot.command(
      'support',
      createCommandHandler(
        'support',
        async ctx => {
          await ctx.scene.leave()
          await handleTechSupport(ctx as MyContext)
        },
        { requireSubscription: false }
      )
    )

    bot.command(
      'price',
      createCommandHandler(
        'price',
        async ctx => {
          return priceCommand(ctx)
        },
        { requireSubscription: true, subscriptionFeature: '/price' }
      )
    )

    bot.command(
      'kontext',
      createCommandHandler(
        'kontext',
        async ctx => {
          logger.info(
            'COMMAND /kontext: AI Photoshop (kontext alias) started',
            {
              telegramId: ctx.from?.id,
            }
          )
          await ctx.scene.leave()
          await ctx.scene.enter(ModeEnum.AiPhotoshop)
        },
        { requireSubscription: true, subscriptionFeature: '/kontext' }
      )
    )

    bot.command('instagram', async ctx => {
      try {
        console.log('🔍 [DEBUG] Instagram command handler TRIGGERED!')
        console.log('🔍 [DEBUG] Instagram command received!', {
          telegramId: ctx.from?.id,
          chatType: ctx.chat?.type,
          timestamp: new Date().toISOString(),
        })
        logger.info('🔍 [DEBUG] Instagram command received!', {
          telegramId: ctx.from?.id,
          chatType: ctx.chat?.type,
          timestamp: new Date().toISOString(),
        })

        if (ctx.chat.type !== 'private') {
          logger.info('🔍 [DEBUG] Rejecting non-private chat')
          return sendGroupCommandReply(ctx)
        }

        console.log('🔍 [DEBUG] Starting Instagram parsing...')
        logger.info('🔍 [DEBUG] Starting Instagram parsing...')

        // Проверяем доступ к парсингу
        const userId = ctx.from?.id?.toString()
        const botToken = ctx.telegram.token

        if (!userId) {
          await ctx.reply('❌ Ошибка: не удалось определить пользователя.')
          return
        }

        const parsingAccess = getParsingAccess(userId, botToken)

        if (!parsingAccess.hasAccess) {
          logger.warn(
            'Instagram parsing access denied via /instagram command',
            {
              telegramId: ctx.from?.id,
              userId,
            }
          )
          await ctx.reply('❌ У вас нет доступа к функции парсинга Instagram.')
          return
        }

        console.log(
          '🔍 [DEBUG] Parsing access check PASSED! Proceeding with Instagram wizard...'
        )
        logger.info(
          'COMMAND /instagram: Instagram competitor analysis started',
          {
            telegramId: ctx.from?.id,
          }
        )

        console.log('🔍 [DEBUG] Entering Instagram scraping wizard...')
        logger.info('🔍 [DEBUG] Entering Instagram scraping wizard...')

        console.log('🔍 [DEBUG] Leaving current scene...')
        await ctx.scene.leave() // Выходим из текущей сцены

        console.log('🔍 [DEBUG] Setting session mode...')
        ctx.session.mode = ModeEnum.InstagramScrapingWizard

        console.log(
          '🔍 [DEBUG] About to enter InstagramScrapingWizard scene...'
        )
        await ctx.scene.enter(ModeEnum.InstagramScrapingWizard)

        console.log(
          '🔍 [DEBUG] Successfully entered Instagram scraping wizard!'
        )
        logger.info('🔍 [DEBUG] Successfully entered Instagram scraping wizard')
      } catch (error) {
        logger.error('🔍 [DEBUG] Instagram command ERROR:', {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          telegramId: ctx.from?.id,
        })

        await ctx.reply('❌ Произошла ошибка. Попробуйте позже.')
      }
    })

    // 🎯 ИНТЕРАКТИВНАЯ КОМАНДА СТАТИСТИКИ
    setupInteractiveStats(bot)

    // 👑 АДМИНСКИЕ КОМАНДЫ
    bot.command('addbalance', requireAdmin(), handleAddBalanceCommand)
    bot.command('checkbalance', requireAdmin(), handleCheckBalanceCommand)

    // 🤖 АВТОФИКСЕР КОМАНДЫ
    setupAutoFixerCommands(bot)

    // 📊 КОМАНДА АНАЛИЗА РАСХОДОВ
    bot.use(expenseAnalysisCommand)

    // 🧪 ТЕСТОВАЯ КОМАНДА ДЛЯ ПРОВЕРКИ СООБЩЕНИЯ ПОСЛЕ ОПЛАТЫ (ТОЛЬКО ДЛЯ АДМИНОВ)
    bot.command('test_payment_message', requireAdmin(), async ctx => {
      if (ctx.chat.type !== 'private') {
        return sendGroupCommandReply(ctx)
      }

      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
      logger.info('TEST COMMAND: test_payment_message', {
        telegramId: ctx.from?.id,
      })

      try {
        // Сначала отправляем сообщение об активации подписки
        await ctx.reply(
          isRu
            ? `🎉 Ваша подписка "NEUROVIDEO" успешно оформлена и активна! Пользуйтесь ботом.`
            : `🎉 Your subscription "NEUROVIDEO" has been successfully activated! Enjoy the bot.`
        )

        // Получаем канал для вступления
        const { getSubScribeChannel } = await import(
          '@/handlers/getSubScribeChannel'
        )
        const channelId = await getSubScribeChannel(ctx)

        if (channelId) {
          const chatInviteMessage = isRu
            ? `Нейро путник, твоя подписка активирована ✨

Хочешь вступить в чат для общения и стать частью креативного сообщества?

В этом чате ты: 
🔹 можешь задавать вопросы и получать ответы (да, лично от меня)
🔹 делиться своими работами и быть в сотворчестве с другими нейро путниками  
🔹станешь частью тёплого, креативного комьюнити

Если да, нажимай на кнопку «Я с вами» и добро пожаловать 🤗 

А если нет, продолжай самостоятельно и нажми кнопку «Я сам»`
            : `Neuro traveler, your subscription is activated ✨

Want to join the chat for communication and become part of the creative community?

In this chat you:
🔹 can ask questions and get answers (yes, personally from me)
🔹 share your work and be in co-creation with other neuro travelers
🔹 become part of a warm, creative community

If yes, click the "I'm with you" button and welcome 🤗

If not, continue on your own and click the "I myself" button`

          await ctx.reply(chatInviteMessage, {
            reply_markup: {
              inline_keyboard: [
                [
                  {
                    text: isRu ? '👋 ☺️ Я с вами' : "👋 ☺️ I'm with you",
                    url: channelId.startsWith('@')
                      ? `https://t.me/${channelId.slice(1)}`
                      : channelId.startsWith('http')
                        ? channelId
                        : `https://t.me/${channelId}`,
                  },
                ],
                [
                  {
                    text: isRu ? '🙅🙅‍♀️ Я сам' : '🙅🙅‍♀️ I myself',
                    callback_data: 'continue_solo',
                  },
                ],
              ],
            },
          })
        } else {
          await ctx.reply(
            isRu
              ? '⚠️ Канал для вступления не настроен'
              : '⚠️ Channel for joining is not configured'
          )
        }
      } catch (error) {
        logger.error('Error in test_payment_message command:', {
          error,
          telegramId: ctx.from?.id,
        })
        await ctx.reply(
          isRu
            ? '❌ Ошибка при тестировании сообщения'
            : '❌ Error testing message'
        )
      }
    })

    bot.command('test_upscale', requireAdmin(), async ctx => {
      if (ctx.chat.type !== 'private') {
        return sendGroupCommandReply(ctx)
      }

      // ✅ ИСПОЛЬЗУЕМ НОВУЮ ЦЕНТРАЛИЗОВАННУЮ СИСТЕМУ (БЕЗ ЗАПРОСОВ К БД!)
      const isRu = isRussianFromState(ctx)
      logger.info('TEST COMMAND: test_upscale', {
        telegramId: ctx.from?.id,
      })

      try {
        // Используем тестовое изображение
        const testImageUrl =
          'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png'

        const { upscaleFluxKontextImage } = await import(
          '@/services/generateFluxKontext'
        )

        await upscaleFluxKontextImage({
          imageUrl: testImageUrl,
          telegram_id: ctx.from?.id?.toString() || '',
          username: ctx.from?.username || 'test_user',
          is_ru: isRu,
          ctx: ctx,
          originalPrompt: 'Test upscale',
        })
      } catch (error) {
        logger.error('Error in test_upscale command:', {
          error: error instanceof Error ? error.message : 'Unknown error',
          telegramId: ctx.from?.id,
        })

        await ctx.reply(
          isRu
            ? '❌ Ошибка при тестировании апскейлера.'
            : '❌ Error testing upscaler.'
        )
      }
    })

    // 7. ✅ РЕГИСТРИРУЕМ MULTI-PHOTO ACTION HANDLERS
    logger.info('🔧 [MULTI-PHOTO] Registering multi-photo action handlers')
    registerMultiPhotoActions(bot)

    // 8. ✅ РЕГИСТРИРУЕМ AUTONOMOUS MONITOR КОМАНДЫ
    logger.info(
      '🤖 [AUTONOMOUS MONITOR] Registering autonomous monitor commands'
    )
    setupAutonomousMonitor(bot)

    // 9. ДОПОЛНИТЕЛЬНЫЕ ACTION-ОБРАБОТЧИКИ (не навигация)
    // ⚠️ ВАЖНО: Основные навигационные action-обработчики (go_main_menu, go_help, go_back)
    // уже зарегистрированы в registerNavigationActions() внутри initializeNavigation()
    // Здесь регистрируем только специфичные обработчики, не связанные с навигацией

    bot.action(
      'continue_solo',
      createMessageActionHandler('continue_solo', isRu =>
        isRu
          ? '👍 Отлично! Продолжайте пользоваться ботом самостоятельно. Если понадобится помощь - обращайтесь!'
          : '👍 Great! Continue using the bot on your own. If you need help - feel free to ask!'
      )
    )

    bot.action(
      'upscale_image',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()

        const { telegramId, username, isRu } = getUserInfoFromContext(ctx)

        if (!telegramId) {
          await ctx.reply(
            isRu ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
          )
          return
        }

        if (!ctx.session?.lastGeneratedImageUrl) {
          await ctx.reply(
            isRu
              ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте изображение с помощью FLUX Kontext.'
              : '❌ No image to upscale. Please generate an image with FLUX Kontext first.'
          )
          return
        }

        const { upscaleFluxKontextImage } = await import(
          '@/services/generateFluxKontext'
        )
        await upscaleFluxKontextImage({
          imageUrl: ctx.session.lastGeneratedImageUrl,
          telegram_id: telegramId,
          username,
          is_ru: isRu,
          ctx,
          originalPrompt: ctx.session.lastGeneratedPrompt,
        })
      }, 'upscale_image')
    )

    bot.action(
      'upscale_neurophoto_image',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()

        const { telegramId, username, isRu } = getUserInfoFromContext(ctx)

        if (!telegramId) {
          logger.error(
            'No telegram_id found in upscale_neurophoto_image action'
          )
          await ctx.reply(
            isRu ? '❌ Ошибка получения ID пользователя.' : '❌ User ID error.'
          )
          return
        }

        if (!ctx.session?.lastNeuroPhotoImageUrl) {
          logger.warn('No lastNeuroPhotoImageUrl in session', {
            telegramId,
            sessionData: JSON.stringify(ctx.session || {}),
          })
          await ctx.reply(
            isRu
              ? '❌ Нет изображения для увеличения качества. Сначала сгенерируйте нейрофото.'
              : '❌ No image to upscale. Please generate a neurophoto first.'
          )
          return
        }

        await ctx.reply(
          isRu
            ? '⌛ Увеличиваем качество нейрофото... Пожалуйста, подождите'
            : '⌛ Upscaling neurophoto quality... Please wait'
        )

        logger.info('🔴 BEFORE UPSCALE_IMAGE CALL', {
          telegram_id: telegramId,
          username,
          imageUrl: ctx.session.lastNeuroPhotoImageUrl,
          prompt: ctx.session.lastNeuroPhotoPrompt,
          is_ru: isRu,
        })

        const { upscaleImage } = await import('@/services/imageUpscaler')
        const result = await upscaleImage({
          imageUrl: ctx.session.lastNeuroPhotoImageUrl,
          telegram_id: telegramId,
          username,
          is_ru: isRu,
          ctx,
          originalPrompt:
            ctx.session.lastNeuroPhotoPrompt || 'Neurophoto upscale',
        })

        logger.info('🟢 AFTER UPSCALE_IMAGE CALL', {
          telegram_id: telegramId,
          result: result ? 'Success' : 'No result',
        })
      }, 'upscale_neurophoto_image')
    )

    // Оптимизированные обработчики через фабрики
    bot.action(
      'more_editing',
      createMessageActionHandler(
        'more_editing',
        isRu =>
          isRu
            ? '📷 Отправьте новое изображение для редактирования:'
            : '📷 Send a new image for editing:',
        {
          afterReply: async ctx => {
            if (ctx.session) {
              ctx.session.awaitingFluxKontextImage = true
            }
          },
        }
      )
    )

    bot.action(
      'different_mode',
      createSceneActionHandler('different_mode', 'ai_photoshop_scene')
    )

    bot.action(
      'new_neurophoto_prompt',
      createSceneActionHandler(
        'new_neurophoto_prompt',
        ModeEnum.CheckBalanceScene,
        {
          beforeEnter: async ctx => {
            ctx.session.mode = ModeEnum.NeuroPhoto
          },
          afterEnter: async ctx => {
            const isRu = isRussianFromState(ctx)
            await ctx.reply(
              isRu
                ? '🆕 Начинаем создание нового нейрофото! Опишите, какую фотографию вы хотите сгенерировать.'
                : '🆕 Starting creation of a new neurophoto! Describe what kind of photo you want to generate.'
            )
          },
        }
      )
    )

    bot.action(
      'create_more_text_to_video',
      createSceneActionHandler(
        'create_more_text_to_video',
        ModeEnum.TextToVideo,
        {
          requireSubscription: true,
          subscriptionFeature: 'Text-to-Video',
          beforeEnter: async ctx => {
            ctx.session.mode = ModeEnum.TextToVideo
          },
        }
      )
    )

    bot.action(
      'create_more_image_to_video',
      createSceneActionHandler(
        'create_more_image_to_video',
        ModeEnum.ImageToVideo,
        {
          requireSubscription: true,
          subscriptionFeature: 'Image-to-Video',
          beforeEnter: async ctx => {
            ctx.session.mode = ModeEnum.ImageToVideo
          },
        }
      )
    )

    bot.action(
      'change_size',
      createSceneActionHandler('change_size', ModeEnum.SizeWizard)
    )

    bot.action(
      'improve_prompt',
      createSceneActionHandler('improve_prompt', ModeEnum.ImprovePromptWizard)
    )

    bot.action(
      'go_to_subscription_scene',
      createSceneActionHandler(
        'go_to_subscription_scene',
        ModeEnum.SubscriptionScene,
        {
          beforeEnter: async ctx => {
            ctx.session.mode = ModeEnum.SubscriptionScene
          },
          afterEnter: async () => {
            logger.info(
              'Successfully entered subscription scene via global action'
            )
          },
        }
      )
    )

    bot.action(
      /^subscribe_(.+)$/,
      withErrorHandling(async ctx => {
        const subscriptionType = ctx.match[1]
        logger.info('🚀 INLINE CALLBACK: Subscribe button pressed', {
          telegramId: ctx.from?.id,
          subscriptionType,
        })

        await ctx.answerCbQuery()
        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.SubscriptionScene
        logger.info('About to enter subscription scene via inline callback')
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
        logger.info(
          'Successfully entered subscription scene via inline callback'
        )
      }, 'subscribe_*')
    )

    bot.action(
      'update_video_status',
      withErrorHandling(async ctx => {
        await handleVideoStatusUpdate(ctx)
      }, 'update_video_status')
    )

    bot.action(
      'subscription_menu',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()
        await ctx.deleteMessage().catch(() => {
          // Игнорируем ошибку если сообщение уже удалено
        })
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      }, 'subscription_menu')
    )

    bot.action(
      'main_menu',
      withErrorHandling(async ctx => {
        await ctx.answerCbQuery()
        await ctx.deleteMessage().catch(() => {
          // Игнорируем ошибку если сообщение уже удалено
        })
        await showMainMenu(ctx)
      }, 'main_menu')
    )

    bot.action(
      /^lip_sync_model_(.+)$/,
      withErrorHandling(async ctx => {
        const modelId = ctx.match[1]
        logger.info('🎭 GLOBAL ACTION: lip_sync_model selected', {
          telegramId: ctx.from?.id,
          modelId,
        })

        await ctx.answerCbQuery()

        const targetScene =
          modelId === 'veed_fabric' ? 'veed_fabric_lipsync' : 'lip_sync'

        ctx.session.selectedLipSyncModel = modelId

        logger.info(
          `🔄 [LIP_SYNC] Routing to ${targetScene} for model ${modelId}`,
          {
            telegramId: ctx.from?.id,
          }
        )

        await ctx.scene.enter(targetScene)
      }, 'lip_sync_model_*')
    )

    // 9. Обработчик фото для FLUX Kontext
    bot.on(message('photo'), async ctx => {
      logger.info('🎯 GLOBAL PHOTO HANDLER: Photo received', {
        telegramId: ctx.from?.id,
        currentScene: ctx.scene?.current?.id,
        awaitingFluxKontextImage: ctx.session?.awaitingFluxKontextImage,
        awaitingFluxKontextImageA: ctx.session?.awaitingFluxKontextImageA,
        awaitingFluxKontextImageB: ctx.session?.awaitingFluxKontextImageB,
        sessionExists: !!ctx.session,
        sessionKeys: ctx.session ? Object.keys(ctx.session) : [],
      })

      // ВАЖНО: Проверяем, находится ли пользователь в AI Reels wizard
      const currentSceneId = ctx.scene?.current?.id
      if (
        currentSceneId === 'ai_reels_wizard' ||
        currentSceneId === 'ai_reels_entry' ||
        currentSceneId === 'ai_reels_render_wizard'
      ) {
        logger.info(
          '🎬 GLOBAL PHOTO HANDLER: Photo is for AI Reels wizard, skipping global handler',
          {
            telegramId: ctx.from?.id,
            currentScene: currentSceneId,
          }
        )
        // НЕ обрабатываем фото глобально, пусть wizard сам обработает
        return
      }

      // Проверяем, находится ли пользователь в других wizard'ах, которые обрабатывают фото
      const photoWizards = [
        'neuro_photo',
        'neuro_photo_v2',
        'face_swap',
        'image_to_video',
        'ai_photoshop_scene',
        'morphing_wizard',
        'avatar_transform',
        'digital_avatar_body',
        'digital_avatar_body_2',
        'veed_fabric_lipsync',
      ]

      if (currentSceneId && photoWizards.includes(currentSceneId)) {
        logger.info(
          '📸 GLOBAL PHOTO HANDLER: Photo is for wizard scene, skipping global handler',
          {
            telegramId: ctx.from?.id,
            currentScene: currentSceneId,
          }
        )
        return
      }

      // Проверяем, ожидает ли пользователь загрузку изображения для FLUX Kontext
      if (ctx.session?.awaitingFluxKontextImage) {
        const { handleFluxKontextImage } = await import(
          '@/commands/fluxKontextCommand'
        )
        await handleFluxKontextImage(ctx)
        return
      }

      // Если не ожидаем FLUX Kontext изображение, передаем дальше
      logger.info(
        '🎯 GLOBAL PHOTO HANDLER: Photo not for FLUX Kontext, skipping',
        {
          telegramId: ctx.from?.id,
          currentScene: ctx.scene?.current?.id,
          reason: 'not_awaiting_flux_image',
        }
      )
    })

    // Commands registered successfully
    logger.info(
      '✅ [NavigationService] All commands and handlers registered successfully'
    )
  } catch (error) {
    console.error('🔧 [ERROR] registerCommands FUNCTION FAILED:', error)
    logger.error('🔧 [ERROR] registerCommands FUNCTION FAILED:', {
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}
