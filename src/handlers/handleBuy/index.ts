import { Context } from 'telegraf'
import { starAmounts } from '@/price/helpers'
import { MyContext } from '@/interfaces'
import { isRussian } from '@/helpers'
import { ADMIN_IDS_ARRAY } from '@/config'
import { logger } from '@/utils/logger'

export async function handleBuy(ctx: MyContext) {
  const callbackData = (ctx.callbackQuery as any)?.data
  const callerId = ctx.from?.id
  const isRu = isRussian(ctx)
  const telegramId = ctx.from?.id?.toString() || 'unknown'

  if (!callbackData) {
    logger.error('💰 [handleBuy] Ошибка: callbackData не определен', {
      telegramId,
    })
    await ctx.answerCbQuery('Произошла ошибка')
    return
  }

  try {
    logger.info('💰 [handleBuy] Начало обработки', {
      telegramId,
      callbackData,
      currentScene: ctx.scene?.current?.id,
    })

    let matchFound = false
    let amountToSend: number | null = null

    if (callbackData === 'top_up_1') {
      logger.info('💰 [handleBuy] Обнаружен top_up_1', { telegramId })
      if (callerId && ADMIN_IDS_ARRAY.includes(callerId)) {
        logger.info('💰 [handleBuy] Пользователь админ, разрешаем 1 звезду', {
          telegramId,
          callerId,
        })
        matchFound = true
        amountToSend = 1
      } else {
        logger.warn('💰 [handleBuy] Не-админ попытался использовать top_up_1', {
          telegramId,
          callerId,
        })
        await ctx.answerCbQuery('Действие недоступно')
        return
      }
    } else {
      for (const amount of starAmounts) {
        if (callbackData.endsWith(`top_up_${amount}`)) {
          logger.info(
            `💰 [handleBuy] Найдено совпадение для amount=${amount}`,
            {
              telegramId,
              amount,
              callbackData,
            }
          )
          matchFound = true
          amountToSend = amount
          break
        }
      }
    }

    if (matchFound && amountToSend !== null) {
      try {
        logger.info('💰 [handleBuy] Отправляем invoice', {
          telegramId,
          amountToSend,
        })

        await ctx.replyWithInvoice({
          title: `${amountToSend} ⭐️${amountToSend === 1 ? ' (Admin Test)' : ''}`,
          description: isRu
            ? `💬 Получите ${amountToSend} звезд.`
            : `💬 Get ${amountToSend} stars.`,
          payload: `${amountToSend}_${Date.now()}`,
          currency: 'XTR',
          prices: [
            {
              label: isRu ? 'Цена' : 'Price',
              amount: amountToSend,
            },
          ],
          provider_token: '',
        })

        logger.info('✅ [handleBuy] Invoice успешно отправлен', {
          telegramId,
          amountToSend,
        })

        await ctx.answerCbQuery()
      } catch (invoiceError) {
        logger.error('❌ [handleBuy] Ошибка при отправке invoice', {
          telegramId,
          error:
            invoiceError instanceof Error
              ? invoiceError.message
              : String(invoiceError),
          amountToSend,
        })
        await ctx.answerCbQuery('Ошибка при создании счета')
      }
      return
    }

    if (!matchFound) {
      logger.warn('⚠️ [handleBuy] Не найдено совпадений для callbackData', {
        telegramId,
        callbackData,
        availableStarAmounts: starAmounts,
      })
      await ctx.answerCbQuery('Неизвестное действие')
    }
  } catch (error) {
    logger.error('❌ [handleBuy] Общая ошибка', {
      telegramId,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })
    try {
      await ctx.answerCbQuery('Произошла внутренняя ошибка')
    } catch (cbError) {
      logger.error(
        '❌ [handleBuy] Ошибка при ответе на callbackQuery в catch блоке',
        {
          telegramId,
          cbError: cbError instanceof Error ? cbError.message : String(cbError),
        }
      )
    }
  }
}
