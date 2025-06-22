import express from 'express'
import { Router } from 'express'
import { validateRobokassaSignature } from '@/core/robokassa'
import { getPaymentByInvId } from '@/core/supabase/payments'
import { supabaseAdmin } from '@/core/supabase'
import { PaymentStatus } from '@/interfaces/payments.interface'
import { logger } from '@/utils/logger'
import { ROBOKASSA_PASSWORD_2 } from '@/config'

const router: Router = express.Router()

/**
 * Обработчик webhook от Robokassa
 * POST /api/robokassa-result
 */
router.post('/robokassa-result', async (req: any, res: any) => {
  try {
    logger.info('🔔 Received Robokassa webhook', {
      body: req.body,
      headers: req.headers,
    })

    const { OutSum, InvId, SignatureValue } = req.body

    if (!OutSum || !InvId || !SignatureValue) {
      logger.warn('❌ Missing required parameters in Robokassa webhook', {
        OutSum,
        InvId,
        SignatureValue: !!SignatureValue,
      })
      return res.status(400).send('Missing required parameters')
    }

    // Проверяем подпись
    const isValidSignature = validateRobokassaSignature(
      OutSum,
      InvId,
      ROBOKASSA_PASSWORD_2 || '',
      SignatureValue
    )

    if (!isValidSignature) {
      logger.error('❌ Invalid Robokassa signature', {
        OutSum,
        InvId,
      })
      return res.status(400).send('Invalid signature')
    }

    logger.info('✅ Robokassa signature validated', {
      OutSum,
      InvId,
    })

    // Находим платеж в базе данных
    const { data: payment, error } = await getPaymentByInvId(InvId)

    if (error || !payment) {
      logger.error('❌ Payment not found in database', {
        InvId,
        error,
      })
      return res.status(404).send('Payment not found')
    }

    if (payment.status === PaymentStatus.COMPLETED) {
      logger.info('ℹ️ Payment already processed', {
        InvId,
        status: payment.status,
      })
      return res.status(200).send('OK')
    }

    // Обновляем статус платежа
    const { error: updateError } = await supabaseAdmin
      .from('payments_v2')
      .update({
        status: PaymentStatus.COMPLETED,
        payment_date: new Date().toISOString(),
      })
      .eq('inv_id', InvId)

    if (updateError) {
      logger.error('❌ Error updating payment status', {
        InvId,
        error: updateError,
      })
      return res.status(500).send('Database error')
    }

    logger.info('✅ Payment status updated to COMPLETED', {
      InvId,
      telegram_id: payment.telegram_id,
      subscription_type: payment.subscription,
    })

    // Уведомление владельца для рублевых платежей приходит с отдельного сервера
    // Здесь только уведомляем пользователя

    // Отправляем уведомление пользователю через бота
    await sendPaymentSuccessNotification(payment)

    res.status(200).send('OK')
  } catch (error) {
    logger.error('❌ Error processing Robokassa webhook', {
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    res.status(500).send('Internal server error')
  }
})

/**
 * Отправляет уведомление пользователю об успешной оплате
 */
async function sendPaymentSuccessNotification(payment: any) {
  try {
    const { getBotByName } = await import('@/core/bot')
    const result = getBotByName(payment.bot_name)

    if (!result.bot || result.error) {
      logger.error('❌ Bot not found for payment notification', {
        bot_name: payment.bot_name,
        telegram_id: payment.telegram_id,
        error: result.error,
      })
      return
    }

    const bot = result.bot
    const isRu = payment.language === 'ru'
    const isSubscription = !!payment.subscription

    if (isSubscription) {
      // Сообщение об успешной оплате подписки
      await bot.telegram.sendMessage(
        payment.telegram_id,
        isRu
          ? `🎉 Ваша подписка "${payment.subscription}" успешно оформлена и активна! Пользуйтесь ботом.`
          : `🎉 Your subscription "${payment.subscription}" has been successfully activated! Enjoy the bot.`
      )

      // Отправляем сообщение о вступлении в чат
      const { getSubScribeChannel } = await import(
        '@/handlers/getSubScribeChannel'
      )
      // Создаем временный контекст для получения канала
      const tempCtx = { from: { language_code: payment.language } }
      const channelId = await getSubScribeChannel(tempCtx as any)

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

        await bot.telegram.sendMessage(payment.telegram_id, chatInviteMessage, {
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: isRu ? '👋 ☺️ Я с вами' : "👋 ☺️ I'm with you",
                  url: channelId.startsWith('@')
                    ? `https://t.me/${channelId.slice(1)}`
                    : channelId.startsWith('http')
                      ? channelId
                      : `https://t.me/${channelId}`,
                },
              ],
              [
                {
                  text: isRu ? '🙅🙅‍♀️ Я сам' : '🙅🙅‍♀️ I myself',
                  callback_data: 'continue_solo',
                },
              ],
            ],
          },
        })
      }
    } else {
      // Сообщение о пополнении баланса
      await bot.telegram.sendMessage(
        payment.telegram_id,
        isRu
          ? `💫 Ваш баланс пополнен на ${payment.stars}⭐ звезд!`
          : `💫 Your balance has been replenished by ${payment.stars}⭐ stars!`
      )
    }

    logger.info('✅ Payment success notification sent', {
      telegram_id: payment.telegram_id,
      bot_name: payment.bot_name,
      subscription_type: payment.subscription,
    })
  } catch (error) {
    logger.error('❌ Error sending payment success notification', {
      error: error instanceof Error ? error.message : String(error),
      telegram_id: payment.telegram_id,
      bot_name: payment.bot_name,
    })
  }
}

export default router
