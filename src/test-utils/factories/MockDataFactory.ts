import { MockManager } from '../core/MockManager'
import { logger } from '@/utils/logger'
import { ModeEnum } from '@/types/modes'

/**
 * Фабрика для создания моков данных
 * 
 * Использует MockManager для централизованного управления моками
 */
export class MockDataFactory {
  private static mockManager = new MockManager()
  
  /**
   * Устанавливает уровень подробностей логирования
   */
  static setVerbose(verbose: boolean) {
    this.mockManager = new MockManager({ verbose })
  }
  
  /**
   * Сбрасывает все моки
   */
  static resetAllMocks() {
    this.mockManager.resetAllMocks()
  }
  
  /**
   * Создает мок для Supabase-операций
   */
  static createSupabaseMock() {
    return this.mockManager.createMockObject('Supabase', {
      getUserByTelegramIdString: async () => ({ 
        id: 'test-user-id',
        telegram_id: '144022504',
        level: 1,
        bot_name: 'test_bot',
        username: 'test_user',
      }),
      getUserByTelegramId: async () => ({ 
        id: 'test-user-id',
        telegram_id: '144022504',
        level: 1,
        bot_name: 'test_bot',
        username: 'test_user',
      }),
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
      from: () => ({
        select: () => ({
          eq: () => ({
            eq: () => ({
              gte: () => ({
                order: () => ({
                  limit: async () => ({ data: [] })
                })
              })
            })
          })
        })
      })
    })
  }
  
  /**
   * Создает мок для Replicate API
   */
  static createReplicateMock() {
    return this.mockManager.createMockObject('Replicate', {
      run: async () => ['https://example.com/test-image.jpg'],
      processApiResponse: async () => 'https://example.com/test-image.jpg'
    })
  }
  
  /**
   * Создает мок для Telegram бота
   */
  static createTelegramBotMock() {
    return this.mockManager.createMockObject('TelegramBot', {
      getBotByName: () => ({
        bot: {
          telegram: {
            sendMessage: async () => true,
            sendPhoto: async () => true,
          }
        }
      })
    })
  }
  
  /**
   * Создает мок для вспомогательных функций
   */
  static createHelperMock() {
    return this.mockManager.createMockObject('Helper', {
      saveFileLocally: async () => '/tmp/test-image.jpg',
      pulse: async () => true
    })
  }
  
  /**
   * Создает мок для fetch API
   */
  static createFetchMock(responseData?: any) {
    return this.mockManager.createMockFn({
      name: 'fetch',
      category: 'API',
      implementation: async () => ({
        ok: true,
        json: async () => responseData || {
          id: 'test-task-id-1234',
          status: 'processing',
        },
        text: async () => 'OK'
      })
    })
  }
  
  /**
   * Создает все моки для тестирования
   */
  static createAllMocks() {
    const supabaseMock = this.createSupabaseMock()
    const replicateMock = this.createReplicateMock()
    const telegramMock = this.createTelegramBotMock()
    const helperMock = this.createHelperMock()
    const fetchMock = this.createFetchMock()
    
    return {
      ...supabaseMock,
      ...replicateMock,
      ...telegramMock,
      ...helperMock,
      fetch: fetchMock
    }
  }
  
  /**
   * Генерирует отчет о вызванных моках
   */
  static generateMockReport() {
    return this.mockManager.generateCallReport()
  }
  
  /**
   * Проверяет, был ли вызван конкретный мок
   */
  static wasMockCalled(category: string, name: string): boolean {
    return this.mockManager.wasCalled(category, name)
  }
  
  /**
   * Получает количество вызовов мока
   */
  static getMockCallCount(category: string, name: string): number {
    return this.mockManager.getCallCount(category, name)
  }
  
  /**
   * Проверяет, что все обязательные моки были вызваны
   */
  static verifyRequiredMocks() {
    this.mockManager.verifyRequiredMocks()
  }
} 