/**
 * Результат выполнения теста
 */
export interface TestResult {
  /** Название теста */
  name: string
  /** Успешно ли выполнен тест */
  success: boolean
  /** Сообщение о результате */
  message: string
  /** Ошибка, если тест не прошел */
  error?: Error
}

/**
 * Конфигурация тестового окружения
 */
export interface TestConfig {
  /** Использовать ли мок-бота вместо реального */
  mockBot: boolean
  /** Таймаут ожидания ответа от бота (мс) */
  botResponseTimeout: number
  /** Таймаут ожидания обработки события (мс) */
  eventProcessingTimeout: number
  /** Размер буфера событий */
  eventBufferSize: number
}
