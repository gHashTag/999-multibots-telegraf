import { Scenes, Markup } from 'telegraf'
import {
  normalizeTelegramId,
  type TelegramId,
} from '@/interfaces/telegram.interface'
import { type MyContext } from '@/interfaces'
import {
  getTranslation as getDbTranslation,
  getUserDetailsSubscription,
  createUser,
  getReferalsCountAndUserData,
} from '@/core/supabase'
import { BOT_URLS } from '@/core/bot'
import { logger } from '@/utils/logger'
import { levels } from '@/menu/mainMenu'
import { ModeEnum } from '@/interfaces/modes'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { isRussian } from '@/helpers/language'
import { TelegramError } from 'telegraf'
import type { Message } from 'telegraf/types'

// --- Dependencies Interface for the Core Logic Function ---
export interface ProcessStartDependencies {
  getUserDetailsSubscription: typeof getUserDetailsSubscription
  createUser: typeof createUser
  getReferalsCountAndUserData: typeof getReferalsCountAndUserData
  getTranslation: (args: {
    key: string
    bot_name: string
    language_code: string | undefined
  }) => Promise<{ translation: string; url: string | null }>
  isRussian: (langCode: string | undefined) => boolean
  getPhotoUrl: (ctx: MyContext, index?: number) => string | null
  reply: (text: string, extra?: any) => Promise<Message.TextMessage>
  replyWithPhoto: (url: string, extra?: any) => Promise<Message.PhotoMessage>
  sendMessage: (chatId: string | number, text: string) => Promise<any>
  logger: typeof logger
}

// --- Input Data Interface for the Core Logic Function ---
export interface ProcessStartData {
  telegramId: string
  username?: string
  firstName?: string
  lastName?: string
  isBot?: boolean
  languageCode?: string
  chatId?: number
  inviteCode?: string | null
  botName: string
  photoUrl?: string | null
}

// --- Core Logic Function ---
export async function processStartCommand(
  data: ProcessStartData,
  dependencies: ProcessStartDependencies
): Promise<boolean> {
  const { logger, isRussian } = dependencies
  const { telegramId, botName, inviteCode, languageCode } = data
  const finalUsername = data.username || data.firstName || telegramId
  const subscribeChannelId = process.env.SUBSCRIBE_CHANNEL_ID
  const isRu = isRussian(languageCode)

  try {
    logger.info(`[ProcessStart] Checking user: ${telegramId}`, {
      function: 'processStartCommand',
    })
    const userDetails =
      await dependencies.getUserDetailsSubscription(telegramId)
    logger.info(`[ProcessStart] User exists: ${userDetails.isExist}`, {
      function: 'processStartCommand',
    })

    if (!userDetails.isExist) {
      // --- New User Logic ---
      logger.info(`[ProcessStart] New user flow for ${telegramId}`, {
        function: 'processStartCommand',
      })
      const finalUsernameCreate = data.username || data.firstName || telegramId
      let inviterId: string | null = null

      // Referral Logic
      try {
        if (inviteCode) {
          logger.info(`[ProcessStart] Processing referral code ${inviteCode}`, {
            function: 'processStartCommand',
          })
          const { count, userData: refUserData } =
            await dependencies.getReferalsCountAndUserData(
              inviteCode.toString()
            )
          inviterId = refUserData?.user_id || null

          // Notify referrer
          if (inviterId) {
            try {
              await dependencies.sendMessage(
                inviteCode,
                isRu
                  ? `🔗 Новый пользователь @${finalUsernameCreate} зарегистрировался по вашей ссылке.\n🆔 Уровень: ${count}`
                  : `🔗 New user @${finalUsernameCreate} registered via your link.\n🆔 Level: ${count}`
              )
            } catch (err) {
              logger.error('[ProcessStart] Failed to notify referrer', {
                error: err,
                function: 'processStartCommand',
              })
            }
          }

          // Notify admin (with ref)
          if (subscribeChannelId) {
            try {
              const targetChatId =
                typeof subscribeChannelId === 'string' &&
                !subscribeChannelId.startsWith('-')
                  ? `@${subscribeChannelId}`
                  : subscribeChannelId
              await dependencies.sendMessage(
                targetChatId,
                `[${botName}] 🔗 Новый пользователь @${finalUsernameCreate} (ID: ${telegramId}) по реф. от @${refUserData?.username}`
              )
            } catch (pulseErr) {
              logger.error(
                '[ProcessStart] Failed to notify admin (new user with ref)',
                { error: pulseErr, function: 'processStartCommand' }
              )
            }
          } else {
            logger.warn(
              '[ProcessStart] SUBSCRIBE_CHANNEL_ID not set for admin notification',
              { function: 'processStartCommand' }
            )
          }
        } else {
          // No referral
          logger.info(`[ProcessStart] No referral code for ${telegramId}`, {
            function: 'processStartCommand',
          })
          // Notify admin (no ref)
          if (subscribeChannelId) {
            try {
              const targetChatId =
                typeof subscribeChannelId === 'string' &&
                !subscribeChannelId.startsWith('-')
                  ? `@${subscribeChannelId}`
                  : subscribeChannelId
              await dependencies.sendMessage(
                targetChatId,
                `[${botName}] 🔗 Новый пользователь @${finalUsernameCreate} (ID: ${telegramId})`
              )
            } catch (pulseErr) {
              logger.error(
                '[ProcessStart] Failed to notify admin (new user no ref)',
                { error: pulseErr, function: 'processStartCommand' }
              )
            }
          } else {
            logger.warn(
              '[ProcessStart] SUBSCRIBE_CHANNEL_ID not set for admin notification',
              { function: 'processStartCommand' }
            )
          }
        }
      } catch (error) {
        logger.error('[ProcessStart] Error processing referral logic', {
          error,
          function: 'processStartCommand',
        })
      }

      // Create User
      const userDataToCreate = {
        username: finalUsernameCreate,
        telegram_id: telegramId,
        first_name: data.firstName || null,
        last_name: data.lastName || null,
        is_bot: data.isBot || false,
        language_code: data.languageCode || 'en',
        photo_url: data.photoUrl,
        chat_id: data.chatId || null,
        mode: 'clean',
        model: 'gpt-4-turbo',
        count: 0,
        aspect_ratio: '9:16',
        balance: 0,
        inviter: inviterId,
        bot_name: botName,
        finetune_id: '',
      }
      try {
        logger.info(`[ProcessStart] Creating user ${telegramId}`, {
          function: 'processStartCommand',
        })
        const [wasCreated] = await dependencies.createUser(
          userDataToCreate,
          null as any
        )
        if (wasCreated) {
          logger.info(
            `[ProcessStart] User ${telegramId} created successfully`,
            { function: 'processStartCommand' }
          )
          console.log('[DEBUG] Before Reply 1 (New User Welcome)')
          await dependencies.reply(
            isRu
              ? '✅ Аватар успешно создан! Добро пожаловать!'
              : '✅ Avatar created successfully! Welcome!'
          )
        } else {
          logger.warn(
            `[ProcessStart] User ${telegramId} creation reported as false`,
            { function: 'processStartCommand' }
          )
        }
      } catch (error) {
        logger.error('[ProcessStart] Error creating user', {
          error,
          function: 'processStartCommand',
        })
        console.log('[DEBUG] Before Reply 2 (New User Creation Error)')
        await dependencies.reply(
          isRu
            ? '❌ Произошла ошибка при регистрации. Попробуйте позже.'
            : '❌ An error occurred during registration. Please try again later.'
        )
        return false
      }
    } else {
      // --- Existing User Logic ---
      logger.info(`[ProcessStart] Existing user flow for ${telegramId}`, {
        function: 'processStartCommand',
      })
      // Notify admin about restart
      if (subscribeChannelId) {
        try {
          const targetChatId =
            typeof subscribeChannelId === 'string' &&
            !subscribeChannelId.startsWith('-')
              ? `@${subscribeChannelId}`
              : subscribeChannelId
          await dependencies.sendMessage(
            targetChatId,
            `[${botName}] 🔄 Пользователь @${finalUsername} (ID: ${telegramId}) перезапустил бота (/start).`
          )
        } catch (notifyError) {
          logger.error(
            '[ProcessStart] Failed to notify admin (existing user restart)',
            { error: notifyError, function: 'processStartCommand' }
          )
        }
      } else {
        logger.warn(
          '[ProcessStart] SUBSCRIBE_CHANNEL_ID not set for admin notification',
          { function: 'processStartCommand' }
        )
      }
    }

    // --- Welcome Message & Tutorial (Common for New and Existing) ---
    try {
      logger.info(
        `[ProcessStart] Getting translation for 'start' for ${telegramId}`,
        { function: 'processStartCommand' }
      )
      const { translation, url } = await dependencies.getTranslation({
        key: 'start',
        bot_name: botName,
        language_code: languageCode,
      })
      logger.info(
        `[ProcessStart] Translation received: ${translation ? 'Yes' : 'No'}, Url: ${url ? 'Yes' : 'No'}`,
        { function: 'processStartCommand' }
      )

      if (url && url.trim() !== '') {
        logger.info(`[ProcessStart] Sending welcome photo to ${telegramId}`, {
          function: 'processStartCommand',
        })
        await dependencies.replyWithPhoto(url, { caption: translation })
      } else {
        logger.info(`[ProcessStart] Sending welcome text to ${telegramId}`, {
          function: 'processStartCommand',
        })
        await dependencies.reply(
          translation || (isRu ? 'Добро пожаловать!' : 'Welcome!'),
          { parse_mode: 'Markdown' }
        )
      }

      const tutorialUrl = BOT_URLS[botName]
      let replyKeyboard

      if (tutorialUrl) {
        logger.info(`[ProcessStart] Sending tutorial link to ${telegramId}`, {
          function: 'processStartCommand',
        })
        const tutorialText = isRu
          ? `🎬 Посмотрите [видео-инструкцию](${tutorialUrl}), как создавать нейрофото в этом боте.\n\nВ этом видео вы научитесь тренировать свою модель (Цифровое тело аватара), создавать фотографии и получать prompt из любого фото, которым вы вдохновились.`
          : `🎬 Watch this [tutorial video](${tutorialUrl}) on how to create neurophotos in this bot.\n\nIn this video, you will learn how to train your model (Digital avatar body), create photos, and get a prompt from any photo that inspires you.`

        replyKeyboard = Markup.keyboard([
          Markup.button.text(
            isRu ? levels[105].title_ru : levels[105].title_en
          ),
          Markup.button.text(
            isRu ? levels[103].title_ru : levels[103].title_en
          ),
        ]).resize()

        await dependencies.reply(tutorialText, {
          parse_mode: 'Markdown',
          reply_markup: replyKeyboard.reply_markup,
        })
      } else {
        logger.info(`[ProcessStart] Tutorial URL not found for ${botName}`, {
          function: 'processStartCommand',
        })
        replyKeyboard = Markup.keyboard([
          Markup.button.text(
            isRu ? levels[105].title_ru : levels[105].title_en
          ),
          Markup.button.text(
            isRu ? levels[103].title_ru : levels[103].title_en
          ),
        ]).resize()
        await dependencies.reply(
          isRu ? 'Выберите действие:' : 'Choose an action:',
          {
            reply_markup: replyKeyboard.reply_markup,
          }
        )
      }
    } catch (error) {
      logger.error('[ProcessStart] Error sending welcome/tutorial message', {
        error,
        function: 'processStartCommand',
      })
    }

    logger.info(`[ProcessStart] Completed successfully for ${telegramId}`, {
      function: 'processStartCommand',
    })
    return true
  } catch (error) {
    logger.error('[ProcessStart] Critical error in start scene', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
      function: 'processStartCommand',
    })
    try {
      console.log('[DEBUG] Before Reply 5 (Critical Error Fallback)')
      await dependencies.reply(
        isRu
          ? '❌ Произошла внутренняя ошибка. Попробуйте позже или свяжитесь с поддержкой.'
          : '❌ An internal error occurred. Please try again later or contact support.'
      )
    } catch (replyError) {
      logger.error('[ProcessStart] Failed to send critical error message', {
        replyError,
      })
    }
    return false
  }
}

// --- Wizard Scene Middleware (Wrapper) ---
export const startScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.StartScene,
  async ctx => {
    logger.info('[StartScene Middleware] Entered', { telegramId: ctx.from?.id })
    const telegramId = ctx.from?.id?.toString()
    if (!telegramId) {
      logger.error('[StartScene Middleware] No telegram ID found', {
        ctxFrom: ctx.from,
      })
      await ctx.reply('Произошла ошибка. Не удалось определить ваш ID.')
      return ctx.scene.leave()
    }

    // Extract data from context
    const data: ProcessStartData = {
      telegramId: telegramId,
      username: ctx.from?.username,
      firstName: ctx.from?.first_name,
      lastName: ctx.from?.last_name,
      isBot: ctx.from?.is_bot,
      languageCode: ctx.from?.language_code,
      chatId: ctx.chat?.id,
      inviteCode: ctx.session.inviteCode,
      botName: ctx.botInfo?.username || 'unknown_bot',
      photoUrl: getPhotoUrl(ctx, 1),
    }

    // Create dependencies object, wrapping ctx methods
    const dependencies: ProcessStartDependencies = {
      getUserDetailsSubscription: getUserDetailsSubscription,
      createUser: createUser,
      getReferalsCountAndUserData: getReferalsCountAndUserData,
      getTranslation: args => getDbTranslation({ ...args, ctx: null as any }),
      isRussian: () => isRussian(ctx),
      getPhotoUrl: (context, index) => getPhotoUrl(context || ctx, index),
      reply: (text, extra) => ctx.reply(text, extra),
      replyWithPhoto: (url, extra) => ctx.replyWithPhoto(url, extra),
      sendMessage: (chatId, text) => ctx.telegram.sendMessage(chatId, text),
      logger: logger,
    }

    try {
      logger.info('[StartScene Middleware] Calling processStartCommand', {
        telegramId,
      })
      const success = await processStartCommand(data, dependencies)
      logger.info(
        `[StartScene Middleware] processStartCommand result: ${success}`,
        { telegramId }
      )
    } catch (error) {
      logger.error(
        '[StartScene Middleware] Error calling processStartCommand',
        {
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
          telegramId,
        }
      )
      try {
        await ctx.reply(
          'Произошла непредвиденная ошибка. Попробуйте /start позже.'
        )
      } catch (replyError) {
        logger.error(
          '[StartScene Middleware] Failed to send fallback error message',
          { replyError, telegramId }
        )
      }
    } finally {
      logger.info('[StartScene Middleware] Leaving scene', { telegramId })
      await ctx.scene.leave()
    }
    return
  }
)
