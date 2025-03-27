/**
 * Конфигурация для тестирования различных компонентов системы
 */

export const TEST_CONFIG = {
  // Базовая конфигурация
  server: {
    apiUrl: 'http://localhost:2999',
    webhookPath: '/webhooks/replicate',
    bflWebhookPath: '/webhooks/bfl',
    neurophotoWebhookPath: '/webhooks/neurophoto',
  },

  // Тестовые данные пользователей
  users: {
    main: {
      telegramId: '144022504', // ID тестового пользователя
      botName: 'neuro_blogger_bot',
      isRussian: true,
    },
    default: {
      telegram_id: '144022504', // ID тестового пользователя
      username: 'testuser',
    },
  },

  // Тестовые данные для бота
  bots: {
    default: 'neuro_blogger_bot',
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

  // Тестовые данные для BFL тренировок
  bflTraining: {
    samples: [
      {
        task_id: 'bfl-task-123456',
        status: 'SUCCESS',
        result: JSON.stringify({
          model_id: 'bfl-model-123',
          model_name: 'test_bfl_model',
          version: '1.0.0',
        }),
      },
      {
        task_id: 'bfl-task-error',
        status: 'ERROR',
        result: JSON.stringify({
          error: 'Training failed due to insufficient data',
          details: 'Minimum of 10 samples required',
        }),
      },
      {
        task_id: 'bfl-task-pending',
        status: 'PENDING',
        result: null,
      },
    ],
  },

  // Тестовые данные для нейрофото
  neurophoto: {
    samples: [
      {
        task_id: 'neurophoto-success-test',
        status: 'SUCCESS',
        result: {
          sample: 'https://example.com/test-image.jpg',
          seed: 123456,
          prompt: 'Тестовый промпт для нейрофото',
        },
      },
      {
        task_id: 'neurophoto-processing-test',
        status: 'processing',
      },
      {
        task_id: 'neurophoto-moderated-test',
        status: 'Content Moderated',
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
