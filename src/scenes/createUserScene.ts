import { MyTextMessageContext, MyWizardContext } from '@/interfaces'
import { WizardScene } from 'telegraf/scenes'
import {
  createUser,
  getReferalsCountAndUserData,
  incrementBalance,
} from '@/core/supabase'
import { getPhotoUrl } from '@/handlers/getPhotoUrl'
import { getSubScribeChannel } from '@/handlers'
import { isRussian } from '@/helpers/language'

const BONUS_AMOUNT = 100

const createUserStep = async (ctx: MyTextMessageContext) => {
  console.log('CASE:createUserStep', ctx.from)

  const {
    username,
    id: telegram_id,
    first_name,
    last_name,
    is_bot,
    language_code,
  } = ctx.from

  const finalUsername = username || first_name || telegram_id.toString()
  const photo_url = getPhotoUrl(ctx, 1)

  // Проверка на полную ссылку или просто команду /start
  const botNameMatch = ctx.message.text.match(
    /https:\/\/t\.me\/([a-zA-Z0-9_]+)\?start=(\d+)/
  )
  console.log('botNameMatch', botNameMatch)
  let botName = ''
  let startNumber = ''
  console.log('botName', botName)
  console.log('startNumber', startNumber)

  if (botNameMatch) {
    botName = botNameMatch[1]
    startNumber = botNameMatch[2]
  } else if (ctx.message.text.startsWith('/start')) {
    console.log(
      'CASE: 🔄 Команда /start. botInfo.username:',
      ctx.botInfo.username
    )
    console.log('ctx.message.text', ctx.message.text)
    // Обработка команды /start без ссылки
    botName = ctx.botInfo.username
    const parts = ctx.message.text.split(' ')
    console.log('parts', parts)
    startNumber = parts.length > 1 ? parts[1] : ''
  }

  ctx.session.inviteCode = startNumber

  const SUBSCRIBE_CHANNEL_ID = getSubScribeChannel(ctx)

  if (ctx.session.inviteCode) {
    console.log('CASE: ctx.session.inviteCode', ctx.session.inviteCode)
    const { count, userData } = await getReferalsCountAndUserData(
      ctx.session.inviteCode.toString()
    )

    ctx.session.inviter = userData.user_id

    const newCount = count + 1
    if (ctx.session.inviteCode) {
      await ctx.telegram.sendMessage(
        ctx.session.inviteCode,
        isRussian(ctx)
          ? `🔗 Новый пользователь зарегистрировался по вашей ссылке: @${finalUsername}.\n🆔 Уровень аватара: ${count}\n🎁 За каждого приглашенного друга вы получаете дополнительные ${BONUS_AMOUNT} звезд для генерации!\n🤑 Ваш новый баланс: ${
              userData.balance + BONUS_AMOUNT
            }⭐️ `
          : `🔗 New user registered through your link: @${finalUsername}.🆔 Avatar level: ${count}\n🎁 For each friend you invite, you get additional ${BONUS_AMOUNT} stars for generation!\n🤑 Your new balance: ${
              userData.balance + BONUS_AMOUNT
            }⭐️`
      )
      await incrementBalance({
        telegram_id: ctx.session.inviteCode,
        amount: BONUS_AMOUNT,
      })
      await ctx.telegram.sendMessage(
        `@${SUBSCRIBE_CHANNEL_ID}`,
        `🔗 Новый пользователь зарегистрировался в боте: @${finalUsername}. По реферальной ссылке от: @${userData.username}.\n🆔 Уровень аватара: ${newCount}\n🎁 Получил(a) бонус в размере ${BONUS_AMOUNT}⭐️ на свой баланс.\nСпасибо за участие в нашей программе!`
      )
    }
  } else {
    console.log('CASE: ctx.session.inviteCode not exists')

    const { count } = await getReferalsCountAndUserData(telegram_id.toString())
    await ctx.telegram.sendMessage(
      `@${SUBSCRIBE_CHANNEL_ID}`,
      `🔗 Новый пользователь зарегистрировался в боте: @${finalUsername}.\n🆔 Уровень аватара: ${count}.`
    )
  }

  const userData = {
    username: finalUsername,
    telegram_id: telegram_id.toString(),
    first_name: first_name || null,
    last_name: last_name || null,
    is_bot: is_bot || false,
    language_code: language_code || 'en',
    photo_url,
    chat_id: ctx.chat?.id || null,
    mode: 'clean',
    model: 'gpt-4-turbo',
    count: 0,
    aspect_ratio: '9:16',
    balance: 100,
    inviter: ctx.session.inviter || null,
    bot_name: botName,
  }

  await createUser(userData)
  await ctx.reply(
    isRussian(ctx)
      ? '✅ Аватар успешно создан!'
      : '✅ Avatar created successfully!'
  )
  return ctx.scene.enter('subscriptionCheckScene')
}

export const createUserScene = new WizardScene<MyWizardContext>(
  'createUserScene',
  createUserStep
)
