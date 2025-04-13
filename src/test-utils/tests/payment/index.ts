import { logger } from '@/utils/logger'
import { TestResult } from '../../types'

// Комментарий: проверяем наличие файлов перед импортом
// Если файлы paymentProcessorTest.ts или paymentProcessorMockTest.ts не существуют,
// мы должны создать их или обновить импорты

// Тесты платежного процессора
let runPaymentProcessorTests: () => Promise<TestResult[]>
try {
  // Пытаемся импортировать
  runPaymentProcessorTests =
    require('./paymentProcessorTest').runPaymentProcessorTests
  logger.info('✅ Тесты платежного процессора загружены', {
    description: 'Payment processor tests loaded',
  })
} catch (error) {
  // Если не удалось, создаем заглушку
  logger.warn('⚠️ Тесты платежного процессора не найдены', {
    description: 'Payment processor tests not found',
    error: error instanceof Error ? error.message : String(error),
  })
  runPaymentProcessorTests = async () => {
    return [
      {
        success: false,
        name: 'Тесты платежного процессора недоступны',
        message: 'Файл тестов не найден',
      },
    ]
  }
}

// Тесты с моками платежного процессора
let runPaymentProcessorMockTests: () => Promise<TestResult[]>
try {
  // Пытаемся импортировать
  runPaymentProcessorMockTests =
    require('./paymentProcessorMockTest').runPaymentProcessorMockTests
  logger.info('✅ Тесты с моками платежного процессора загружены', {
    description: 'Payment processor mock tests loaded',
  })
} catch (error) {
  // Если не удалось, создаем заглушку
  logger.warn('⚠️ Тесты с моками платежного процессора не найдены', {
    description: 'Payment processor mock tests not found',
    error: error instanceof Error ? error.message : String(error),
  })
  runPaymentProcessorMockTests = async () => {
    return [
      {
        success: false,
        name: 'Тесты с моками платежного процессора недоступны',
        message: 'Файл тестов не найден',
      },
    ]
  }
}

// Тесты Inngest для платежей
let runPaymentInngestTests: () => Promise<TestResult[]>
try {
  // Пытаемся импортировать
  runPaymentInngestTests =
    require('./paymentInngestTest').runPaymentInngestTests
  logger.info('✅ Тесты Inngest для платежей загружены', {
    description: 'Payment Inngest tests loaded',
  })
} catch (error) {
  // Если не удалось, создаем заглушку
  logger.warn('⚠️ Тесты Inngest для платежей не найдены', {
    description: 'Payment Inngest tests not found',
    error: error instanceof Error ? error.message : String(error),
  })
  runPaymentInngestTests = async () => {
    return [
      {
        success: false,
        name: 'Тесты Inngest для платежей недоступны',
        message: 'Файл тестов не найден',
      },
    ]
  }
}

// Расширенные тесты Inngest для платежей
let runAdvancedPaymentInngestTests: () => Promise<TestResult[]>
try {
  // Пытаемся импортировать
  runAdvancedPaymentInngestTests =
    require('./paymentAdvancedInngestTest').runAdvancedPaymentInngestTests
  logger.info('✅ Расширенные тесты Inngest для платежей загружены', {
    description: 'Advanced Payment Inngest tests loaded',
  })
} catch (error) {
  // Если не удалось, создаем заглушку
  logger.warn('⚠️ Расширенные тесты Inngest для платежей не найдены', {
    description: 'Advanced Payment Inngest tests not found',
    error: error instanceof Error ? error.message : String(error),
  })
  runAdvancedPaymentInngestTests = async () => {
    return [
      {
        success: false,
        name: 'Расширенные тесты Inngest для платежей недоступны',
        message: 'Файл тестов не найден',
      },
    ]
  }
}

// Тесты для дублирующихся ID инвойсов
let runDuplicateInvoiceIdTests: (options?: {
  verbose?: boolean
}) => Promise<TestResult[]>
try {
  // Пытаемся импортировать
  runDuplicateInvoiceIdTests =
    require('./duplicateInvoiceId.test').runDuplicateInvoiceIdTests
  logger.info('✅ Тесты дублирующихся ID инвойсов загружены', {
    description: 'Duplicate invoice ID tests loaded',
  })
} catch (error) {
  // Если не удалось, создаем заглушку
  logger.warn('⚠️ Тесты дублирующихся ID инвойсов не найдены', {
    description: 'Duplicate invoice ID tests not found',
    error: error instanceof Error ? error.message : String(error),
  })
  runDuplicateInvoiceIdTests = async () => {
    return [
      {
        success: false,
        name: 'Тесты дублирующихся ID инвойсов недоступны',
        message: 'Файл тестов не найден',
      },
    ]
  }
}

// Тесты RuPayment
import { runRuPaymentTests } from './ruPaymentTest'

// Тесты уведомлений о платежах
import { runPaymentNotificationTests } from './paymentNotification.test'

// Функция для запуска тестов createSuccessfulPayment
let runCreateSuccessfulPaymentTests: () => Promise<TestResult[]>
try {
  // Пытаемся импортировать тесты для createSuccessfulPayment
  runCreateSuccessfulPaymentTests =
    require('./createSuccessfulPaymentTest').runCreateSuccessfulPaymentTests
  logger.info('✅ Загружен модуль тестов для createSuccessfulPayment', {
    description: 'createSuccessfulPayment test module loaded',
    module: './createSuccessfulPaymentTest',
  })
} catch (e) {
  // Если файла нет, создаем заглушку
  logger.warn(
    '⚠️ Не удалось загрузить модуль тестов для createSuccessfulPayment',
    {
      description: 'Failed to load createSuccessfulPayment test module',
      error: e instanceof Error ? e.message : String(e),
    }
  )
  runCreateSuccessfulPaymentTests = async () => {
    logger.warn('⚠️ Тесты для createSuccessfulPayment не найдены', {
      description: 'createSuccessfulPayment tests not found',
    })
    return [
      {
        success: false,
        name: 'CreateSuccessfulPayment Tests',
        message: 'Тесты не найдены или не могут быть загружены',
      },
    ]
  }
}

/**
 * Запуск всех тестов платежной системы
 */
export async function runPaymentTests(
  options: { verbose?: boolean } = {}
): Promise<{
  success: boolean
  results: TestResult[][]
}> {
  logger.info('🧪 Запуск всех тестов платежной системы', {
    description: 'Running all payment system tests',
    verbose: options.verbose,
  })

  const startTime = Date.now()
  const results: TestResult[][] = []

  try {
    // Запускаем тесты платежного процессора
    logger.info('💰 Запуск тестов платежного процессора', {
      description: 'Running payment processor tests',
    })
    results.push(await runPaymentProcessorTests())

    // Запускаем тесты с моками платежного процессора
    logger.info('🧩 Запуск тестов с моками платежного процессора', {
      description: 'Running payment processor mock tests',
    })
    results.push(await runPaymentProcessorMockTests())

    // Запускаем тесты Inngest для платежей
    logger.info('⚡ Запуск тестов Inngest для платежей', {
      description: 'Running payment Inngest tests',
    })
    results.push(await runPaymentInngestTests())

    // Запускаем расширенные тесты Inngest для платежей
    logger.info('🔄 Запуск расширенных тестов Inngest для платежей', {
      description: 'Running advanced payment Inngest tests',
    })
    results.push(await runAdvancedPaymentInngestTests())

    // Запускаем тесты RuPayment
    logger.info('🇷🇺 Запуск тестов RuPayment', {
      description: 'Running RuPayment tests',
    })
    results.push(await runRuPaymentTests())

    // Запускаем тесты дублирующихся ID инвойсов
    logger.info('🔢 Запуск тестов дублирующихся ID инвойсов', {
      description: 'Running duplicate invoice ID tests',
    })
    results.push(await runDuplicateInvoiceIdTests(options))

    // Запускаем тесты уведомлений о платежах
    logger.info('📣 Запуск тестов уведомлений о платежах', {
      description: 'Running payment notification tests',
    })
    results.push(await runPaymentNotificationTests())

    // Запускаем тесты для createSuccessfulPayment
    logger.info('🚀 Запуск тестов для createSuccessfulPayment', {
      description: 'Running createSuccessfulPayment tests',
    })
    results.push(await runCreateSuccessfulPaymentTests())

    // Собираем статистику
    const duration = Date.now() - startTime
    const totalGroups = results.length
    const totalTests = results.reduce((acc, group) => acc + group.length, 0)
    const totalSuccessfulTests = results.reduce(
      (acc, group) => acc + group.filter(t => t.success).length,
      0
    )

    logger.info('✅ Все тесты платежной системы завершены', {
      description: 'All payment system tests completed',
      duration,
      totalGroups,
      totalTests,
      totalSuccessfulTests,
      success_rate: `${Math.round((totalSuccessfulTests / totalTests) * 100)}%`,
    })

    return {
      success: totalSuccessfulTests === totalTests,
      results,
    }
  } catch (error) {
    const duration = Date.now() - startTime

    logger.error('❌ Ошибка при запуске тестов платежной системы', {
      description: 'Error running payment system tests',
      error: error instanceof Error ? error.message : String(error),
      duration,
    })

    return {
      success: false,
      results,
    }
  }
}

// Экспортируем те функции, которые удалось импортировать
export {
  runPaymentProcessorTests,
  runPaymentProcessorMockTests,
  runPaymentInngestTests,
  runAdvancedPaymentInngestTests,
  runRuPaymentTests,
  runDuplicateInvoiceIdTests,
  runPaymentNotificationTests,
  runCreateSuccessfulPaymentTests,
}
