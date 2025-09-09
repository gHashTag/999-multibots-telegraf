/**
 * 🏗️ ЖЕЛЕЗОБЕТОННАЯ СИСТЕМА МЕНЮ
 * Централизованная инициализация и управление всеми кнопками меню
 * Исключает дублирование и несогласованность
 */

import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes.fixed'
import { menuActionHandler, MenuAction } from './MenuActionHandler'
import { configManager } from './ConfigManager'
import { levels } from '@/menu/mainMenu'
import { logger } from '@/utils/logger'

export class MenuSystem {
  private static instance: MenuSystem
  private initialized = false

  private constructor() {}

  public static getInstance(): MenuSystem {
    if (!MenuSystem.instance) {
      MenuSystem.instance = new MenuSystem()
    }
    return MenuSystem.instance
  }

  /**
   * Инициализация всей системы меню (вызывается ОДИН раз при старте бота)
   */
  public async initialize(bot: Telegraf<MyContext>): Promise<void> {
    if (this.initialized) {
      logger.warn('MenuSystem already initialized')
      return
    }

    try {
      // Убеждаемся что ConfigManager инициализирован
      await configManager.initialize()

      // Регистрируем все действия меню
      this.registerAllMenuActions()

      // Настраиваем обработчики в боте
      this.setupBotHandlers(bot)

      this.initialized = true
      logger.info('MenuSystem initialized successfully', {
        actionsCount: menuActionHandler.getAllActions().length,
      })
    } catch (error) {
      logger.error('MenuSystem initialization failed', { error })
      throw error
    }
  }

  /**
   * Регистрация всех действий меню в одном месте
   */
  private registerAllMenuActions(): void {
    // 🎭 ОСНОВНЫЕ ФУНКЦИИ (требуют подписки)
    const mainFeatures: MenuAction[] = [
      {
        titleRu: levels[1].title_ru, // '🤖 Цифровое тело'
        titleEn: levels[1].title_en,
        mode: ModeEnum.DigitalAvatarBody,
        requiresSubscription: true,
      },
      {
        titleRu: levels[2].title_ru, // '📸 Нейрофото'
        titleEn: levels[2].title_en,
        mode: ModeEnum.NeuroPhoto,
        requiresSubscription: true,
      },
      {
        titleRu: levels[3].title_ru, // '🔍 Промпт из фото'
        titleEn: levels[3].title_en,
        mode: ModeEnum.ImageToPrompt,
        requiresSubscription: true,
      },
      {
        titleRu: levels[4].title_ru, // '🧠 Мозг аватара'
        titleEn: levels[4].title_en,
        mode: ModeEnum.Avatar,
        requiresSubscription: true,
      },
      {
        titleRu: levels[5].title_ru, // '💭 Чат с аватаром'
        titleEn: levels[5].title_en,
        mode: ModeEnum.ChatWithAvatar,
        requiresSubscription: true,
      },
      {
        titleRu: levels[6].title_ru, // '🤖 Выбор модели ИИ'
        titleEn: levels[6].title_en,
        mode: ModeEnum.SelectModel,
        requiresSubscription: true,
      },
      {
        titleRu: levels[7].title_ru, // '🎤 Голос аватара'
        titleEn: levels[7].title_en,
        mode: ModeEnum.Voice,
        requiresSubscription: true,
      },
      {
        titleRu: levels[8].title_ru, // '🎙️ Текст в голос'
        titleEn: levels[8].title_en,
        mode: ModeEnum.TextToSpeech,
        requiresSubscription: true,
      },
      {
        titleRu: levels[9].title_ru, // '🎥 Фото в видео'
        titleEn: levels[9].title_en,
        mode: ModeEnum.ImageToVideo,
        requiresSubscription: true,
      },
      {
        titleRu: levels[10].title_ru, // '🎥 Видео из текста'
        titleEn: levels[10].title_en,
        mode: ModeEnum.TextToVideo,
        requiresSubscription: true,
      },
      {
        titleRu: levels[11].title_ru, // '🖼️ Генерация изображений'
        titleEn: levels[11].title_en,
        mode: ModeEnum.TextToImage,
        requiresSubscription: true,
      },
      {
        titleRu: levels[12].title_ru, // '🎨 FLUX Kontext'
        titleEn: levels[12].title_en,
        mode: ModeEnum.FluxKontext,
        requiresSubscription: true,
        sceneToEnter: 'flux_kontext_scene',
      },
      {
        titleRu: levels[107].title_ru, // '⬆️ Увеличить качество фото'
        titleEn: levels[107].title_en,
        mode: ModeEnum.ImageUpscaler,
        requiresSubscription: true,
      },
      {
        titleRu: levels[108].title_ru, // '📺 Транскрибация Reels'
        titleEn: levels[108].title_en,
        mode: ModeEnum.VideoTranscription,
        requiresSubscription: true,
      },
    ]

    // 🔧 СЛУЖЕБНЫЕ ФУНКЦИИ (не требуют подписки)
    const serviceFeatures: MenuAction[] = [
      {
        titleRu: levels[100].title_ru, // '💎 Пополнить баланс'
        titleEn: levels[100].title_en,
        mode: ModeEnum.TopUpBalance,
        requiresSubscription: false,
        sceneToEnter: ModeEnum.PaymentScene,
        customHandler: this.handleTopUpBalance.bind(this),
      },
      {
        titleRu: levels[101].title_ru, // '💰 Баланс'
        titleEn: levels[101].title_en,
        mode: ModeEnum.Balance,
        requiresSubscription: false,
        sceneToEnter: ModeEnum.BalanceScene,
        customHandler: this.handleBalance.bind(this),
      },
      {
        titleRu: levels[102].title_ru, // '👥 Пригласить друга'
        titleEn: levels[102].title_en,
        mode: ModeEnum.Invite,
        requiresSubscription: false,
        sceneToEnter: 'inviteScene',
      },
      {
        titleRu: levels[103].title_ru, // '💬 Техподдержка'
        titleEn: levels[103].title_en,
        mode: ModeEnum.Help,
        requiresSubscription: false,
        sceneToEnter: ModeEnum.Help,
      },
      {
        titleRu: levels[105].title_ru, // '💫 Оформить подписку'
        titleEn: levels[105].title_en,
        mode: ModeEnum.Subscribe,
        requiresSubscription: false,
        sceneToEnter: ModeEnum.SubscriptionScene,
      },
    ]

    // 👑 АДМИНСКИЕ ФУНКЦИИ
    const adminFeatures: MenuAction[] = [
      {
        titleRu: levels[14].title_ru, // '🎤 Kling Lip Sync'
        titleEn: levels[14].title_en,
        mode: ModeEnum.LipSync,
        requiresSubscription: true,
        adminOnly: true,
      },
      {
        titleRu: levels[109].title_ru, // '🔍 Мониторинг конкурентов'
        titleEn: levels[109].title_en,
        mode: 'competitor_monitoring',
        requiresSubscription: false,
        adminOnly: true,
        customHandler: this.handleCompetitorMonitoring.bind(this),
      },
      {
        titleRu: '🤖 Цифровое тело 2',
        titleEn: '🤖 Digital Body 2',
        mode: ModeEnum.DigitalAvatarBodyV2,
        requiresSubscription: true,
        adminOnly: true,
      },
      {
        titleRu: '📸 Нейрофото 2',
        titleEn: '📸 NeuroPhoto 2',
        mode: ModeEnum.NeuroPhotoV2,
        requiresSubscription: true,
        adminOnly: true,
      },
      {
        titleRu: '🔍 Парсинг',
        titleEn: '🔍 Parsing',
        mode: 'parsing',
        requiresSubscription: false,
        adminOnly: true,
        sceneToEnter: 'instagram_scraping_wizard',
      },
    ]

    // 🔄 НАВИГАЦИОННЫЕ КНОПКИ
    const navigationFeatures: MenuAction[] = [
      {
        titleRu: '🏠 Главное меню',
        titleEn: '🏠 Main menu',
        mode: ModeEnum.MainMenu,
        requiresSubscription: false,
        sceneToEnter: ModeEnum.MainMenu,
      },
      {
        titleRu: 'Отмена',
        titleEn: 'Cancel',
        mode: ModeEnum.MainMenu,
        requiresSubscription: false,
        sceneToEnter: ModeEnum.MainMenu,
      },
    ]

    // Регистрируем все действия
    const allActions = [
      ...mainFeatures,
      ...serviceFeatures,
      ...adminFeatures,
      ...navigationFeatures,
    ]

    allActions.forEach(action => menuActionHandler.registerAction(action))

    logger.info('All menu actions registered', {
      mainFeatures: mainFeatures.length,
      serviceFeatures: serviceFeatures.length,
      adminFeatures: adminFeatures.length,
      navigationFeatures: navigationFeatures.length,
      total: allActions.length,
    })
  }

  /**
   * Настройка обработчиков бота
   */
  private setupBotHandlers(bot: Telegraf<MyContext>): void {
    // УНИВЕРСАЛЬНЫЙ ОБРАБОТЧИК для всех кнопок меню
    bot.on('text', async (ctx, next) => {
      const text = ctx.message.text

      // ВАЖНО: Пропускаем команды - они обрабатываются до этого обработчика
      if (text.startsWith('/')) {
        await next()
        return
      }

      // Проверяем, является ли это действием меню
      if (menuActionHandler.isMenuAction(text)) {
        await menuActionHandler.handleAction(ctx, text)
        return
      }

      // Если не кнопка меню, то передаем дальше (в другие обработчики)
      await next()
    })

    // Экстренный обработчик подписки
    bot.hears(/подписк|Subscribe/i, async ctx => {
      logger.info('Emergency subscription handler triggered', {
        text: ctx.message?.text,
        telegramId: ctx.from?.id,
      })
      
      try {
        if (ctx.scene.current) {
          await ctx.scene.leave()
        }
        await ctx.scene.enter(ModeEnum.SubscriptionScene)
      } catch (error) {
        logger.error('Emergency subscription handler error', { error })
        await ctx.reply('Переходим к оформлению подписки...')
      }
    })
  }

  /**
   * Кастомный обработчик для пополнения баланса
   */
  private async handleTopUpBalance(ctx: MyContext): Promise<void> {
    // Логика проверки подписки для пополнения баланса
    const { getReferalsCountAndUserData } = await import('@/core/supabase')
    const { SubscriptionType } = await import('@/interfaces/subscription.interface')
    const { isRussianFromState } = await import('@/helpers/centralizedLanguage')
    
    const telegramId = ctx.from?.id?.toString() || ''
    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)
    const isRu = isRussianFromState(ctx)

    if (!subscriptionType || subscriptionType === SubscriptionType.STARS) {
      const message = isRu
        ? '❌ <b>Пополнение баланса недоступно без подписки</b>\n\n💫 Нажмите "Оформить подписку" в главном меню'
        : '❌ <b>Balance top-up is not available without subscription</b>\n\n💫 Press "Subscribe" in the main menu'
      
      await ctx.replyWithHTML(message)
      return
    }

    // Продолжаем стандартную логику
    if (ctx.session) {
      ctx.session.mode = ModeEnum.TopUpBalance
      ctx.session.subscription = subscriptionType
    }
    
    if (ctx.scene.current) {
      await ctx.scene.leave()
    }
    await ctx.scene.enter(ModeEnum.PaymentScene)
  }

  /**
   * Кастомный обработчик для просмотра баланса
   */
  private async handleBalance(ctx: MyContext): Promise<void> {
    // Аналогично handleTopUpBalance, но для просмотра баланса
    const { getReferalsCountAndUserData } = await import('@/core/supabase')
    const { SubscriptionType } = await import('@/interfaces/subscription.interface')
    const { isRussianFromState } = await import('@/helpers/centralizedLanguage')
    
    const telegramId = ctx.from?.id?.toString() || ''
    const { subscriptionType } = await getReferalsCountAndUserData(telegramId)
    const isRu = isRussianFromState(ctx)

    if (!subscriptionType || subscriptionType === SubscriptionType.STARS) {
      const message = isRu
        ? '❌ <b>Просмотр баланса недоступен без подписки</b>\n\n💫 Нажмите "Оформить подписку" в главном меню'
        : '❌ <b>Balance view is not available without subscription</b>\n\n💫 Press "Subscribe" in the main menu'
      
      await ctx.replyWithHTML(message)
      return
    }

    // Продолжаем стандартную логику
    if (ctx.session) {
      ctx.session.mode = ModeEnum.Balance
    }
    
    if (ctx.scene.current) {
      await ctx.scene.leave()
    }
    await ctx.scene.enter(ModeEnum.BalanceScene)
  }

  /**
   * Кастомный обработчик для мониторинга конкурентов
   */
  private async handleCompetitorMonitoring(ctx: MyContext): Promise<void> {
    // Здесь можно добавить специальную логику для мониторинга конкурентов
    if (ctx.scene.current) {
      await ctx.scene.leave()
    }
    // await ctx.scene.enter('competitor_monitoring_scene')
    await ctx.reply('🔍 Функция мониторинга конкурентов в разработке')
  }

  /**
   * Проверка инициализации
   */
  public isInitialized(): boolean {
    return this.initialized
  }
}

// Экспорт singleton экземпляра
export const menuSystem = MenuSystem.getInstance()