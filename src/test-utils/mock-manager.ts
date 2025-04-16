import { logger } from '@/utils/logger'

/**
 * Менеджер моков для тестирования
 */
export class MockManager {
  private mocks: Map<string, any> = new Map()

  /**
   * Регистрирует мок для модуля
   */
  registerMock(modulePath: string, mockImplementation: any): void {
    logger.info(`📝 Регистрация мока для модуля: ${modulePath}`)
    this.mocks.set(modulePath, mockImplementation)
  }

  /**
   * Получает мок для модуля
   */
  getMock(modulePath: string): any {
    return this.mocks.get(modulePath)
  }

  /**
   * Проверяет наличие мока для модуля
   */
  hasMock(modulePath: string): boolean {
    return this.mocks.has(modulePath)
  }

  /**
   * Очищает все моки
   */
  clearMocks(): void {
    logger.info('🧹 Очистка всех моков')
    this.mocks.clear()
  }
}

export const mockManager = new MockManager()
