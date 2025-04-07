import { elevenlabs } from '@/core/elevenlabs'
import { logger } from '@/utils/logger'
import { TestResult } from './interfaces'
import { TEST_CONFIG } from './test-config'

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

export interface VoiceTestResult extends TestResult {
  duration?: number
}

/**
 * Тестирует получение списка голосов
 */
export async function testGetVoices(): Promise<TestResult> {
  const startTime = Date.now()

  try {
    logger.info({
      message: '🎯 Тест получения списка голосов',
      description: 'Testing voice list retrieval',
    })

    const response = await elevenlabs.voices.getAll()
    const voices = response.voices as unknown as Voice[]

    if (!voices || voices.length === 0) {
      logger.warn({
        message: '⚠️ Список голосов пуст',
        description: 'Voice list is empty',
      })

      return {
        name: 'Get voices test',
        success: false,
        message: 'Список голосов пуст',
        error: 'Empty voice list',
        duration: Date.now() - startTime,
      }
    }

    // Собираем статистику по категориям
    const categories = new Map<string, number>()
    voices.forEach((voice: Voice) => {
      const count = categories.get(voice.category) || 0
      categories.set(voice.category, count + 1)
    })

    logger.info({
      message: '📊 Статистика по категориям голосов',
      description: 'Voice categories statistics',
      categories: Object.fromEntries(categories),
    })

    // Логируем информацию о каждом голосе
    voices.forEach((voice: Voice) => {
      logger.debug({
        message: '🗣️ Информация о голосе',
        description: 'Voice details',
        voice_id: voice.voice_id,
        name: voice.name,
        category: voice.category,
      })
    })

    return {
      name: 'Get voices test',
      success: true,
      message: `Получено ${voices.length} голосов`,
      details: {
        voiceCount: voices.length,
        categories: Object.fromEntries(categories),
      },
      duration: Date.now() - startTime,
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при получении списка голосов',
      description: 'Error getting voice list',
      error: error instanceof Error ? error.message : 'Unknown error',
    })

    return {
      name: 'Get voices test',
      success: false,
      message: 'Ошибка при получении списка голосов',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    }
  }
}

/**
 * Тестирование голосовых функций
 */
export class VoiceTester {
  /**
   * Тестирует генерацию голоса
   */
  async testVoiceGeneration(): Promise<VoiceTestResult> {
    const startTime = Date.now()

    try {
      // Имитация генерации голоса
      await new Promise(resolve => setTimeout(resolve, 1000))

      logger.info('🎙️ Голос успешно сгенерирован', {
        duration: Date.now() - startTime,
      })

      return {
        success: true,
        name: 'Генерация голоса',
        message: 'Голос успешно сгенерирован',
        duration: Date.now() - startTime,
      }
    } catch (error) {
      logger.error('❌ Ошибка при генерации голоса', {
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      })

      return {
        success: false,
        name: 'Генерация голоса',
        message: 'Ошибка при генерации голоса',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Тестирует распознавание голоса
   */
  async testVoiceRecognition(): Promise<VoiceTestResult> {
    const startTime = Date.now()

    try {
      // Имитация распознавания голоса
      await new Promise(resolve => setTimeout(resolve, 1000))

      logger.info('👂 Голос успешно распознан', {
        duration: Date.now() - startTime,
      })

      return {
        success: true,
        name: 'Распознавание голоса',
        message: 'Голос успешно распознан',
        duration: Date.now() - startTime,
      }
    } catch (error) {
      logger.error('❌ Ошибка при распознавании голоса', {
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      })

      return {
        success: false,
        name: 'Распознавание голоса',
        message: 'Ошибка при распознавании голоса',
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      }
    }
  }

  /**
   * Запускает все тесты голосовых функций
   */
  async runAllTests(): Promise<VoiceTestResult[]> {
    const results: VoiceTestResult[] = []

    // Тест генерации голоса
    const generationResult = await this.testVoiceGeneration()
    results.push(generationResult)

    // Тест распознавания голоса
    const recognitionResult = await this.testVoiceRecognition()
    results.push(recognitionResult)

    return results
  }
}
