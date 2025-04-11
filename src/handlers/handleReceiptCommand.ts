import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'
import { generateReceiptUrl } from '@/helpers/generateReceiptUrl'
import { supabase } from '@/core/supabase'
import { Markup } from 'telegraf'
import { isRussian } from '@/helpers/language'

/**
 * Обрабатывает команду получения чека по ID операции
 *
 * Формат команды: /receipt [operation_id]
 *
 * @param ctx - Контекст сообщения
 * @returns Promise<void>
 */
export async function handleReceiptCommand(ctx: MyContext): Promise<void> {
  try {
    const isRu = isRussian(ctx)

    // Получаем аргументы команды
    const message = ctx.message && 'text' in ctx.message ? ctx.message.text : ''
    const args = message.split(' ')

    // Если аргументы не указаны, запрашиваем ID операции
    if (args.length < 2) {
      await ctx.reply(
        isRu
          ? '⚠️ Пожалуйста, укажите ID операции после команды.\nПример: /receipt 12345'
          : '⚠️ Please specify operation ID after the command.\nExample: /receipt 12345'
      )
      return
    }

    const operationId = args[1].trim()

    // Проверяем существование операции с таким ID
    const { data: paymentData, error: paymentError } = await supabase
      .from('payments_v2')
      .select('*')
      .eq('operation_id', operationId)
      .single()

    if (paymentError || !paymentData) {
      logger.warn('⚠️ Платеж не найден', {
        description: 'Payment not found',
        operationId,
        userId: ctx.from?.id,
      })

      await ctx.reply(
        isRu
          ? '❌ Платеж с указанным ID не найден. Пожалуйста, проверьте правильность ID операции.'
          : '❌ Payment with the specified ID not found. Please check the operation ID.'
      )
      return
    }

    // Проверяем, принадлежит ли платеж этому пользователю
    if (paymentData.telegram_id !== ctx.from?.id) {
      logger.warn('⚠️ Попытка доступа к чужому платежу', {
        description: "Attempt to access another user's payment",
        operationId,
        paymentUserId: paymentData.telegram_id,
        requestUserId: ctx.from?.id,
      })

      await ctx.reply(
        isRu
          ? '🚫 У вас нет доступа к этому платежу.'
          : '🚫 You do not have access to this payment.'
      )
      return
    }

    // Генерируем URL чека
    const receiptUrl = generateReceiptUrl({
      operationId,
      amount: paymentData.amount,
      stars: paymentData.stars,
      botName: paymentData.bot_name,
      telegramId: String(paymentData.telegram_id),
      timestamp: paymentData.created_at,
    })

    // Отправляем URL чека пользователю
    await ctx.reply(
      isRu
        ? `🧾 <b>Чек по операции #${operationId}</b>\n\nНажмите на кнопку ниже, чтобы открыть чек:`
        : `🧾 <b>Receipt for operation #${operationId}</b>\n\nClick the button below to open the receipt:`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          Markup.button.url(
            isRu ? '📄 Открыть чек' : '📄 Open Receipt',
            receiptUrl
          ),
        ]),
      }
    )

    logger.info('✅ Отправлен URL чека', {
      description: 'Receipt URL sent',
      operationId,
      userId: ctx.from?.id,
    })
  } catch (error: any) {
    logger.error('❌ Ошибка при обработке команды чека', {
      description: 'Error handling receipt command',
      error: error.message,
      userId: ctx.from?.id,
    })

    await ctx.reply(
      isRussian(ctx)
        ? '❌ Произошла ошибка при формировании чека. Пожалуйста, попробуйте позже.'
        : '❌ An error occurred while generating the receipt. Please try again later.'
    )
  }
}
