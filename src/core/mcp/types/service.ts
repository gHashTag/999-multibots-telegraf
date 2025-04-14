/**
 * Базовый интерфейс для всех сервисов в системе
 */
export interface Service {
  /**
   * Инициализация сервиса
   */
  initialize(): Promise<void>

  /**
   * Корректное завершение работы сервиса
   */
  shutdown(): Promise<void>

  /**
   * Проверка здоровья сервиса
   */
  healthCheck?(): Promise<boolean>

  /**
   * Получение метрик сервиса
   */
  getMetrics?(): Promise<any>

  /**
   * Очистка ресурсов сервиса
   */
  cleanup?(): Promise<void>
} 