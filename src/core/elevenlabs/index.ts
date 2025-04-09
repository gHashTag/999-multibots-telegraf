import { ElevenLabsService } from './ElevenLabsService'
import { logger } from '@/utils/logger'

// Проверяем наличие API ключа
if (!process.env.ELEVENLABS_API_KEY) {
  logger.error('❌ Отсутствует ELEVENLABS_API_KEY', {
    description: 'Missing ELEVENLABS_API_KEY environment variable',
  })
  process.exit(1)
}

logger.info('🔄 Initializing ElevenLabs service...', {
  description: 'Initializing ElevenLabs service',
})

// Экспортируем инстанс сервиса
export const elevenLabsService = ElevenLabsService.getInstance()

logger.info('✅ ElevenLabs service initialized:', {
  description: 'ElevenLabs service initialization status',
  success: !!elevenLabsService,
})

// Интерфейс для обратной совместимости
interface CreateVoiceParams {
  name: string
  description: string
  files?: string[]
  fileUrl?: string
  labels?: string
}

// Для обратной совместимости со старым кодом
export async function createVoiceElevenLabs(
  params: CreateVoiceParams
): Promise<string> {
  const files = params.files || (params.fileUrl ? [params.fileUrl] : [])

  return await elevenLabsService.addVoice(
    params.name,
    params.description,
    files,
    params.labels
  )
}
