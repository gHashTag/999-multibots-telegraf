import { logger } from '@/utils/logger'
import { MyTextMessageContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { createUser, getReferalsCountAndUserData } from '@/core/supabase'

import { getPhotoUrl } from '@/handlers/getPhotoUrl'

import { isRussian } from '@/helpers/language'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'

const SUBSCRIBE_CHANNEL_ID = '@neuro_blogger_pulse'

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

  const userPhotoUrl = await getPhotoUrl(ctx, ctx.from?.id || 0)
  const botPhotoUrl = await photo_url
  const userData = {
    username: finalUsername,
    telegram_id: telegram_id.toString(),
    first_name: first_name || null,
    last_name: last_name || null,
    is_bot: is_bot || false,
    language_code: language_code || 'en',
    photo_url: userPhotoUrl || botPhotoUrl,
    chat_id: ctx.chat?.id || null,
    mode: 'clean',
    model: 'gpt-4-turbo',
    count: 0,
    aspect_ratio: '9:16',
    balance: 0,
    inviter: ctx.session.inviter || null,
    bot_name: botName,
  }

  const [wasCreated] = await createUser(userData)
  // Проверяем, был ли пользователь только что создан
  if (wasCreated) {
    // Если да, сообщаем об успешном создании
    await ctx.reply(
      isRussian(ctx)
        ? '✅ Аватар успешно создан! Добро пожаловать!'
        : '✅ Avatar created successfully! Welcome!'
    )
    if (ctx.session.inviteCode) {
      console.log('CASE: ctx.session.inviteCode', ctx.session.inviteCode)
      const { count, userData } = await getReferalsCountAndUserData(
        ctx.session.inviteCode.toString()
      )

      ctx.session.inviter = userData.user_id

      if (ctx.session.inviteCode) {
        try {
          await ctx.telegram.sendMessage(
            ctx.session.inviteCode,
            isRussian(ctx)
              ? `🔗 Новый пользователь @${finalUsername} зарегистрировался по вашей ссылке!`
              : `🔗 New user @${finalUsername} registered using your link!`
          )
          logger.info({
            message:
              '✉️ [CreateUserScene] Уведомление пригласившему отправлено',
            telegramId: telegram_id.toString(),
            inviterId: ctx.session.inviteCode,
            step: 'inviter_notification_sent',
          })
        } catch (inviterNotifyError) {
          if (
            inviterNotifyError instanceof Error &&
            'code' in inviterNotifyError &&
            inviterNotifyError.code === 403
          ) {
            logger.warn({
              message:
                '⚠️ [CreateUserScene] Не удалось отправить уведомление пригласившему (возможно, бот заблокирован им)',
              telegramId: telegram_id.toString(),
              inviterId: ctx.session.inviteCode,
              botName: ctx.botInfo.username,
              error: inviterNotifyError.message,
              step: 'inviter_notification_failed_403',
            })
          } else {
            logger.error({
              message:
                '❌ [CreateUserScene] Ошибка при отправке уведомления пригласившему',
              telegramId: telegram_id.toString(),
              inviterId: ctx.session.inviteCode,
              error:
                inviterNotifyError instanceof Error
                  ? inviterNotifyError.message
                  : String(inviterNotifyError),
              step: 'inviter_notification_error',
            })
          }
        }

        await ctx.telegram.sendMessage(
          SUBSCRIBE_CHANNEL_ID,
          `🔗 Новый пользователь @${finalUsername} зарегистрировался. По реф. ссылке от: @${userData.username}`
        )
        logger.info({
          message:
            '📢 [CreateUserScene] Уведомление о новом пользователе (с рефералом) отправлено в канал',
          telegramId: telegram_id.toString(),
          channel: SUBSCRIBE_CHANNEL_ID,
          inviterUsername: userData.username,
          step: 'admin_notification_sent_referral',
        })
      }
    } else {
      console.log('CASE: ctx.session.inviteCode not exists')

      try {
        await ctx.telegram.sendMessage(
          SUBSCRIBE_CHANNEL_ID,
          `🔗 Новый пользователь зарегистрировался в боте: @${finalUsername}`
        )
        logger.info({
          message:
            '📢 [CreateUserScene] Уведомление о новом пользователе (без реферала) отправлено в канал',
          telegramId: telegram_id.toString(),
          channel: SUBSCRIBE_CHANNEL_ID,
          step: 'admin_notification_sent_no_referral',
        })
      } catch (notifyError) {
        if (
          notifyError instanceof Error &&
          'code' in notifyError &&
          notifyError.code === 403
        ) {
          logger.warn({
            message:
              '⚠️ [CreateUserScene] Не удалось отправить уведомление в канал админов (без реферала) (возможно, бот не участник или нет прав)',
            telegramId: telegram_id.toString(),
            channel: SUBSCRIBE_CHANNEL_ID,
            botName: ctx.botInfo.username,
            error: notifyError.message,
            step: 'admin_notification_no_referral_failed_403',
          })
        } else {
          logger.error({
            message:
              '❌ [CreateUserScene] Ошибка при отправке уведомления в канал админов (без реферала)',
            telegramId: telegram_id.toString(),
            channel: SUBSCRIBE_CHANNEL_ID,
            error:
              notifyError instanceof Error
                ? notifyError.message
                : String(notifyError),
            step: 'admin_notification_no_referral_error',
          })
        }
      }
    }
  }
  return ctx.scene.enter(ModeEnum.StartScene)
}

export const createUserScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.CreateUserScene,
  createUserStep
)
