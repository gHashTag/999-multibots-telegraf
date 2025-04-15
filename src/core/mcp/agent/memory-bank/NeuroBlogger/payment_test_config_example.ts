/**
 * Пример файла конфигурации тестирования платежной системы
 * Файл src/test-utils/test-config.ts
 */

import { InngestTestEngine } from './inngestTestEngine'
import { createClient } from '@supabase/supabase-js'
import { Database } from '../types/supabase'

// Экземпляр тестового движка Inngest
export const inngestTestEngine = new InngestTestEngine()

// Конфигурация тестов
export const TEST_CONFIG = {
  // Общие настройки
  general: {
    logLevel: process.env.TEST_LOG_LEVEL || 'info',
    timeouts: {
      defaultWait: 1000,
      eventProcessing: 5000,
      databaseOperation: 3000,
      cleanup: 2000,
    },
  },

  // Настройки для платежных тестов
  payment: {
    // Тестовые пользователи
    testUsers: {
      regular: { telegram_id: '123456789' },
      premium: { telegram_id: '987654321' },
      new: { telegram_id: '111222333' },
    },

    // Суммы для тестирования
    amounts: {
      small: 10,
      medium: 100,
      large: 1000,
      zero: 0,
      negative: -50, // Для тестов валидации
    },

    // Типы транзакций для тестирования
    transactionTypes: [
      'money_income',
      'money_expense',
      'subscription_purchase',
      'subscription_renewal',
      'refund',
      'bonus',
    ],

    // Настройки для тестов с ошибками
    errorScenarios: {
      insufficientFunds: true,
      invalidAmount: true,
      duplicateOperation: true,
      timeoutScenario: true,
      concurrentRequests: true,
    },

    // Настройки конкурентности для нагрузочных тестов
    concurrency: {
      enabled: false, // Включить только для специальных тестов
      maxConcurrentRequests: 5,
      requestDelay: 100,
    },
  },

  // Настройки для тестов в Docker
  docker: {
    // Увеличенные таймауты для Docker-окружения
    timeouts: {
      defaultWait: 2000,
      eventProcessing: 8000,
      databaseOperation: 5000,
      cleanup: 3000,
    },

    // Настройки сохранения результатов тестов
    reporting: {
      saveResults: true,
      outputDir: '/app/test-results',
      format: 'json',
    },
  },

  // Настройки для моков
  mocks: {
    // По умолчанию используем моки или реальные функции
    useRealFunctions: process.env.USE_REAL_FUNCTIONS === 'true',

    // Предопределенные значения для моков
    userBalances: {
      '123456789': 1000,
      '987654321': 5000,
      '111222333': 0,
    },

    // Настройки симуляции ошибок
    errors: {
      simulateErrors: false,
      errorRate: 0.2, // 20% вероятность ошибки
      errorTypes: ['network', 'timeout', 'database'],
    },
  },

  // Функции-хелперы для тестов
  helpers: {
    // Функция для генерации тестового operation_id
    generateTestOperationId: () =>
      `test_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`,

    // Функция для очистки тестовых данных
    async cleanupTestData(
      supabaseClient: ReturnType<typeof createClient<Database>>,
      telegram_id: string
    ) {
      try {
        // Удаление тестовых платежей
        await supabaseClient
          .from('payments_v2')
          .delete()
          .eq('telegram_id', telegram_id)
          .like('description', 'Test%')

        console.log(
          `🧹 Очищены тестовые данные для пользователя ${telegram_id}`
        )
      } catch (error) {
        console.error(`❌ Ошибка при очистке тестовых данных: ${error.message}`)
      }
    },

    // Функция для подготовки тестового окружения
    async setupTestEnvironment() {
      try {
        // Инициализация тестового движка
        await inngestTestEngine.init({
          mockEvents: TEST_CONFIG.mocks.useRealFunctions ? false : true,
          logLevel: TEST_CONFIG.general.logLevel as any,
          simulateErrors: TEST_CONFIG.mocks.errors.simulateErrors,
          errorRate: TEST_CONFIG.mocks.errors.errorRate,
        })

        console.log('🚀 Тестовое окружение инициализировано')
      } catch (error) {
        console.error(
          `❌ Ошибка при инициализации тестового окружения: ${error.message}`
        )
        throw error
      }
    },

    // Функция для очистки тестового окружения
    async teardownTestEnvironment() {
      try {
        await inngestTestEngine.cleanup()
        console.log('🧹 Тестовое окружение очищено')
      } catch (error) {
        console.error(
          `❌ Ошибка при очистке тестового окружения: ${error.message}`
        )
      }
    },
  },

  // Конфигурация для разных категорий тестов
  categories: {
    // Настройки для тестов платежного процессора
    'payment-processor': {
      enabled: true,
      description: 'Тесты базового функционала платежного процессора',
      priority: 'high',
    },

    // Настройки для тестов с моками
    'payment-mock': {
      enabled: true,
      description: 'Тесты платежного процессора с использованием моков',
      priority: 'medium',
    },

    // Настройки для Docker-тестов
    'payment-docker': {
      enabled: process.env.DOCKER_TESTING === 'true',
      description: 'Тесты платежного процессора в окружении Docker',
      priority: 'low',
    },

    // Общая категория для всех платежных тестов
    payment: {
      enabled: true,
      description: 'Все тесты, связанные с платежной системой',
      priority: 'high',
      includes: ['payment-processor', 'payment-mock', 'payment-docker'],
    },
  },
}

// Типы данных для тестовой конфигурации
export interface TestConfig {
  general: {
    logLevel: string
    timeouts: {
      defaultWait: number
      eventProcessing: number
      databaseOperation: number
      cleanup: number
    }
  }
  payment: {
    testUsers: {
      [key: string]: { telegram_id: string }
    }
    amounts: {
      [key: string]: number
    }
    transactionTypes: string[]
    errorScenarios: {
      [key: string]: boolean
    }
    concurrency: {
      enabled: boolean
      maxConcurrentRequests: number
      requestDelay: number
    }
  }
  docker: {
    timeouts: {
      defaultWait: number
      eventProcessing: number
      databaseOperation: number
      cleanup: number
    }
    reporting: {
      saveResults: boolean
      outputDir: string
      format: string
    }
  }
  mocks: {
    useRealFunctions: boolean
    userBalances: {
      [key: string]: number
    }
    errors: {
      simulateErrors: boolean
      errorRate: number
      errorTypes: string[]
    }
  }
  helpers: {
    generateTestOperationId: () => string
    cleanupTestData: (supabaseClient: any, telegram_id: string) => Promise<void>
    setupTestEnvironment: () => Promise<void>
    teardownTestEnvironment: () => Promise<void>
  }
  categories: {
    [key: string]: {
      enabled: boolean
      description: string
      priority: 'high' | 'medium' | 'low'
      includes?: string[]
    }
  }
}

// Экспорт типов
export { InngestTestEngine }

// Функция для получения конфигурации в зависимости от окружения
export function getTestConfig(
  environment: 'local' | 'docker' = 'local'
): TestConfig {
  if (environment === 'docker') {
    return {
      ...TEST_CONFIG,
      general: {
        ...TEST_CONFIG.general,
        timeouts: TEST_CONFIG.docker.timeouts,
      },
    }
  }

  return TEST_CONFIG
}

// Функция для проверки, включена ли категория тестов
export function isTestCategoryEnabled(category: string): boolean {
  if (!TEST_CONFIG.categories[category]) {
    return false
  }

  return TEST_CONFIG.categories[category].enabled
}

// Пример использования:
/*
import { TEST_CONFIG, isTestCategoryEnabled } from './test-config';

// Проверка, включены ли тесты платежного процессора
if (isTestCategoryEnabled('payment-processor')) {
  // Запуск тестов
}

// Использование таймаутов из конфигурации
const eventTimeout = TEST_CONFIG.general.timeouts.eventProcessing;

// Получение тестового пользователя
const testUser = TEST_CONFIG.payment.testUsers.regular;
*/
