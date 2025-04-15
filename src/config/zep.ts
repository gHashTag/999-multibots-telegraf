import { logger } from '@/utils/logger'

export const ZEP_CONFIG = {
  baseUrl: process.env.ZEP_API_URL || 'https://api.getzep.com',
  apiKey: process.env.ZEP_API_KEY,
  memoryWindow: 10, // количество сообщений для сохранения в памяти
  sessionTimeout: 24 * 60 * 60 * 1000, // 24 часа в миллисекундах
}

// Проверяем наличие необходимых переменных окружения
if (!ZEP_CONFIG.apiKey) {
  logger.error('❌ Отсутствует ZEP_API_KEY в переменных окружения', {
    description: 'Missing ZEP_API_KEY environment variable',
  })
  throw new Error('ZEP_API_KEY is required')
}

export interface ZepMemory {
  messages: {
    role: 'user' | 'assistant'
    content: string
    timestamp: number
  }[]
  metadata?: Record<string, any>
}
