import { MyContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import {
  createUser,
  getReferalsCountAndUserData,
  getUserByTelegramIdString,
  CreateUserParams,
} from '@/core/supabase'

import { ModeEnum } from '@/interfaces/modes'
import { isRussian } from '@/helpers/language'

// const BONUS_AMOUNT = 100

const createUserStep = async (ctx: MyContext) => {
  console.log('CASE:createUserStep', ctx.from)

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
  console.log('botName', botName)
  console.log('startNumber', startNumber)

  if (botNameMatch) {
    botName = botNameMatch[1]
    startNumber = botNameMatch[2]
  } else if (messageText.startsWith('/start')) {
    console.log(
      'CASE: 🔄 Команда /start. botInfo.username:',
      ctx.botInfo.username
    )
    console.log('messageText', messageText)
    // Обработка команды /start без ссылки
    botName = ctx.botInfo.username || ''
    const parts = messageText.split(' ')
    console.log('parts', parts)
    startNumber = parts.length > 1 ? parts[1] : ''
  }

  ctx.session.inviteCode = startNumber

  // const SUBSCRIBE_CHANNEL_ID = await getSubScribeChannel(ctx)
  // console.log('SUBSCRIBE_CHANNEL_ID', SUBSCRIBE_CHANNEL_ID)

  if (ctx.session.inviteCode) {
    console.log('CASE: ctx.session.inviteCode', ctx.session.inviteCode)
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
      await ctx.telegram.sendMessage(
        `@neuro_blogger_pulse`,
        `🔗 Новый пользователь зарегистрировался в боте: ${finalUsername}.`
      )
    } catch (error) {
      console.error('Ошибка в createUserStep:', error)
      return ctx.reply(
        'Произошла ошибка при создании аватара. Попробуйте позже.'
      )
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
  await ctx.reply(
    isRussian(ctx)
      ? '✅ Аватар успешно создан!'
      : '✅ Avatar created successfully!'
  )
  return ctx.scene.enter(ModeEnum.SubscriptionCheckScene)
}

export const createUserScene = new WizardScene<MyContext>(
  ModeEnum.CreateUserScene,
  createUserStep
)
