import { TelegramId } from '@/interfaces/telegram.interface'
import { isRussian } from '@/helpers'
import { getTranslation } from '@/core/supabase'
import { Message } from 'telegraf/typings/core/types/typegram'
import { updateUserSubscription, createPayment } from '@/core/supabase'
import { MyContext } from '@/interfaces'
import { TransactionType } from '@/interfaces/payments.interface'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { supabase } from '@/core/supabase'
import { logger } from '@/utils/logger'
import { createBotByName } from '@/core/bot'
import { inngest } from '@/inngest-functions/clients'

// Объединяем все в один тип для контекста
type PaymentContext = MyContext & {
  message: Message.SuccessfulPaymentMessage
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
  try {
    if (!ctx.from?.id) {
      throw new Error('User ID is undefined')
    }

    const telegram_id = ctx.from.id.toString() as TelegramId
    const username = ctx.from.username || 'unknown'
    const botUsername = ctx.botInfo?.username || ''
    const invoicePayload = ctx.message.successful_payment?.invoice_payload || ''

    // Создаем запись о платеже
    await createPayment({
      telegram_id,
      amount,
      stars,
      type: TransactionType.SUBSCRIPTION_PAYMENT,
      description: `Покупка подписки ${subscriptionName}`,
      bot_name: botUsername,
      service_type: 'neuroblogger',
      payment_method: 'telegram',
      operation_id: invoicePayload,
      inv_id: invoicePayload,
      status: 'SUCCESS',
      subscription: subscriptionName as SubscriptionType,
      metadata: {
        payment_method: 'telegram',
        subscription: subscriptionName as SubscriptionType,
      },
    })

    // Обновляем подписку пользователя
    await updateUserSubscription(
      telegram_id,
      subscriptionName as SubscriptionType
    )

    await sendNotification(
      ctx,
      `💫 Пользователь: @${username} (ID: ${telegram_id})\n` +
        `📦 Купил: ${subscriptionName}\n и получил ${stars} звезд 🌟`
    )

    const isRu = isRussian(ctx)
    await ctx.reply(
      isRu
        ? 'Спасибо за покупку! Ваша подписка активирована.'
        : 'Thank you for your purchase! Your subscription has been activated.'
    )

    ctx.session.subscription = subscriptionName as SubscriptionType
    ctx.session.buttons = []
  } catch (error) {
    logger.error('❌ Ошибка обработки платежа', {
      description: 'Error processing payment',
      error: error instanceof Error ? error.message : String(error),
    })
    throw error
  }
}

export async function handleSuccessfulPayment(ctx: PaymentContext) {
  try {
    if (!ctx.chat) {
      logger.error('❌ Update does not belong to a chat', {
        description: 'Chat not found in context',
      })
      return
    }

    const stars = ctx.message?.successful_payment?.total_amount || 0
    const subscriptionType = ctx.session.subscription

    logger.info('🔍 Обработка успешного платежа', {
      description: 'Processing successful payment',
      stars,
      subscriptionType,
    })

    const translation = await getTranslation('subscriptionScene', ctx)
    const buttons = translation.buttons || []

    const selectedButton = buttons.find(
      button => button.callback_data === subscriptionType
    )

    if (selectedButton) {
      logger.info('💫 Обработка подписки', {
        description: 'Processing subscription payment',
        subscription: selectedButton,
      })
      const { stars_price, callback_data } = selectedButton
      await processPayment(ctx, stars_price, callback_data, stars)
    } else {
      logger.info('💰 Создание платежа через Robokassa', {
        description: 'Creating Robokassa payment',
        stars,
        subscriptionType,
      })

      // Переходим в сцену создания счета
      await ctx.scene.enter('getRuBillWizard')

      // Устанавливаем данные для сцены
      ctx.session.selectedPayment = {
        amount: stars,
        stars: stars,
        subscription: subscriptionType as SubscriptionType,
        type: TransactionType.MONEY_INCOME,
      }
    }

    logger.info('✅ Обработка успешного платежа:', {
      description: 'Processing successful payment',
      telegram_id: ctx.from?.id,
      amount: stars,
      inv_id: ctx.message?.successful_payment?.invoice_payload,
    })

    await inngest.send({
      name: 'payment/process',
      data: {
        telegram_id: String(ctx.from?.id),
        amount: Number(stars),
        type: TransactionType.MONEY_INCOME,
        description: `Purchase and sale:: ${stars}`,
        bot_name: ctx.botInfo.username,
        inv_id: ctx.message?.successful_payment?.invoice_payload,
        stars: Number(stars),
      },
    })
  } catch (error) {
    logger.error('❌ Ошибка обработки платежа', {
      description: 'Error processing payment',
      error: error instanceof Error ? error.message : String(error),
    })
  }
}
