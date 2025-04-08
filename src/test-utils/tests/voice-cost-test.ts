import { logger } from '@/utils/logger'
import { TestResult } from '../types'
import { calculateModeCost, ModeEnum } from '@/price/helpers/modelsCost'

/**
 * Тестирует расчет стоимости для режима TextToVoice
 * @returns Promise<TestResult> - Результат тестирования
 */
export async function testVoiceCost(): Promise<TestResult> {
  const testName = 'Voice Cost Test'

  try {
    logger.info('🚀 Начинаем тест расчета стоимости голосового режима', {
      description: 'Starting voice cost calculation test',
      test_name: testName,
    })

    // Рассчитываем стоимость для режима TextToVoice
    const cost = calculateModeCost({ mode: ModeEnum.TextToVoice })

    logger.info('💰 Рассчитанная стоимость', {
      description: 'Calculated cost',
      test_name: testName,
      stars: cost.stars,
      rubles: cost.rubles,
      dollars: cost.dollars,
    })

    // Проверяем, что стоимость положительная
    if (cost.stars <= 0) {
      throw new Error(`Неверная стоимость в звездах: ${cost.stars}`)
    }

    if (cost.rubles <= 0) {
      throw new Error(`Неверная стоимость в рублях: ${cost.rubles}`)
    }

    if (cost.dollars <= 0) {
      throw new Error(`Неверная стоимость в долларах: ${cost.dollars}`)
    }

    logger.info('✅ Тест расчета стоимости успешно завершен', {
      description: 'Voice cost calculation test completed successfully',
      test_name: testName,
    })

    return {
      name: testName,
      success: true,
      message: `Стоимость успешно рассчитана: ${cost.stars} звезд (${cost.rubles} руб.)`,
      startTime: Date.now(),
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    const err = error instanceof Error ? error : new Error(errorMessage)

    logger.error('❌ Ошибка при расчете стоимости голосового режима', {
      description: 'Error in voice cost calculation',
      test_name: testName,
      error: errorMessage,
    })

    return {
      name: testName,
      success: false,
      message: 'Ошибка при расчете стоимости голосового режима',
      error: err,
      startTime: Date.now(),
    }
  }
}
