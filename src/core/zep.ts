import { Logger as logger } from '@/utils/logger'

interface Memory {
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
  }>
}

export class ZepClient {
  private static instance: ZepClient
  private memories: Map<string, Memory>

  private constructor() {
    this.memories = new Map()
    logger.info('🚀 ZepClient инициализирован:', {
      description: 'ZepClient initialized'
    })
  }

  public static getInstance(): ZepClient {
    if (!ZepClient.instance) {
      ZepClient.instance = new ZepClient()
    }
    return ZepClient.instance
  }

  public async getMemory(sessionId: string): Promise<Memory | null> {
    try {
      const memory = this.memories.get(sessionId)
      
      logger.info('🔍 Получение памяти:', {
        description: 'Getting memory',
        sessionId,
        found: !!memory
      })
      
      return memory || null
    } catch (error) {
      logger.error('❌ Ошибка при получении памяти:', {
        description: 'Error getting memory',
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return null
    }
  }

  public async saveMemory(sessionId: string, memory: Memory): Promise<void> {
    try {
      this.memories.set(sessionId, memory)
      
      logger.info('💾 Сохранение памяти:', {
        description: 'Saving memory',
        sessionId,
        messageCount: memory.messages.length
      })
    } catch (error) {
      logger.error('❌ Ошибка при сохранении памяти:', {
        description: 'Error saving memory',
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
    }
  }

  public async clearMemory(sessionId: string): Promise<void> {
    try {
      this.memories.delete(sessionId)
      
      logger.info('🧹 Очистка памяти:', {
        description: 'Clearing memory',
        sessionId
      })
    } catch (error) {
      logger.error('❌ Ошибка при очистке памяти:', {
        description: 'Error clearing memory',
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
    }
  }
} 