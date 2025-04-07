import { ElevenLabsClient } from 'elevenlabs'
import { logger } from '@/utils/logger'

// Проверяем наличие API ключа
if (!process.env.ELEVENLABS_API_KEY) {
  logger.error('❌ Отсутствует ELEVENLABS_API_KEY', {
    description: 'Missing ELEVENLABS_API_KEY environment variable',
  })
  process.exit(1)
}

// Инициализируем клиент ElevenLabs
export const elevenlabs = new ElevenLabsClient({
  apiKey: process.env.ELEVENLABS_API_KEY,
})

logger.info('🔄 Initializing ElevenLabs client...', {
  description: 'Initializing ElevenLabs client',
})

logger.info('🔑 ELEVENLABS_API_KEY available:', {
  description: 'ELEVENLABS_API_KEY status',
  available: !!process.env.ELEVENLABS_API_KEY,
  first_10_chars: process.env.ELEVENLABS_API_KEY?.slice(0, 10) + '...',
})

logger.info('✅ ElevenLabs client created:', {
  description: 'ElevenLabs client creation status',
  success: !!elevenlabs,
})
