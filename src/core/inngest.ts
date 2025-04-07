import { Inngest } from 'inngest'
import { logger } from '@/utils/logger'

// Проверяем наличие необходимых переменных окружения
if (!process.env.INNGEST_EVENT_KEY) {
  logger.error('❌ Отсутствует INNGEST_EVENT_KEY', {
    description: 'Missing INNGEST_EVENT_KEY environment variable',
  })
  process.exit(1)
}

// Инициализируем клиент Inngest
export const inngest = new Inngest({
  id: 'neuro-blogger',
  eventKey: process.env.INNGEST_EVENT_KEY,
})

logger.info('🔄 Initializing Inngest client...', {
  description: 'Initializing Inngest client',
})

logger.info('🔑 INNGEST_EVENT_KEY available:', {
  description: 'INNGEST_EVENT_KEY status',
  available: !!process.env.INNGEST_EVENT_KEY,
  first_10_chars: process.env.INNGEST_EVENT_KEY?.slice(0, 10) + '...',
})

logger.info('✅ Inngest client created:', {
  description: 'Inngest client creation status',
  success: !!inngest,
})
