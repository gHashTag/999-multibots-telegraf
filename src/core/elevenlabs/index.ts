import { ElevenLabsService } from './ElevenLabsService'
import { logger } from '@/utils/logger'
import fetch from 'node-fetch'

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

// Вспомогательная функция для конвертации URL в Blob
async function urlToBlob(url: string): Promise<Blob> {
  const response = await fetch(url)
  const buffer = await response.buffer()
  return new Blob([buffer])
}

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
  const blobs = await Promise.all(files.map(urlToBlob))
  return await elevenLabsService.addVoice(params.name, blobs)
}

export interface AddVoiceParams {
  name: string
  files: string[]
  labels?: Record<string, string>
}

export async function addVoice(params: AddVoiceParams): Promise<string> {
  const service = ElevenLabsService.getInstance()
  const blobs = await Promise.all(params.files.map(urlToBlob))
  return await service.addVoice(params.name, blobs)
}
