import { handleBuy } from '@/handlers'
import { MyContext } from '@/interfaces'
import { logger } from '@/utils/logger'

export async function handleTopUp(ctx: MyContext) {
  try {
    if (!ctx.match) {
      throw new Error('Match is undefined')
    }
    logger.info({
      message: '🔄 Обработка пополнения баланса',
      description: 'Processing balance top-up',
      data: ctx.match[0]
    })

    const data = ctx.match[0]
    const isRu = ctx.from?.language_code === 'ru'
    await handleBuy({ ctx, data, isRu })

    logger.info({
      message: '✅ Пополнение баланса обработано',
      description: 'Balance top-up processed successfully'
    })
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при пополнении баланса',
      description: 'Error handling top-up',
      error: error instanceof Error ? error.message : String(error)
    })
    throw error
  }
}
