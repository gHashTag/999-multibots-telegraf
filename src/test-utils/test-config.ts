/**
 * Конфигурация для тестирования различных компонентов системы
 */

export const TEST_CONFIG = {
  // Базовая конфигурация
  server: {
    apiUrl: process.env.API_URL || 'http://localhost:2999',
    webhookPath: '/webhooks/replicate',
  },

  // Тестовые данные пользователей
  users: {
    main: {
      telegramId: '144022504', // ID тестового пользователя
      botName: 'ai_koshey_bot',
      isRussian: true,
    },
  },

  // Тестовые данные для тренировки моделей
  modelTraining: {
    samples: [
      {
        // Действующая тренировка - тест успешного завершения
        trainingId: 'kvb60ecsf9rme0cntzqrhca1y4',
        modelName: 'neuro_sage',
        status: 'succeeded',
        output: {
          uri: 'https://replicate.delivery/xezq/output-model/trained_model.tar',
          version: 'ghashtag/neuro_sage:abcdef123456789',
          weights: 'https://replicate.delivery/weights/example.tar',
        },
        metrics: {
          predict_time: 7230.5,
        },
      },
      {
        // Тест ошибки тренировки
        trainingId: 'error-test-training-id',
        modelName: 'error_test_model',
        status: 'failed',
        error: 'Training failed due to insufficient data quality',
        logs: 'Error at step 150: Unable to continue training. Check your dataset.',
      },
      {
        // Тест отмены тренировки
        trainingId: 'cancel-test-training-id',
        modelName: 'canceled_test_model',
        status: 'canceled',
      },
    ],
  },

  // Настройки для инструментов тестирования
  testOptions: {
    logResults: true,
    saveResults: false,
    resultsPath: './test-results',
    timeoutMs: 5000,
  },
}
