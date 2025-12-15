import { logger } from '@/utils/logger'
import { MyTextMessageContext } from '@/interfaces'
import { Scenes } from 'telegraf'
import { createUser, getReferalsCountAndUserData } from '@/core/supabase'
import { supabase } from '@/core/supabase'

import { getPhotoUrl } from '@/handlers/getPhotoUrl'

import { isRussianFromState } from '@/helpers/centralizedLanguage'
import { MyContext } from '@/interfaces'
import { ModeEnum } from '@/interfaces/modes'
import {
  extractInviteCodeFromContext,
  extractPromoFromContext,
} from '@/helpers/contextUtils'
import { processPromoLink } from '@/helpers/promoHelper'
import { telegramLogService } from '@/services/telegram-log.service'
import { analyzeAvatar } from '@/services/analyzeAvatar'
import { updateUserGender } from '@/core/supabase/updateUserGender'
import { inngest, INNGEST_EVENTS } from '@/inngest_app/client'

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

  ctx.session.botName = botName

  // Use extracted invite code if available, otherwise use legacy extraction
  // Only set referral code if it's not a promo link AND it's a numeric code
  if (!ctx.session.inviteCode && startNumber && !promoInfo?.isPromo) {
    // Check if startNumber is numeric (referral code) and not "promo"
    if (/^\d+$/.test(startNumber)) {
      ctx.session.inviteCode = startNumber
    }
  }

  // ВАЖНО: Получаем inviter ДО создания пользователя
  let inviterUserId = null
  let inviterUserData = null
  if (ctx.session.inviteCode) {
    console.log(
      '🔍 [CreateUserScene] Looking up inviter by telegram_id:',
      ctx.session.inviteCode
    )
    const { userData: inviterData } = await getReferalsCountAndUserData(
      ctx.session.inviteCode.toString()
    )
    if (inviterData && inviterData.user_id) {
      inviterUserId = inviterData.user_id
      inviterUserData = inviterData // Сохраняем данные inviter для уведомлений
      ctx.session.inviter = inviterUserId
      console.log('✅ [CreateUserScene] Found inviter UUID:', inviterUserId)
    } else {
      console.log(
        '⚠️ [CreateUserScene] Inviter not found for telegram_id:',
        ctx.session.inviteCode
      )
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
    inviter: inviterUserId, // Используем найденный inviter UUID
    bot_name: botName,
  }

  console.log('📝 [CreateUserScene] Creating user with data:', {
    telegram_id: userData.telegram_id,
    username: userData.username,
    inviter: userData.inviter,
    inviteCode: ctx.session.inviteCode,
  })

  const [wasCreated] = await createUser(userData)

  // Проверяем, был ли пользователь только что создан
  if (wasCreated) {
    // Если да, сообщаем об успешном создании
    await ctx.reply(
      isRussianFromState(ctx)
        ? '✅ Аватар успешно создан! Добро пожаловать!'
        : '✅ Avatar created successfully! Welcome!'
    )

    // 🎁 WELCOME AVATAR GENERATION: Analyze avatar and generate free portrait
    try {
      if (userPhotoUrl) {
        logger.info('🎁 [CreateUserScene] Analyzing avatar for welcome generation', {
          telegram_id: telegram_id.toString(),
          hasAvatar: true,
        })

        // Analyze avatar to detect face and gender
        const avatarAnalysis = await analyzeAvatar(userPhotoUrl)

        if (avatarAnalysis.hasFace) {
          // Save detected gender to database
          if (avatarAnalysis.gender !== 'unknown') {
            await updateUserGender(telegram_id.toString(), avatarAnalysis.gender)
            logger.info('🎁 [CreateUserScene] Gender saved from avatar analysis', {
              telegram_id: telegram_id.toString(),
              gender: avatarAnalysis.gender,
              confidence: avatarAnalysis.confidence,
            })
          }

          // Trigger welcome avatar generation via Inngest
          await inngest.send({
            name: INNGEST_EVENTS.WELCOME_AVATAR_GENERATE,
            data: {
              telegram_id: telegram_id.toString(),
              avatarUrl: userPhotoUrl,
              gender: avatarAnalysis.gender,
              bot_name: ctx.botInfo.username,
              username: finalUsername,
              is_ru: isRussianFromState(ctx),
            },
          })

          await ctx.reply(
            isRussianFromState(ctx)
              ? '🎁 Готовим ваш первый нейро-портрет в подарок... Это займёт несколько секунд!'
              : '🎁 Preparing your first AI portrait as a gift... This will take a few seconds!'
          )

          logger.info('🎁 [CreateUserScene] Welcome avatar generation triggered', {
            telegram_id: telegram_id.toString(),
            gender: avatarAnalysis.gender,
          })
        } else {
          // No face detected - skip welcome generation
          logger.info('🎁 [CreateUserScene] No face detected on avatar, skipping welcome generation', {
            telegram_id: telegram_id.toString(),
          })
        }
      } else {
        // No avatar - skip welcome generation
        logger.info('🎁 [CreateUserScene] No avatar available, skipping welcome generation', {
          telegram_id: telegram_id.toString(),
        })
      }
    } catch (welcomeError) {
      // Don't block user flow if welcome generation fails
      logger.error('🎁 [CreateUserScene] Welcome avatar generation error (non-blocking)', {
        telegram_id: telegram_id.toString(),
        error: welcomeError instanceof Error ? welcomeError.message : String(welcomeError),
      })
    }

    // Handle promo logic (new users only)
    if (promoInfo?.isPromo) {
      try {
        // Determine promo type from parameter
        let promoType = 'neurovideo' // default
        if (promoInfo.parameter) {
          const param = promoInfo.parameter.toLowerCase()
          if (param === 'neurophoto' || param === 'photo') {
            promoType = 'neurophoto'
          } else if (param === 'neurovideo' || param === 'video') {
            promoType = 'neurovideo'
          }
        }

        const promoResult = await processPromoLink(
          telegram_id.toString(),
          promoType,
          ctx.botInfo.username
        )

        if (promoResult) {
          // Устанавливаем флаг, что промо обработано
          ctx.session.promoProcessed = true

          const isRu = isRussianFromState(ctx)
          let message = ''

          if (promoType === 'neurovideo') {
            message = isRu
              ? '🎬 НейроВидео промо-подписка активирована! Вы получили 1303 звезды и доступ к генерации видео! ⭐'
              : '🎬 NeuroVideo promo subscription activated! You got 1303 stars and access to video generation! ⭐'
          } else if (promoType === 'neurophoto') {
            message = isRu
              ? '📸 НейроФото промо-подписка активирована! Вы получили 476 звезд и доступ к генерации фото! ⭐'
              : '📸 NeuroPhoto promo subscription activated! You got 476 stars and access to photo generation! ⭐'
          } else {
            message = isRu
              ? '🎁 Промо-подписка активирована! Звезды добавлены на ваш баланс и активирована подписка! ⭐'
              : '🎁 Promo subscription activated! Stars added to your balance and subscription activated! ⭐'
          }

          await ctx.reply(message)

          // Notify admin channel about promo usage
          try {
            await ctx.telegram.sendMessage(
              SUBSCRIBE_CHANNEL_ID,
              `🎁 Новый пользователь @${finalUsername} получил промо-бонус ${promoType.toUpperCase()}!`
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
          // Промо уже был получен или есть активная подписка - просто логируем, не показываем ошибку
          logger.info(
            '📝 [CreateUserScene] Promo not processed for existing user (already received or has subscription)',
            {
              telegram_id: telegram_id.toString(),
              promoType,
            }
          )
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
          isRussianFromState(ctx)
            ? '❌ Произошла ошибка при обработке промо-ссылки.'
            : '❌ An error occurred while processing the promo link.'
        )
      }
    }

    // Handle referral logic - используем уже полученные данные inviter
    if (ctx.session.inviteCode && inviterUserId) {
      console.log('CASE: Sending referral notifications')

      if (ctx.session.inviteCode) {
        try {
          await ctx.telegram.sendMessage(
            ctx.session.inviteCode,
            isRussianFromState(ctx)
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

        const inviterUsername =
          inviterUserData?.username || ctx.session.inviteCode
        await ctx.telegram.sendMessage(
          SUBSCRIBE_CHANNEL_ID,
          `🔗 Новый пользователь @${finalUsername} зарегистрировался. По реф. ссылке от: @${inviterUsername}`
        )

        // 📨 Логируем в группу НейроМентор
        await telegramLogService.logNewUser({
          telegramId: telegram_id.toString(),
          username: finalUsername,
          referrer: inviterUsername,
          botName: ctx.botInfo.username,
        })

        logger.info({
          message:
            '📢 [CreateUserScene] Уведомление о новом пользователе (с рефералом) отправлено в канал',
          telegramId: telegram_id.toString(),
          channel: SUBSCRIBE_CHANNEL_ID,
          inviterUsername: inviterUserData?.username,
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

        // 📨 Логируем в группу НейроМентор
        await telegramLogService.logNewUser({
          telegramId: telegram_id.toString(),
          username: finalUsername,
          botName: ctx.botInfo.username,
        })

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
        // Determine promo type from parameter
        let promoType = 'neurovideo' // default
        if (promoInfo.parameter) {
          const param = promoInfo.parameter.toLowerCase()
          if (param === 'neurophoto' || param === 'photo') {
            promoType = 'neurophoto'
          } else if (param === 'neurovideo' || param === 'video') {
            promoType = 'neurovideo'
          }
        }

        const promoResult = await processPromoLink(
          telegram_id.toString(),
          promoType,
          ctx.botInfo.username
        )

        if (promoResult) {
          // Устанавливаем флаг, что промо обработано
          ctx.session.promoProcessed = true

          const isRu = isRussianFromState(ctx)
          let message = ''

          if (promoType === 'neurovideo') {
            message = isRu
              ? '🎬 НейроВидео промо-подписка активирована! Вы получили 1303 звезды и доступ к генерации видео! ⭐'
              : '🎬 NeuroVideo promo subscription activated! You got 1303 stars and access to video generation! ⭐'
          } else if (promoType === 'neurophoto') {
            message = isRu
              ? '📸 НейроФото промо-подписка активирована! Вы получили 476 звезд и доступ к генерации фото! ⭐'
              : '📸 NeuroPhoto promo subscription activated! You got 476 stars and access to photo generation! ⭐'
          } else {
            message = isRu
              ? '🎁 Промо-подписка активирована! Звезды добавлены на ваш баланс и активирована подписка! ⭐'
              : '🎁 Promo subscription activated! Stars added to your balance and subscription activated! ⭐'
          }

          await ctx.reply(message)
        } else {
          // Промо уже был получен или есть активная подписка - просто логируем, не показываем ошибку
          logger.info(
            '📝 [CreateUserScene] Promo not processed for existing user (already received or has subscription)',
            {
              telegram_id: telegram_id.toString(),
              promoType,
            }
          )
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
          isRussianFromState(ctx)
            ? '❌ Произошла ошибка при обработке промо-ссылки.'
            : '❌ An error occurred while processing the promo link.'
        )
      }
    }
  }

  // После создания пользователя переходим в AvatarTransform для демонстрации AI
  logger.info(
    '📸 [CreateUserScene] User created/verified, entering AvatarTransform',
    {
      telegram_id: telegram_id.toString(),
      wasCreated,
    }
  )
  return ctx.scene.enter(ModeEnum.AvatarTransform)
}

// Создаем обычную сцену вместо WizardScene
export const createUserScene = new Scenes.BaseScene<MyContext>(
  ModeEnum.CreateUserScene
)

// При входе в сцену сразу создаем пользователя
createUserScene.enter(async ctx => {
  logger.info('🆕 [CreateUserScene] Entering scene to create user', {
    telegram_id: ctx.from?.id,
    inviteCode: ctx.session.inviteCode || 'none',
    username: ctx.from?.username,
    first_name: ctx.from?.first_name,
  })

  // Проверяем наличие пользователя
  if (!ctx.from) {
    logger.error('❌ [CreateUserScene] No from object in context!')
    await ctx.reply('Error: User information not available')
    return ctx.scene.leave()
  }

  // Вызываем функцию создания пользователя напрямую
  // Создаем правильную структуру сообщения с сессией и методами
  const fakeMessage = {
    ...ctx,
    from: ctx.from, // Убедимся, что from передается правильно
    session: ctx.session, // Передаем сессию из реального контекста
    reply: ctx.reply.bind(ctx), // Передаем метод reply
    telegram: ctx.telegram, // Передаем telegram API
    botInfo: ctx.botInfo, // Передаем информацию о боте
    scene: ctx.scene, // Передаем управление сценами
    message: {
      message_id: 0,
      date: Math.floor(Date.now() / 1000),
      chat: ctx.chat || { id: ctx.from.id, type: 'private' },
      text: ctx.session.inviteCode
        ? `/start ${ctx.session.inviteCode}`
        : '/start',
      from: ctx.from,
    },
    updateType: 'message' as const,
  } as MyTextMessageContext

  logger.info('🔄 [CreateUserScene] Calling createUserStep with data', {
    telegram_id: fakeMessage.from?.id,
    username: fakeMessage.from?.username,
    text: fakeMessage.message.text,
  })

  await createUserStep(fakeMessage)
})
