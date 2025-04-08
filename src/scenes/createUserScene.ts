import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import {
  createUser,
  getReferalsCountAndUserData,
  getUserByTelegramIdString,
  CreateUserParams,
  getUserBalance,
} from '@/core/supabase'
import { pulseBot } from '@/core'
import { ModeEnum } from '@/price/helpers/modelsCost'
import { isRussian } from '@/helpers/language'
import { logger } from '@/utils/logger'
import { isValidTelegramId } from '@/interfaces/telegram.interface'

// const BONUS_AMOUNT = 100

const createUserStep = async (ctx: MyContext) => {
  try {
    logger.info('Starting user creation process', { telegram_id: ctx.from?.id })

    if (!ctx.from) {
      throw new Error('User data not found')
    }

    const {
      username = '',
      id,
      first_name = '',
      last_name = '',
      is_bot = false,
      language_code = 'en',
    } = ctx.from

    const telegram_id = id.toString()

    // Проверяем валидность telegram_id
    if (!isValidTelegramId(telegram_id)) {
      throw new Error('Invalid telegram_id format')
    }

    const finalUsername = username || first_name || telegram_id

    if (!ctx.message || !('text' in ctx.message)) {
      throw new Error('Message text not found')
    }

    const messageText = ctx.message.text

    // Проверка на полную ссылку или просто команду /start
    const botNameMatch = messageText.match(
      /https:\/\/t\.me\/([a-zA-Z0-9_]+)\?start=(\d+)/
    )

    let botName = ''
    let startNumber = ''
    logger.debug('Bot registration details', { botName, startNumber })

    if (botNameMatch) {
      botName = botNameMatch[1]
      startNumber = botNameMatch[2]
    } else if (messageText.startsWith('/start')) {
      logger.info('Processing /start command', { 
        botUsername: ctx.botInfo.username,
        messageText 
      })
      botName = ctx.botInfo.username || ''
      const parts = messageText.split(' ')
      startNumber = parts.length > 1 ? parts[1] : ''
    }

    ctx.session.inviteCode = startNumber

    // Проверяем существование пользователя по балансу
    const existingBalance = await getUserBalance(telegram_id, botName)
    if (existingBalance > 0) {
      logger.info('User already exists', { telegram_id, botName })
      await ctx.reply(
        isRussian(ctx)
          ? '✅ С возвращением!'
          : '✅ Welcome back!'
      )
      return ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
    }

    if (ctx.session.inviteCode) {
      logger.info('Processing invite code', { inviteCode: ctx.session.inviteCode })
      const { userData } = await getReferalsCountAndUserData(
        ctx.session.inviteCode.toString()
      )

      if (userData) {
        ctx.session.inviter = userData.user_id

        await ctx.telegram.sendMessage(
          ctx.session.inviteCode,
          isRussian(ctx)
            ? `🔗 Новый пользователь зарегистрировался по вашей ссылке: ${finalUsername}.`
            : `🔗 New user registered through your link: ${finalUsername}.`
        )

        const user = await getUserByTelegramIdString(ctx.session.inviteCode)
        if (user?.username) {
          await ctx.telegram.sendMessage(
            `@neuro_blogger_pulse`,
            `🔗 Новый пользователь зарегистрировался в боте: ${finalUsername}. По реферальной ссылке: @${user.username}`
          )
        }
      }
    } else {
      try {
        await pulseBot.telegram.sendMessage(
          `@neuro_blogger_pulse`,
          `🔗 Новый пользователь зарегистрировался в боте: ${finalUsername}.`
        )
      } catch (error) {
        // Игнорируем ошибку отправки в канал, так как это не критично для регистрации
        logger.warn('Failed to send message to channel', { error })
      }
    }

    const newUserData: CreateUserParams = {
      username: finalUsername,
      telegram_id,
      first_name: first_name || undefined,
      last_name: last_name || undefined,
      is_bot,
      language_code,
      photo_url: '',
      chat_id: ctx.chat?.id?.toString(),
      mode: 'clean',
      model: 'gpt-4-turbo',
      count: 0,
      aspect_ratio: '9:16',
      bot_name: botName,
    }

    await createUser(newUserData)
    
    // Проверяем, что пользователь действительно создан
    const userBalance = await getUserBalance(telegram_id, botName)
    if (userBalance === 0) {
      throw new Error('Failed to create user - balance check failed')
    }
    
    await ctx.reply(
      isRussian(ctx)
        ? '✅ Регистрация успешно завершена!'
        : '✅ Registration completed successfully!'
    )
    
    return ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
  } catch (error) {
    logger.error('Error in createUserStep', { 
      error: error instanceof Error ? error.message : String(error),
      telegram_id: ctx.from?.id 
    })

    const errorMessage = isRussian(ctx)
      ? '❌ Произошла ошибка при регистрации. Пожалуйста, попробуйте позже или обратитесь в поддержку.'
      : '❌ Registration error occurred. Please try again later or contact support.'

    await ctx.reply(errorMessage)
    return ctx.scene.enter(ModeEnum.MainMenu)
  }
}

export const createUserScene = new WizardScene<MyContext>(
  ModeEnum.CreateUserScene,
  createUserStep
)

