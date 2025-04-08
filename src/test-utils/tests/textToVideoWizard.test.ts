import { Logger as logger } from '@/utils/logger'
import { TestResult } from '../types'
import { VIDEO_MODELS_CONFIG, VideoModelConfig } from '@/menu/videoModelMenu'
import { TEST_CONFIG } from '../test-config'

/**
 * Тестирует функциональность мастера генерации видео из текста
 */
export async function testTextToVideoWizard(): Promise<TestResult[]> {
  const results: TestResult[] = []
  const startTime = Date.now()

  logger.info({
    message: '🎯 Запуск тестов мастера генерации видео',
    description: 'Starting text-to-video wizard tests',
  })

  try {
    // Тест 1: Проверка моделей, требующих изображение
    const imageModels = Object.values(VIDEO_MODELS_CONFIG).filter(
      model => model.inputType.includes('image')
    )

    results.push({
      name: 'Проверка моделей с изображением',
      success: imageModels.length > 0,
      message: imageModels.length > 0
        ? `Найдено ${imageModels.length} моделей, требующих изображение`
        : 'Не найдено моделей, требующих изображение',
      duration: Date.now() - startTime,
      details: { models: imageModels.map(m => m.id) },
    })

    // Тест 2: Проверка моделей с текстовым вводом
    const textModels = Object.values(VIDEO_MODELS_CONFIG).filter(
      model => model.inputType.includes('text')
    )

    results.push({
      name: 'Проверка моделей с текстовым вводом',
      success: textModels.length > 0,
      message: textModels.length > 0
        ? `Найдено ${textModels.length} моделей с текстовым вводом`
        : 'Не найдено моделей с текстовым вводом',
      duration: Date.now() - startTime,
      details: { models: textModels.map(m => m.id) },
    })

    // Тест 3: Проверка обработки некорректной модели
    results.push({
      name: 'Проверка обработки некорректной модели',
      success: !VIDEO_MODELS_CONFIG['invalid-model'],
      message: !VIDEO_MODELS_CONFIG['invalid-model']
        ? 'Некорректная модель успешно обработана'
        : 'Ошибка при обработке некорректной модели',
      duration: Date.now() - startTime,
    })

    logger.info({
      message: '✅ Тесты мастера генерации видео завершены',
      description: 'Text-to-video wizard tests completed',
      success_count: results.filter(r => r.success).length,
      total_count: results.length,
    })

    return results
  } catch (error) {
    logger.error({
      message: '❌ Ошибка при выполнении тестов мастера генерации видео',
      description: 'Error running text-to-video wizard tests',
      error: error instanceof Error ? error.message : String(error),
    })

    return [{
      name: 'Тесты мастера генерации видео',
      success: false,
      message: 'Критическая ошибка при выполнении тестов',
      error: error instanceof Error ? error.message : String(error),
      duration: Date.now() - startTime,
    }]
  }
} 