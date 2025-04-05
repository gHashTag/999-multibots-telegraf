import { TelegramId } from '@/interfaces/telegram.interface'
import { Context, Scenes } from 'telegraf'
import { isRussian } from '@/helpers'
import { setPayments, getTranslation } from '@/core/supabase'
import { Message } from 'telegraf/typings/core/types/typegram'
import { updateUserSubscription } from '@/core/supabase/updateUserSubscription'
import { MyContext } from '@/interfaces'

import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'

import { createBotByName } from '@/core/bot'
// Используйте SessionFlavor для добавления сессий
interface SessionData {
  subscription: string
  telegram_id: TelegramId
  email: string
}

type PaymentContext = Context &
  MyContext &
  Scenes.SceneContext & {
    session: SessionData
    message: {
      successful_payment?: {
        total_amount: number
        invoice_payload: string
      }
    } & Message
  }

/**
 * Получает список владельцев бота из таблицы avatars
 */
async function getBotOwners(botName: string): Promise<string[]> {
  try {
    const { data, error } = await supabase
      .from('avatars')
      .select('telegram_id')
      .eq('bot_name', botName)

    if (error) {
      logger.error('❌ Ошибка при получении владельцев бота:', {
        description: 'Error fetching bot owners',
        error,
        botName,
      })
      return []
    }

    return data.map(owner => owner.telegram_id.toString())
  } catch (error) {
    logger.error('❌ Непредвиденная ошибка при получении владельцев бота:', {
      description: 'Unexpected error fetching bot owners',
      error,
      botName,
    })
    return []
  }
}

async function sendNotification(ctx: MyContext, message: string) {
  try {
    const botData = await createBotByName(ctx.botInfo.username)
    if (!botData) {
      logger.error('❌ Токен бота не найден', {
        description: 'Bot token not found',
        botName: ctx.botInfo.username,
      })
      return
    }

    const { groupId, bot } = botData

    // Проверяем groupId
    if (!groupId) {
      logger.error('❌ ID группы не найден', {
        description: 'Group ID not found',
        botName: ctx.botInfo.username,
      })
    } else {
      // Отправляем сообщение в группу
      try {
        logger.info('🚀 Отправка уведомления в группу', {
          description: 'Sending notification to group',
          groupId,
          botName: ctx.botInfo.username,
        })
        await bot.telegram.sendMessage(`@${groupId}`, message)
        logger.info('✅ Уведомление отправлено в группу', {
          description: 'Notification sent to group successfully',
          groupId,
          botName: ctx.botInfo.username,
        })
      } catch (error: any) {
        // Проверяем специфические ошибки Telegram
        if (error?.response?.error_code === 403) {
          logger.error('❌ Бот исключен из группы:', {
            description: 'Bot was kicked from the group',
            error: error?.response?.description || error.message,
            groupId,
            botName: ctx.botInfo.username,
            solution: 'Need to add bot back to the group',
          })
        } else {
          logger.error('❌ Ошибка при отправке уведомления в группу:', {
            description: 'Error sending notification to group',
            error: error?.response?.description || error.message,
            errorCode: error?.response?.error_code,
            groupId,
            botName: ctx.botInfo.username,
          })
        }
      }
    }

    // Получаем список владельцев бота
    const owners = await getBotOwners(ctx.botInfo.username)

    if (owners.length === 0) {
      logger.warn('⚠️ Не найдены владельцы бота', {
        description: 'No bot owners found',
        botName: ctx.botInfo.username,
      })
    }

    let successfulNotifications = 0
    let failedNotifications = 0

    // Отправляем уведомление каждому владельцу
    for (const ownerId of owners) {
      try {
        await bot.telegram.sendMessage(
          ownerId,
          `🔔 Уведомление о платеже\n\n${message}`
        )
        successfulNotifications++
        logger.info('✅ Уведомление отправлено владельцу', {
          description: 'Payment notification sent to owner',
          ownerId,
          botName: ctx.botInfo.username,
        })
      } catch (error: any) {
        failedNotifications++
        // Проверяем специфические ошибки Telegram
        if (error?.response?.error_code === 403) {
          logger.error('❌ Владелец заблокировал бота:', {
            description: 'Owner blocked the bot',
            error: error?.response?.description || error.message,
            ownerId,
            botName: ctx.botInfo.username,
            solution: 'Owner needs to unblock and restart the bot',
          })
        } else {
          logger.error('❌ Ошибка при отправке уведомления владельцу:', {
            description: 'Error sending notification to owner',
            error: error?.response?.description || error.message,
            errorCode: error?.response?.error_code,
            ownerId,
            botName: ctx.botInfo.username,
          })
        }
      }
    }

    // Логируем общую статистику отправки
    logger.info('📊 Статистика отправки уведомлений:', {
      description: 'Notification sending statistics',
      totalOwners: owners.length,
      successfulNotifications,
      failedNotifications,
      botName: ctx.botInfo.username,
    })
  } catch (error: any) {
    logger.error('❌ Критическая ошибка при отправке уведомлений:', {
      description: 'Critical error while sending notifications',
      error: error?.message || 'Unknown error',
      botName: ctx.botInfo.username,
    })
  }
}

async function processPayment(
  ctx: PaymentContext,
  amount: number,
  subscriptionName: string,
  stars: number
) {
  const userId = ctx.from?.id.toString()
  console.log('CASE: userId', userId)
  const username = ctx.from?.username
  console.log('CASE: username', username)
  console.log(
    'CASE: ctx.message?.successful_payment',
    ctx.message?.successful_payment
  )
  const payload = ctx.message?.successful_payment?.invoice_payload
  console.log('CASE: payload', payload)
  if (!userId) {
    throw new Error('User ID is undefined')
  }

  await updateUserSubscription(userId, subscriptionName)

  await setPayments({
    telegram_id: userId.toString(),
    amount: Number(amount),
    OutSum: amount.toString(),
    InvId: payload || '',
    inv_id: payload || '',
    currency: 'RUB',
    stars: Number(stars),
    status: 'SUCCESS',
    payment_method: 'Robokassa',
    bot_name: ctx.botInfo.username,
    description: `Payment completed - ${amount.toString()} RUB`,
    metadata: {
      payment_method: 'Robokassa',
      email: ctx.session.email,
    },
    language: 'ru',
    invoice_url: '',
  })

  await sendNotification(
    ctx,
    `💫 Пользователь: @${username} (ID: ${userId})\n` +
      `📦 Купил: ${subscriptionName}\n и получил ${stars} звезд 🌟`
  )
  const isRu = isRussian(ctx)
  await ctx.reply(
    isRu
      ? `✅ **Спасибо за покупку! На ваш баланс добавлено ${stars} ⭐️!**\n` +
          `✨ Теперь вы можете использовать свою подписку. Для этого перейдите в главное меню, нажав на кнопку ниже:\n` +
          `🏠 /menu\n` +
          `❓ Если у вас есть вопросы, не стесняйтесь обращаться за помощью /tech\n` +
          `Мы всегда рады помочь!`
      : `✅ **Thank you for your purchase! ${stars} stars added to your balance!**\n` +
          `✨ Now you can use your subscription. To do this, go to the main menu by clicking the button below:\n` +
          `🏠 /menu\n` +
          `❓ If you have any questions, feel free to ask for help /tech\n` +
          `We're always here to assist you!`,
    {
      parse_mode: 'Markdown',
    }
  )
  ctx.session.subscription = ''
  ctx.session.buttons = []
}

export async function handleSuccessfulPayment(ctx: PaymentContext) {
  try {
    if (!ctx.chat) {
      console.error('Update does not belong to a chat')
      return
    }
    const isRu = isRussian(ctx)
    const stars = ctx.message?.successful_payment?.total_amount || 0
    const subscriptionType = ctx.session.subscription
    console.log('CASE: subscriptionType', subscriptionType)
    const { buttons } = await getTranslation({
      key: 'subscriptionScene',
      ctx,
    })
    console.log('CASE: buttons', buttons)

    const selectedButton = buttons.find(
      button => button.callback_data === subscriptionType
    )
    console.log('CASE: selectedButton', selectedButton)

    if (selectedButton) {
      console.log('CASE: subscriptionType in buttons', selectedButton)
      const { stars_price, callback_data } = selectedButton
      await processPayment(ctx, stars_price, callback_data, stars)
    } else {
      console.log('CASE: subscriptionType not in buttons', selectedButton)
      await setPayments({
        telegram_id: ctx.from.id.toString(),
        amount: Number(stars),
        OutSum: stars.toString(),
        InvId: ctx.message?.successful_payment?.invoice_payload || '',
        inv_id: ctx.message?.successful_payment?.invoice_payload || '',
        currency: 'RUB',
        stars: Number(stars),
        status: 'SUCCESS',
        payment_method: 'Robokassa',
        bot_name: ctx.botInfo.username,
        description: `Subscription payment completed - ${stars.toString()} RUB`,
        subscription: subscriptionType,
        metadata: {
          payment_method: 'Robokassa',
          email: ctx.session.email,
          subscription: subscriptionType,
        },
        language: 'ru',
        invoice_url: '',
      })
      await ctx.reply(
        isRu
          ? `💫 Ваш баланс пополнен на ${stars}⭐️ звезд!`
          : `💫 Your balance has been replenished by ${stars}⭐️ stars!`
      )
      await sendNotification(
        ctx,
        `💫 Пользователь @${ctx.from.username} (ID: ${ctx.from.id}) пополнил баланс на ${stars} звезд!`
      )
      ctx.session.subscription = ''
      ctx.session.buttons = []
    }
  } catch (error) {
    console.error('Error processing payment:', error)
  }
}
