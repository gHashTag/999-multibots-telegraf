import axios from 'axios'
import { ZEP_CONFIG, ZepMemory } from '@/config/zep'
import { logger } from '@/utils/logger'

export class ZepClient {
  private static instance: ZepClient
  private client: any

  private constructor() {
    this.client = axios.create({
      baseURL: ZEP_CONFIG.baseUrl,
      headers: {
        'Authorization': `Bearer ${ZEP_CONFIG.apiKey}`,
        'Content-Type': 'application/json',
      },
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
      const response = await this.client.get(`/memory/${sessionId}`)
      logger.info('📝 Получена память из ZEP:', {
        description: 'Memory retrieved from ZEP',
        sessionId
      })
      return response.data
    } catch (error) {
      logger.error('❌ Ошибка при получении памяти из ZEP:', {
        description: 'Error retrieving memory from ZEP',
        error,
        sessionId
      })
      return null
    }
  }

  async saveMemory(sessionId: string, memory: ZepMemory): Promise<void> {
    try {
      await this.client.post(`/memory/${sessionId}`, memory)
      logger.info('💾 Память сохранена в ZEP:', {
        description: 'Memory saved to ZEP',
        sessionId
      })
    } catch (error) {
      logger.error('❌ Ошибка при сохранении памяти в ZEP:', {
        description: 'Error saving memory to ZEP',
        error,
        sessionId
      })
    }
  }

  async addMessage(sessionId: string, role: 'user' | 'assistant', content: string): Promise<void> {
    try {
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

      await this.saveMemory(sessionId, memory)
      logger.info('📨 Сообщение добавлено в память:', {
        description: 'Message added to memory',
        sessionId,
        role
      })
    } catch (error) {
      logger.error('❌ Ошибка при добавлении сообщения в память:', {
        description: 'Error adding message to memory',
        error,
        sessionId
      })
    }
  }
}