import { logger } from '../utils/logger'
import elevenLabsClient from '../core/elevenlabs'

interface Voice {
  voice_id: string
  name: string
  category: string
  description: string | null
  preview_url: string | null
  samples: any[] | null
  settings: any | null
  labels: Record<string, any>
  created_at_unix: number | null
}

interface TestResult {
  success: boolean
  message: string
  voices?: Array<{
    voice_id: string
    name: string
    category: string
  }>
  error?: string
}

export async function testGetVoices(): Promise<TestResult> {
  logger.info({
    message: '🎯 Тест получения списка голосов',
    description: 'Testing voice list retrieval',
  })

  try {
    const voices = (await elevenLabsClient.getVoices()) as Voice[]

    if (!voices || voices.length === 0) {
      logger.warn({
        message: '⚠️ Список голосов пуст',
        description: 'Voice list is empty',
      })
      return {
        success: false,
        message: 'Список голосов пуст',
      }
    }

    // Группируем голоса по категориям
    const voicesByCategory = voices.reduce(
      (acc: { [key: string]: number }, voice) => {
        acc[voice.category] = (acc[voice.category] || 0) + 1
        return acc
      },
      {}
    )

    logger.info({
      message: '📊 Статистика по категориям голосов',
      description: 'Voice categories statistics',
      categories: voicesByCategory,
    })

    // Выводим подробную информацию о каждом голосе
    voices.forEach(voice => {
      logger.info({
        message: '🎤 Информация о голосе',
        description: 'Voice details',
        details: {
          voice_id: voice.voice_id,
          name: voice.name,
          category: voice.category,
          description: voice.description,
          preview_url: voice.preview_url,
          created_at: voice.created_at_unix
            ? new Date(voice.created_at_unix * 1000).toISOString()
            : null,
        },
      })
    })

    logger.info({
      message: '✅ Список голосов получен успешно',
      description: 'Voice list retrieved successfully',
      voiceCount: voices.length,
    })

    return {
      success: true,
      message: `Получено ${voices.length} голосов`,
      voices: voices.map(voice => ({
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category,
      })),
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при получении списка голосов',
      description: 'Error getting voice list',
      error: error instanceof Error ? error.message : String(error),
    })

    return {
      success: false,
      message: 'Ошибка при получении списка голосов',
      error: error instanceof Error ? error.message : String(error),
    }
  }
}
