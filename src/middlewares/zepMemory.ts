import { Middleware } from 'telegraf'
import { MyContext } from '@/interfaces'
import { ZepClient } from '@/core/zep'
import { Logger as logger } from '@/utils/logger'

export const zepMemoryMiddleware: Middleware<MyContext> = async (ctx, next) => {
  if (!ctx.from) {
    return next()
  }

  const sessionId = `${ctx.from.id}_${ctx.botInfo?.username}`
  const zepClient = ZepClient.getInstance()

  try {
    // Загружаем память
    const memory = await zepClient.getMemory(sessionId)
    if (memory) {
      ctx.session.memory = memory
      logger.info('🧠 Память загружена:', {
        description: 'Memory loaded',
        sessionId,
        messageCount: memory.messages.length
      })
    }

    await next()

    // Сохраняем память после обработки сообщения
    if (ctx.session.memory) {
      await zepClient.saveMemory(sessionId, ctx.session.memory)
      logger.info('💾 Память сохранена:', {
        description: 'Memory saved',
        sessionId,
        messageCount: ctx.session.memory.messages.length
      })
    }
  } catch (error) {
    logger.error('❌ Ошибка в middleware памяти:', {
      description: 'Error in memory middleware',
      error,
      sessionId
    })
    await next()
  }
}