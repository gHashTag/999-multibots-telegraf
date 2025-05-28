import { logger } from '@/utils/logger'
import { MyTextMessageContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { createUser, getReferalsCountAndUserData } from '@/core/supabase'

import { getPhotoUrl } from '@/handlers/getPhotoUrl'

import { isRussian } from '@/helpers/language'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import {
  extractInviteCodeFromContext,
  extractPromoFromContext,
} from '@/helpers/contextUtils'
import { processPromoLink } from '@/helpers/promoHelper'

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

  // Extract invite code using the helper function
  const inviteCode = extractInviteCodeFromContext(ctx)
  ctx.session.inviteCode = inviteCode

  // Extract promo information using the helper function
  const promoInfo = extractPromoFromContext(ctx)

  // Log promo detection
  if (promoInfo?.isPromo) {
    logger.info('🎁 [CreateUserScene] Promo link detected', {
      telegram_id: telegram_id.toString(),
      promoParameter: promoInfo.parameter,
      function: 'createUserStep',
    })
  }

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

  // Use extracted invite code if available, otherwise use legacy extraction
  // Only set referral code if it's not a promo link AND it's a numeric code
  if (!ctx.session.inviteCode && startNumber && !promoInfo?.isPromo) {
    // Check if startNumber is numeric (referral code) and not "promo"
    if (/^\d+$/.test(startNumber)) {
      ctx.session.inviteCode = startNumber
    }
  }

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

    // Handle promo logic (new users only)
    if (promoInfo?.isPromo) {
      try {
        const promoResult = await processPromoLink(
          telegram_id.toString(),
          promoInfo.parameter || 'neurovideo_promo',
          ctx.botInfo.username
        )

        if (promoResult) {
          const isRu = isRussian(ctx)
          const message = isRu
            ? '🎁 Промо-бонус успешно получен! Вы получили бесплатные звезды!'
            : '🎁 Promo bonus received! You got free stars!'

          await ctx.reply(message)

          // Notify admin channel about promo usage
          try {
            await ctx.telegram.sendMessage(
              SUBSCRIBE_CHANNEL_ID,
              `🎁 Новый пользователь @${finalUsername} получил промо-бонус! Параметр: ${promoInfo.parameter || 'default'}`
            )
          } catch (notifyError) {
            logger.warn(
              '⚠️ [CreateUserScene] Failed to notify admin channel about promo usage',
              {
                telegram_id: telegram_id.toString(),
                error:
                  notifyError instanceof Error
                    ? notifyError.message
                    : String(notifyError),
              }
            )
          }
        } else {
          const isRu = isRussian(ctx)
          const message = isRu
            ? '❌ Вы уже получили этот промо-бонус!'
            : '❌ You have already received this promo bonus!'

          await ctx.reply(message)
        }
      } catch (promoError) {
        logger.error('❌ [CreateUserScene] Error processing promo link', {
          telegram_id: telegram_id.toString(),
          promoParameter: promoInfo.parameter,
          error:
            promoError instanceof Error
              ? promoError.message
              : String(promoError),
        })

        await ctx.reply(
          isRussian(ctx)
            ? '❌ Произошла ошибка при обработке промо-ссылки.'
            : '❌ An error occurred while processing the promo link.'
        )
      }
    }

    // Handle referral logic (existing code)
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
        const notificationMessage = promoInfo?.isPromo
          ? `🎁 Новый пользователь зарегистрировался в боте: @${finalUsername} (через промо-ссылку)`
          : `🔗 Новый пользователь зарегистрировался в боте: @${finalUsername}`

        await ctx.telegram.sendMessage(
          SUBSCRIBE_CHANNEL_ID,
          notificationMessage
        )
        logger.info({
          message:
            '📢 [CreateUserScene] Уведомление о новом пользователе (без реферала) отправлено в канал',
          telegramId: telegram_id.toString(),
          channel: SUBSCRIBE_CHANNEL_ID,
          step: 'admin_notification_sent_no_referral',
          isPromo: promoInfo?.isPromo || false,
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
  } else {
    // User already exists - check if they're accessing via promo link
    if (promoInfo?.isPromo) {
      try {
        const promoResult = await processPromoLink(
          telegram_id.toString(),
          promoInfo.parameter || 'neurovideo_promo',
          ctx.botInfo.username
        )

        if (promoResult) {
          const isRu = isRussian(ctx)
          const message = isRu
            ? '🎁 Промо-бонус успешно получен! Вы получили бесплатные звезды!'
            : '🎁 Promo bonus received! You got free stars!'

          await ctx.reply(message)
        } else {
          const isRu = isRussian(ctx)
          const message = isRu
            ? '❌ Вы уже получили этот промо-бонус!'
            : '❌ You have already received this promo bonus!'

          await ctx.reply(message)
        }
      } catch (promoError) {
        logger.error(
          '❌ [CreateUserScene] Error processing promo link for existing user',
          {
            telegram_id: telegram_id.toString(),
            promoParameter: promoInfo.parameter,
            error:
              promoError instanceof Error
                ? promoError.message
                : String(promoError),
          }
        )

        await ctx.reply(
          isRussian(ctx)
            ? '❌ Произошла ошибка при обработке промо-ссылки.'
            : '❌ An error occurred while processing the promo link.'
        )
      }
    }
  }

  return ctx.scene.enter(ModeEnum.StartScene)
}

export const createUserScene = new Scenes.WizardScene<MyContext>(
  ModeEnum.CreateUserScene,
  createUserStep
)
