import axios, { AxiosInstance } from 'axios'
import { ZEP_CONFIG, ZepMemory } from '@/config/zep'
import { logger } from '@/utils/logger'
import { Cache } from '@/core/cache'

interface ZepMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

interface ZepMetrics {
  cacheSize: number
  hitRate: number
  missRate: number
}

export interface IZepClient {
  getMemory(sessionId: string): Promise<ZepMemory | null>
  saveMemory(sessionId: string, memory: ZepMemory): Promise<void>
  addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void>
  clearMemory(sessionId: string): Promise<void>
  getMetrics(): ZepMetrics
  destroy(): void
}

export class ZepClient implements IZepClient {
  private static instance: ZepClient
  private client: AxiosInstance
  private cache: Cache<ZepMemory>

  private constructor() {
    this.client = axios.create({
      baseURL: ZEP_CONFIG.baseUrl,
      headers: {
        'Authorization': `Bearer ${ZEP_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      },
    })
    this.cache = new Cache<ZepMemory>()

    logger.info('🚀 ZepClient инициализирован:', {
      description: 'ZepClient initialized with cache'
    })
  }

  public static getInstance(): ZepClient {
    if (!ZepClient.instance) {
      ZepClient.instance = new ZepClient()
    }
    return ZepClient.instance
  }

  async getMemory(sessionId: string): Promise<ZepMemory | null> {
    try {
      // Пробуем получить из кэша
      const cachedMemory = this.cache.get(sessionId)
      if (cachedMemory) {
        logger.info('📝 Память получена из кэша:', {
          description: 'Memory retrieved from cache',
          sessionId
        })
        return cachedMemory
      }

      // Если нет в кэше, получаем из API
      const response = await this.client.get(`/memory/${sessionId}`)
      const memory = response.data

      // Сохраняем в кэш
      this.cache.set(sessionId, memory)

      logger.info('📝 Память получена из ZEP:', {
        description: 'Memory retrieved from ZEP',
        sessionId
      })
      return memory
    } catch (error) {
      logger.error('❌ Ошибка при получении памяти:', {
        description: 'Error retrieving memory',
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
      return null
    }
  }

  async saveMemory(sessionId: string, memory: ZepMemory): Promise<void> {
    try {
      // Сохраняем в API
      await this.client.post(`/memory/${sessionId}`, memory)
      
      // Обновляем кэш
      this.cache.set(sessionId, memory)

      logger.info('💾 Память сохранена:', {
        description: 'Memory saved',
        sessionId
      })
    } catch (error) {
      logger.error('❌ Ошибка при сохранении памяти:', {
        description: 'Error saving memory',
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
    }
  }

  async addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    try {
      // Получаем текущую память (сначала из кэша)
      const memory = await this.getMemory(sessionId) || { messages: [] }
      
      // Добавляем новое сообщение
      memory.messages.push({
        role,
        content,
        timestamp: Date.now(),
      })

      // Ограничиваем количество сообщений
      if (memory.messages.length > ZEP_CONFIG.memoryWindow) {
        memory.messages = memory.messages.slice(-ZEP_CONFIG.memoryWindow)
      }

      // Сохраняем обновленную память
      await this.saveMemory(sessionId, memory)

      logger.info('📨 Сообщение добавлено в память:', {
        description: 'Message added to memory',
        sessionId,
        role,
        messageCount: memory.messages.length
      })
    } catch (error) {
      logger.error('❌ Ошибка при добавлении сообщения:', {
        description: 'Error adding message',
        error: error instanceof Error ? error.message : String(error),
        sessionId
      })
    }
  }

  async clearMemory(sessionId: string): Promise<void> {
    try {
      // Очищаем в API
      await this.client.delete(`/memory/${sessionId}`)
      
      // Очищаем кэш
      this.cache.delete(sessionId)

      logger.info('🧹 Память очищена:', {
        description: 'Memory cleared',
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

  public getMetrics(): ZepMetrics {
    const metrics = this.cache.getMetrics()
    return {
      cacheSize: metrics.size,
      hitRate: metrics.hitRate,
      missRate: metrics.missRate
    }
  }

  public destroy() {
    this.cache.destroy()
  }
}