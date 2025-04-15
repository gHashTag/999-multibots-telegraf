import { ModeEnum } from '@/types/modes'
import { API_URL } from '@/config'

/**
 * Фабрика для создания тестовых данных
 *
 * Используется для генерации тестовых данных и моков для тестирования различных компонентов системы
 */
export class TestDataFactory {
  /**
   * Создает базовые данные пользователя для тестов
   */
  static createTestUser(overrides?: Partial<any>) {
    return {
      id: 'test-user-id',
      telegram_id: '144022504',
      level: 1,
      bot_name: 'test_bot',
      username: 'test_user',
      ...overrides,
    }
  }

  /**
   * Создает данные для тестирования нейрофото
   */
  static createNeuroPhotoData(overrides?: Partial<any>) {
    return {
      prompt: 'Тестовый промпт для нейрофото - портрет в городе',
      model_url:
        'stability-ai/sdxl:c221b2b8ef527988fb59bf24a8b97c4561f1c671f73bd389f866bfb27c061316',
      numImages: 1,
      telegram_id: '144022504',
      username: 'test_user',
      is_ru: true,
      bot_name: 'test_bot',
      ...overrides,
    }
  }

  /**
   * Создает данные для тестирования нейрофото V2
   */
  static createNeuroPhotoV2Data(overrides?: Partial<any>) {
    return {
      prompt: 'Тестовый промпт для нейрофото V2 - портрет в городе',
      num_images: 1,
      telegram_id: '144022504',
      username: 'test_user',
      is_ru: true,
      bot_name: 'test_bot',
      ...overrides,
    }
  }

  /**
   * Создает данные для вебхука нейрофото
   */
  static createNeuroPhotoWebhookData(options: {
    taskId: string
    status: string
    withResult?: boolean
  }) {
    const payload: any = {
      task_id: options.taskId,
      status: options.status,
    }

    if (options.withResult) {
      payload.result = {
        sample: 'https://example.com/test-image.jpg',
        seed: 123456,
        prompt: 'Тестовый промпт для нейрофото',
      }
    }

    return payload
  }

  /**
   * Создает моки для тестирования Inngest функций
   */
  static createInngestMocks() {
    return {
      step: {
        run: async (name: string, fn: () => Promise<any>) => {
          return await fn()
        },
      },
    }
  }

  /**
   * Создает моки для Supabase
   */
  static createSupabaseMocks() {
    return {
      getUserByTelegramIdString: async () => TestDataFactory.createTestUser(),
      getUserByTelegramId: async () => TestDataFactory.createTestUser(),
      updateUserLevelPlusOne: async () => true,
      getAspectRatio: async () => '1:1',
      savePrompt: async () => 'test-prompt-id',
      getUserBalance: async () => 1000,
      getFineTuneIdByTelegramId: async () => 'test-finetune-id',
      saveNeuroPhotoPrompt: async () => ({
        id: 'test-prompt-id',
        telegram_id: '144022504',
        prompt: 'Тестовый промпт для нейрофото V2',
        mode: ModeEnum.NeuroPhotoV2,
        status: 'processing',
      }),
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              eq: () => ({
                gte: () => ({
                  order: () => ({
                    limit: async () => ({ data: [] }),
                  }),
                }),
              }),
            }),
          }),
        }),
      },
    }
  }

  /**
   * Создает моки для Replicate
   */
  static createReplicateMocks() {
    return {
      replicate: {
        run: async () => ['https://example.com/test-image.jpg'],
      },
      processApiResponse: async () => 'https://example.com/test-image.jpg',
    }
  }

  /**
   * Создает моки для Telegram бота
   */
  static createTelegramBotMocks() {
    return {
      getBotByName: () => ({
        bot: {
          telegram: {
            sendMessage: async () => true,
            sendPhoto: async () => true,
          },
        },
      }),
    }
  }

  /**
   * Создает моки для вспомогательных функций
   */
  static createHelperMocks() {
    return {
      saveFileLocally: async () => '/tmp/test-image.jpg',
      pulse: async () => true,
    }
  }

  /**
   * Создает мок для fetch API
   */
  static createFetchMock(responseData?: any) {
    return async () => ({
      ok: true,
      json: async () =>
        responseData || {
          id: 'test-task-id-1234',
          status: 'processing',
        },
      text: async () => 'OK',
    })
  }

  /**
   * Создает все необходимые моки для тестирования функций
   */
  static createAllMocks() {
    return {
      ...TestDataFactory.createSupabaseMocks(),
      ...TestDataFactory.createReplicateMocks(),
      ...TestDataFactory.createTelegramBotMocks(),
      ...TestDataFactory.createHelperMocks(),
      fetch: TestDataFactory.createFetchMock(),
    }
  }
}
