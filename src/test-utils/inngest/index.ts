/**
 * Централизованный экспорт для тестовых утилит Inngest
 * Включает типы, функции и конфигурацию для тестирования Inngest функций
 */

// Типы
export interface InngestEvent<T = any> {
  name: string
  data: T
  ts?: number
  id?: string
  version?: string
}

export interface InngestTestEngineOptions {
  maxWaitTime?: number
  eventBufferSize?: number
}

export interface TestUser {
  telegramId: string
  username: string
  botName: string
  isRussian: boolean
}

export interface TestConfig {
  user: TestUser
  models: {
    photo: string
    photoV2: string
    video: string
  }
  voices: {
    male: string
    female: string
  }
}

// Экспорт функций и классов
export { InngestTestEngine } from './inngest-test-engine'
export { createTestEngine, executeTest } from './inngest'
export { TEST_CONFIG } from './test-config' 