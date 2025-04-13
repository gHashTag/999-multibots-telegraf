import { inngest } from './clients'
import { memoryBankMCP } from './clients'
import { logger } from '@/utils/logger'

// Функция для сохранения памяти
export const storeMemoryFunction = inngest.createFunction(
  { id: 'store-memory' },
  { event: 'memory/store' },
  async ({ event, step }) => {
    try {
      const { data } = event

      logger.info('🧠 Обработка запроса на сохранение памяти', {
        description: 'Processing memory store request',
        eventId: event.id,
        dataType: typeof data,
        timestamp: new Date().toISOString(),
      })

      // Сохраняем память в Memory Bank
      const result = await step.run('store-memory-step', async () => {
        return await memoryBankMCP.storeMemory(data)
      })

      logger.info('✅ Память успешно сохранена', {
        description: 'Memory stored successfully',
        eventId: event.id,
        memoryId: result.id || 'unknown',
        timestamp: new Date().toISOString(),
      })

      return {
        success: true,
        memoryId: result.id,
        message: 'Memory stored successfully',
      }
    } catch (error) {
      logger.error('❌ Ошибка при сохранении памяти', {
        description: 'Error storing memory',
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to store memory',
      }
    }
  }
)

// Функция для поиска в памяти
export const retrieveMemoryFunction = inngest.createFunction(
  { id: 'retrieve-memory' },
  { event: 'memory/retrieve' },
  async ({ event, step }) => {
    try {
      const { data } = event

      logger.info('🔍 Обработка запроса на поиск в памяти', {
        description: 'Processing memory retrieval request',
        eventId: event.id,
        query: data.query || 'no-query',
        timestamp: new Date().toISOString(),
      })

      // Выполняем поиск в Memory Bank
      const result = await step.run('retrieve-memory-step', async () => {
        if (data.semanticSearch) {
          return await memoryBankMCP.semanticSearch(data.query, data.options)
        } else {
          return await memoryBankMCP.retrieveMemory(data)
        }
      })

      logger.info('✅ Поиск в памяти выполнен успешно', {
        description: 'Memory retrieval successful',
        eventId: event.id,
        resultsCount: Array.isArray(result) ? result.length : 'n/a',
        timestamp: new Date().toISOString(),
      })

      return {
        success: true,
        results: result,
        message: 'Memory retrieval successful',
      }
    } catch (error) {
      logger.error('❌ Ошибка при поиске в памяти', {
        description: 'Error retrieving memory',
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        stack: error instanceof Error ? error.stack : undefined,
        timestamp: new Date().toISOString(),
      })

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        message: 'Failed to retrieve memory',
      }
    }
  }
)

// Экспортируем функции для использования в serve.ts
export const memoryFunctions = [storeMemoryFunction, retrieveMemoryFunction]
