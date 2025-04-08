import { MyContext } from '@/interfaces'
import { Logger as logger } from '@/utils/logger'
import { getStarsWord } from '@/utils/getStarsWord'

/**
 * Отправляет сообщение о балансе пользователя
 */
export async function sendBalanceMessage(
  ctx: MyContext,
  balance: number,
  isRu: boolean
): Promise<void> {
  try {
    const message = isRu
      ? `💰 Ваш баланс: ${balance} ${getStarsWord(balance)}`
      : `💰 Your balance: ${balance} stars`

    await ctx.reply(message)
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке сообщения о балансе',
      description: 'Error sending balance message',
      error: error instanceof Error ? error.message : 'Unknown error',
      balance,
      isRu,
    })
  }
}

/**
 * Отправляет сообщение о недостаточном балансе
 */
export async function sendInsufficientStarsMessage(
  ctx: MyContext,
  balance: number,
  isRu: boolean
): Promise<void> {
  try {
    const message = isRu
      ? `⚠️ Недостаточно звезд на балансе. Текущий баланс: ${balance} ${getStarsWord(
          balance
        )}`
      : `⚠️ Insufficient stars balance. Current balance: ${balance} stars`

    await ctx.reply(message)
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке сообщения о недостаточном балансе',
      description: 'Error sending insufficient stars message',
      error: error instanceof Error ? error.message : 'Unknown error',
      balance,
      isRu,
    })
  }
}

/**
 * Отправляет сообщение о стоимости операции
 */
export async function sendCostMessage(
  ctx: MyContext,
  cost: number,
  isRu: boolean
): Promise<void> {
  try {
    const message = isRu
      ? `💫 Стоимость операции: ${cost} ${getStarsWord(cost)}`
      : `💫 Operation cost: ${cost} stars`

    await ctx.reply(message)
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при отправке сообщения о стоимости',
      description: 'Error sending cost message',
      error: error instanceof Error ? error.message : 'Unknown error',
      cost,
      isRu,
    })
  }
} 