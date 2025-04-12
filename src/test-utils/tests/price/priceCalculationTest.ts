import { TestResult } from '../../types'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/interfaces/modes'
import { calculateModeCost } from '@/price/calculators/modeCalculator'
import { PricingStrategy } from '@/price/types/strategies'

/**
 * Тест фиксированных цен
 */
export async function testFixedPriceCalculation(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста расчета фиксированных цен')
    console.log('🚀 Запуск теста расчета фиксированных цен')

    // Проверка цены для NeuroPhoto
    const result = calculateModeCost({ mode: ModeEnum.NeuroPhoto })

    logger.info('💲 Рассчитанная стоимость:', {
      mode: ModeEnum.NeuroPhoto,
      stars: result.stars,
      dollars: result.dollars,
      rubles: result.rubles,
    })
    console.log('💲 Рассчитанная стоимость:', {
      mode: ModeEnum.NeuroPhoto,
      stars: result.stars,
      dollars: result.dollars,
      rubles: result.rubles,
    })

    // Проверка результата
    if (result.stars <= 0) {
      return {
        success: false,
        message: `Некорректная стоимость для ${ModeEnum.NeuroPhoto}: ${result.stars}, ожидается положительное значение`,
        name: 'testFixedPriceCalculation',
      }
    }

    return {
      success: true,
      message: 'Тест расчета фиксированных цен успешно пройден',
      name: 'testFixedPriceCalculation',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте расчета фиксированных цен',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
      name: 'testFixedPriceCalculation',
    }
  }
}

/**
 * Тест расчета цен на основе модели
 */
export async function testModelBasedPriceCalculation(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста расчета цен на основе выбранной модели')
    console.log('🚀 Запуск теста расчета цен на основе выбранной модели')

    // Проверяем расчет для TextToVideo с моделью kling-v1.6-pro
    const result = calculateModeCost({
      mode: ModeEnum.TextToVideo,
      modelId: 'kling-v1.6-pro',
    })

    logger.info('💲 Рассчитанная стоимость:', {
      mode: ModeEnum.TextToVideo,
      modelId: 'kling-v1.6-pro',
      stars: result.stars,
      dollars: result.dollars,
      rubles: result.rubles,
    })
    console.log('💲 Рассчитанная стоимость:', {
      mode: ModeEnum.TextToVideo,
      modelId: 'kling-v1.6-pro',
      stars: result.stars,
      dollars: result.dollars,
      rubles: result.rubles,
    })

    // Проверка результата
    if (result.stars <= 0) {
      return {
        success: false,
        message: `Некорректная стоимость для ${ModeEnum.TextToVideo} с моделью kling-v1.6-pro: ${result.stars}, ожидается положительное значение`,
        name: 'testModelBasedPriceCalculation',
      }
    }

    // Проверяем необходимость указания моделей
    try {
      calculateModeCost({ mode: ModeEnum.TextToVideo })

      return {
        success: false,
        message: `Расчет для ${ModeEnum.TextToVideo} без модели должен выбрасывать ошибку`,
        name: 'testModelBasedPriceCalculation',
      }
    } catch (error) {
      // Это ожидаемое поведение - ошибка должна быть
      logger.info('✅ Проверка необходимости указания модели пройдена')
      console.log('✅ Проверка необходимости указания модели пройдена')
    }

    return {
      success: true,
      message: 'Тест расчета цен на основе выбранной модели успешно пройден',
      name: 'testModelBasedPriceCalculation',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте расчета цен на основе модели',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
      name: 'testModelBasedPriceCalculation',
    }
  }
}

/**
 * Тест расчета цен для бесплатных режимов
 */
export async function testFreePriceCalculation(): Promise<TestResult> {
  try {
    logger.info('🚀 Запуск теста расчета цен для бесплатных режимов')
    console.log('🚀 Запуск теста расчета цен для бесплатных режимов')

    // Проверяем бесплатные режимы
    const freeModesToTest = [ModeEnum.Help, ModeEnum.MainMenu, ModeEnum.Avatar]

    for (const mode of freeModesToTest) {
      const result = calculateModeCost({ mode })

      logger.info(`Стоимость для режима ${mode}:`, {
        stars: result.stars,
        dollars: result.dollars,
        rubles: result.rubles,
      })
      console.log(`Стоимость для режима ${mode}:`, {
        stars: result.stars,
        dollars: result.dollars,
        rubles: result.rubles,
      })

      if (result.stars !== 0) {
        return {
          success: false,
          message: `Режим ${mode} должен быть бесплатным, но стоимость: ${result.stars} звезд`,
          name: 'testFreePriceCalculation',
        }
      }
    }

    return {
      success: true,
      message: 'Тест расчета цен для бесплатных режимов успешно пройден',
      name: 'testFreePriceCalculation',
    }
  } catch (error) {
    logger.error({
      message: '❌ Ошибка в тесте расчета цен для бесплатных режимов',
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    })

    return {
      success: false,
      message: `Ошибка в тесте: ${error instanceof Error ? error.message : String(error)}`,
      name: 'testFreePriceCalculation',
    }
  }
}

/**
 * Запуск всех тестов для системы ценообразования
 */
export async function runPriceCalculationTests(): Promise<TestResult[]> {
  logger.info('🚀 Запуск тестов системы ценообразования')
  console.log('🚀 Запуск тестов системы ценообразования')

  const results: TestResult[] = []

  // Запускаем все тесты
  results.push(await testFixedPriceCalculation())
  results.push(await testModelBasedPriceCalculation())
  results.push(await testFreePriceCalculation())

  // Выводим результаты
  const successCount = results.filter(r => r.success).length
  logger.info(
    `✅ Тесты ценообразования: ${successCount}/${results.length} успешно прошли`,
    {
      results: results.map(r => ({
        name: r.name,
        success: r.success,
        message: r.message,
      })),
    }
  )
  console.log(
    `✅ Тесты ценообразования: ${successCount}/${results.length} успешно прошли`
  )
  results.forEach((result, index) => {
    console.log(
      `${index + 1}. ${result.name}: ${result.success ? '✓' : '✗'} - ${result.message}`
    )
  })

  return results
}
