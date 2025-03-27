/**
 * Конфигурация для тестирования различных компонентов системы
 */

export const TEST_CONFIG = {
  // Базовая конфигурация
  server: {
    apiUrl: 'http://localhost:2999',
    webhookPath: '/webhooks/replicate',
  },

  // Тестовые данные пользователей
  users: {
    main: {
      telegramId: '144022504', // ID тестового пользователя
      botName: 'neuro_blogger_bot',
      isRussian: true,
    },
  },

  // Тестовые данные для тренировки моделей
  modelTraining: {
    samples: [
      {
        trainingId: 'kvb60ecsf9rme0cntzqrhca1y4',
        modelName: 'test_model_1',
        status: 'succeeded',
        outputUrl:
          'https://replicate.delivery/xezq/output-model/trained_model.tar',
        version: 'ghashtag/neuro_sage:af5678e9a7b6552f3f8c6875e5e9f1c3f7d5f1e8',
        metrics: {
          predict_time: 7230.5,
        },
      },
      {
        trainingId: 'failed-training-id',
        modelName: 'test_model_2',
        status: 'failed',
        error: 'Not enough training images',
        metrics: {
          predict_time: 120.5,
        },
      },
      {
        trainingId: 'canceled-training-id',
        modelName: 'test_model_3',
        status: 'canceled',
        metrics: {
          predict_time: 45.2,
        },
      },
    ],
  },

  // Настройки для инструментов тестирования
  options: {
    logResults: true,
    saveResults: false,
    resultsPath: './test-results',
    timeout: 5000,
  },
}
