/**
 * Command Registry - Manages bot command registration and handling
 */
import { Telegraf } from 'telegraf'
import { MyContext } from '@/interfaces/telegram-bot.interface'
import { CommandConfig, BotRegistrationContext } from '../shared/types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { checkSubscriptionGuard } from '@/helpers/subscriptionGuard'
import { requireAdmin } from '@/middleware/adminOnly'

export class CommandRegistry {
  private commands: Map<string, CommandConfig> = new Map()

  constructor() {
    this.initializeCommands()
  }

  // Register all commands with the bot
  registerCommands(context: BotRegistrationContext): void {
    const { bot } = context

    // Register individual commands
    for (const [commandName, config] of this.commands.entries()) {
      this.registerSingleCommand(bot, commandName, config)
    }

    // Register special commands that need custom logic
    this.registerSpecialCommands(bot)
  }

  private registerSingleCommand(bot: Telegraf<MyContext>, commandName: string, config: CommandConfig): void {
    let handler = config.handler

    // Wrap with admin check if required
    if (config.adminOnly) {
      const adminMiddleware = requireAdmin()
      handler = async (ctx: MyContext) => {
        await adminMiddleware(ctx, async () => {
          await config.handler(ctx)
        })
      }
    }

    // Wrap with subscription check if required
    if (config.requiresSubscription) {
      const originalHandler = handler
      handler = async (ctx: MyContext) => {
        const hasSubscription = await checkSubscriptionGuard(ctx, commandName)
        if (hasSubscription) {
          await originalHandler(ctx)
        }
      }
    }

    // Register the command
    bot.command(commandName, async (ctx) => {
      if (ctx.chat.type !== 'private') {
        return this.sendGroupCommandReply(ctx)
      }

      try {
        await handler(ctx)
      } catch (error) {
        logger.error(`Error in command ${commandName}:`, {
          error,
          telegramId: ctx.from?.id,
          command: commandName
        })

        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? `❌ Ошибка при выполнении команды /${commandName}.`
            : `❌ Error executing command /${commandName}.`
        )
      }
    })

    logger.info(`Command registered: /${commandName}`, {
      requiresSubscription: config.requiresSubscription,
      adminOnly: config.adminOnly
    })
  }

  private registerSpecialCommands(bot: Telegraf<MyContext>): void {
    // Start command with special logic
    bot.command('start', async (ctx) => {
      if (ctx.chat.type !== 'private') {
        return this.sendGroupCommandReply(ctx)
      }

      const telegramId = ctx.from?.id?.toString() || 'unknown'

      // Anti-spam protection
      const now = Date.now()
      const lastStartTime = (ctx.session as any).lastStartCommand || 0
      const timeDiff = now - lastStartTime
      const minInterval = 2000

      if (timeDiff < minInterval) {
        logger.info('Start command spam detected, ignoring', {
          telegramId,
          timeDiff
        })
        return
      }

      (ctx.session as any).lastStartCommand = now

      try {
        // Reset session
        const { defaultSession } = await import('@/store')
        ctx.session = { ...defaultSession }

        // Handle start parameters
        if (ctx.message && 'text' in ctx.message) {
          const parts = ctx.message.text.split(' ')
          if (parts.length > 1) {
            const startParam = parts[1]

            const { extractPromoFromContext } = await import('@/helpers/contextUtils')
            const promoInfo = extractPromoFromContext(ctx)

            if (!promoInfo?.isPromo && /^\d+$/.test(startParam)) {
              ctx.session.inviteCode = startParam
              logger.info('Referral code set', { telegramId, startParam })
            }
          }
        }

        await ctx.scene.leave()

        // Check if user exists
        const { getUserDetailsSubscription } = await import('@/core/supabase')
        const userDetails = await getUserDetailsSubscription(telegramId)

        if (!userDetails.isExist) {
          await ctx.scene.enter(ModeEnum.CreateUserScene)
        } else {
          await ctx.scene.leave()
          const { showMainMenu } = await import('@/services/NavigationService')
          await showMainMenu(ctx)
        }
      } catch (error) {
        logger.error('Error in start command:', { error, telegramId })

        const isRu = isRussianFromState(ctx)
        await ctx.reply(
          isRu
            ? '❌ Произошла ошибка. Попробуйте снова.'
            : '❌ An error occurred. Please try again.'
        )
      }
    })

    // Menu command with subscription check
    bot.command('menu', async (ctx) => {
      if (ctx.chat.type !== 'private') {
        return
      }

      try {
        await ctx.scene.leave()
        const telegramId = ctx.from?.id?.toString() || 'unknown'

        const { getUserDetailsSubscription } = await import('@/core/supabase')
        const { simulateSubscriptionForDev } = await import('@/scenes/menuScene/helpers/simulateSubscription')
        const { isDev } = await import('@/config')

        const userDetails = await getUserDetailsSubscription(telegramId)
        const effectiveSubscription = simulateSubscriptionForDev(
          userDetails?.subscriptionType || null,
          isDev
        )

        if (!effectiveSubscription || effectiveSubscription === 'STARS') {
          ctx.session.mode = ModeEnum.SubscriptionScene
          await ctx.scene.enter(ModeEnum.SubscriptionScene)
          return
        }

        ctx.session.mode = ModeEnum.MainMenu
        await ctx.scene.leave()
        const { showMainMenu } = await import('@/services/NavigationService')
        await showMainMenu(ctx)
      } catch (error) {
        logger.error('Error in menu command:', {
          error,
          telegramId: ctx.from?.id,
        })

        await ctx.reply('🏠 Главное меню временно недоступно. Попробуйте /start')
      }
    })
  }

  private initializeCommands(): void {
    // Support command
    this.commands.set('support', {
      command: 'support',
      description: '💬 Техподдержка / Support',
      handler: async (ctx) => {
        await ctx.scene.leave()
        const { handleTechSupport } = await import('@/commands/handleTechSupport')
        await handleTechSupport(ctx)
      }
    })

    // Get100 command
    this.commands.set('get100', {
      command: 'get100',
      description: '🎁 Получить 100 звезд / Get 100 stars',
      requiresSubscription: true,
      handler: async (ctx) => {
        if (!ctx.session.userModel) {
          ctx.session.userModel = {
            model_name: 'default',
            trigger_word: '',
            model_url: 'placeholder/placeholder:placeholder',
            finetune_id: '',
          }
        }
        const { get100Command } = await import('@/commands/get100Command')
        await get100Command(ctx)
      }
    })

    // Price command
    this.commands.set('price', {
      command: 'price',
      description: '💰 Цены / Prices',
      requiresSubscription: true,
      handler: async (ctx) => {
        const { priceCommand } = await import('@/commands/priceCommand')
        return priceCommand(ctx)
      }
    })

    // Kontext command
    this.commands.set('kontext', {
      command: 'kontext',
      description: '🎨 FLUX Kontext редактирование / FLUX Kontext editing',
      requiresSubscription: true,
      handler: async (ctx) => {
        logger.info('COMMAND /kontext: FLUX Kontext image editing started', {
          telegramId: ctx.from?.id,
        })

        await ctx.scene.leave()
        const { handleFluxKontextCommand } = await import('@/commands/fluxKontextCommand')
        await handleFluxKontextCommand(ctx)
      }
    })

    // Instagram command
    this.commands.set('instagram', {
      command: 'instagram',
      description: '📸 Instagram парсинг / Instagram parsing',
      handler: async (ctx) => {
        logger.info('COMMAND /instagram: Instagram competitor analysis started', {
          telegramId: ctx.from?.id,
        })

        const userId = ctx.from?.id?.toString()
        const botToken = ctx.telegram.token

        if (!userId) {
          await ctx.reply('❌ Ошибка: не удалось определить пользователя.')
          return
        }

        const { getParsingAccess } = await import('@/menu/simpleMenu')
        const parsingAccess = getParsingAccess(userId, botToken)

        if (!parsingAccess.hasAccess) {
          await ctx.reply('❌ У вас нет доступа к функции парсинга Instagram.')
          return
        }

        await ctx.scene.leave()
        ctx.session.mode = ModeEnum.InstagramScrapingWizard
        await ctx.scene.enter(ModeEnum.InstagramScrapingWizard)
      }
    })

    // Admin commands
    this.commands.set('addbalance', {
      command: 'addbalance',
      description: '👑 Добавить баланс (админ)',
      adminOnly: true,
      handler: async (ctx) => {
        const { handleAddBalanceCommand } = await import('@/handlers/adminCommands')
        await handleAddBalanceCommand(ctx)
      }
    })

    this.commands.set('checkbalance', {
      command: 'checkbalance',
      description: '👑 Проверить баланс (админ)',
      adminOnly: true,
      handler: async (ctx) => {
        const { handleCheckBalanceCommand } = await import('@/handlers/adminCommands')
        await handleCheckBalanceCommand(ctx)
      }
    })

    // Test commands for admins
    this.commands.set('test_payment_message', {
      command: 'test_payment_message',
      description: '🧪 Тест сообщения оплаты (админ)',
      adminOnly: true,
      handler: async (ctx) => {
        await this.handleTestPaymentMessage(ctx)
      }
    })

    this.commands.set('test_upscale', {
      command: 'test_upscale',
      description: '🧪 Тест апскейлера (админ)',
      adminOnly: true,
      handler: async (ctx) => {
        await this.handleTestUpscale(ctx)
      }
    })
  }

  private async handleTestPaymentMessage(ctx: MyContext): Promise<void> {
    const isRu = isRussianFromState(ctx)

    try {
      await ctx.reply(
        isRu
          ? `🎉 Ваша подписка "NEUROVIDEO" успешно оформлена и активна! Пользуйтесь ботом.`
          : `🎉 Your subscription "NEUROVIDEO" has been successfully activated! Enjoy the bot.`
      )

      const { getSubScribeChannel } = await import('@/handlers/getSubScribeChannel')
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
              [{
                text: isRu ? '👋 ☺️ Я с вами' : "👋 ☺️ I'm with you",
                url: channelId.startsWith('@')
                  ? `https://t.me/${channelId.slice(1)}`
                  : channelId.startsWith('http') ? channelId : `https://t.me/${channelId}`,
              }],
              [{
                text: isRu ? '🙅🙅‍♀️ Я сам' : '🙅🙅‍♀️ I myself',
                callback_data: 'continue_solo',
              }],
            ],
          },
        })
      }
    } catch (error) {
      logger.error('Error in test_payment_message command:', {
        error,
        telegramId: ctx.from?.id,
      })
    }
  }

  private async handleTestUpscale(ctx: MyContext): Promise<void> {
    const isRu = isRussianFromState(ctx)

    try {
      const testImageUrl = 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/PNG_transparency_demonstration_1.png/280px-PNG_transparency_demonstration_1.png'

      const { upscaleFluxKontextImage } = await import('@/services/generateFluxKontext')

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
  }

  private async sendGroupCommandReply(ctx: MyContext): Promise<void> {
    try {
      const botUsername = ctx.botInfo.username
      const message = `🕉️ Привет! Команды для меня, ${botUsername}, работают только в нашем личном чате. ✨\n\nЯ часть большой семьи ботов! 🤖❤️ Чтобы пообщаться со мной или использовать мои возможности, пожалуйста, напиши мне напрямую: @${botUsername}\n\n*Ом Шанти!* 🙏`
      await ctx.reply(message)
    } catch (error) {
      logger.error('Error replying to command in group:', {
        error: error instanceof Error ? error.message : String(error),
        botUsername: ctx.botInfo?.username,
        chatId: ctx.chat?.id,
      })
    }
  }

  // Get all registered commands
  getCommands(): Map<string, CommandConfig> {
    return new Map(this.commands)
  }

  // Add a new command
  addCommand(commandName: string, config: CommandConfig): void {
    this.commands.set(commandName, config)
  }
}