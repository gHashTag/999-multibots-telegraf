import { logger } from '@/utils/logger'

/**
 * Интерфейс для объекта мока
 */
export interface Mock<T = any> {
  /** Имя мока */
  name: string
  /** Категория мока */
  category: string
  /** Реализация мока */
  implementation: T
  /** Был ли вызван мок */
  called: boolean
  /** Сколько раз был вызван мок */
  callCount: number
  /** Аргументы, с которыми был вызван мок */
  calls: any[][]
  /** Функция сброса мока */
  reset: () => void
  /** Обязательный ли этот мок */
  required?: boolean
}

/**
 * Параметры создания мока
 */
export interface MockOptions<T = any> {
  /** Имя мока */
  name: string
  /** Категория мока */
  category: string
  /** Реализация мока */
  implementation: T
  /** Выбрасывать ошибку, если мок не был вызван */
  required?: boolean
}

/**
 * Менеджер моков для тестирования
 * 
 * Централизованное управление моками для удобного тестирования
 */
export class MockManager {
  private mocks: Map<string, Mock> = new Map()
  private callHistory: Array<{
    timestamp: number
    mockName: string
    args: any[]
  }> = []
  private verbose: boolean

  constructor(options: { verbose?: boolean } = {}) {
    this.verbose = options.verbose || false
  }

  /**
   * Создает новый мок функцию
   */
  createMockFn<T extends (...args: any[]) => any>(
    options: MockOptions<T>
  ): T {
    const mockName = `${options.category}.${options.name}`
    
    // Создаем функцию-обертку
    const mockFn = (...args: any[]) => {
      // Проверяем, существует ли мок
      const mock = this.mocks.get(mockName)
      if (!mock) {
        throw new Error(`Mock ${mockName} is not registered`)
      }
      
      // Обновляем статистику вызовов
      mock.called = true
      mock.callCount++
      mock.calls.push(args)
      
      // Добавляем в историю вызовов
      this.callHistory.push({
        timestamp: Date.now(),
        mockName,
        args
      })
      
      // Логируем вызов, если включен verbose режим
      if (this.verbose) {
        logger.info({
          message: `🔄 Mock called: ${mockName}`,
          callCount: mock.callCount,
          args
        })
      }
      
      // Вызываем реализацию мока
      return mock.implementation(...args)
    }
    
    // Создаем мок объект
    const mock: Mock = {
      name: options.name,
      category: options.category,
      implementation: options.implementation,
      called: false,
      callCount: 0,
      calls: [],
      reset: () => {
        mock.called = false
        mock.callCount = 0
        mock.calls = []
      }
    }
    
    // Регистрируем мок
    this.mocks.set(mockName, mock)
    
    if (this.verbose) {
      logger.info({
        message: `📝 Mock registered: ${mockName}`,
        required: options.required
      })
    }
    
    return mockFn as T
  }
  
  /**
   * Создает мок объект с методами
   */
  createMockObject<T extends object>(
    category: string,
    methods: Record<string, (...args: any[]) => any>,
    options: {
      baseObject?: Partial<T>
      requiredMethods?: string[]
    } = {}
  ): T {
    const mockObject: any = { ...(options.baseObject || {}) }
    
    // Создаем мок функции для каждого метода
    for (const [methodName, implementation] of Object.entries(methods)) {
      mockObject[methodName] = this.createMockFn({
        name: methodName,
        category,
        implementation,
        required: options.requiredMethods?.includes(methodName)
      })
    }
    
    return mockObject as T
  }
  
  /**
   * Получает зарегистрированный мок
   */
  getMock(category: string, name: string): Mock | undefined {
    return this.mocks.get(`${category}.${name}`)
  }
  
  /**
   * Проверяет, был ли вызван мок
   */
  wasCalled(category: string, name: string): boolean {
    const mock = this.getMock(category, name)
    return mock ? mock.called : false
  }
  
  /**
   * Получает количество вызовов мока
   */
  getCallCount(category: string, name: string): number {
    const mock = this.getMock(category, name)
    return mock ? mock.callCount : 0
  }
  
  /**
   * Получает аргументы вызовов мока
   */
  getCallArgs(category: string, name: string): any[][] {
    const mock = this.getMock(category, name)
    return mock ? mock.calls : []
  }
  
  /**
   * Сбрасывает все моки
   */
  resetAllMocks(): void {
    for (const mock of this.mocks.values()) {
      mock.reset()
    }
    this.callHistory = []
    
    if (this.verbose) {
      logger.info('🧹 All mocks reset')
    }
  }
  
  /**
   * Сбрасывает моки определенной категории
   */
  resetCategoryMocks(category: string): void {
    for (const [mockName, mock] of this.mocks.entries()) {
      if (mock.category === category) {
        mock.reset()
      }
    }
    
    // Фильтруем историю вызовов
    this.callHistory = this.callHistory.filter(call => !call.mockName.startsWith(`${category}.`))
    
    if (this.verbose) {
      logger.info(`🧹 Mocks reset for category: ${category}`)
    }
  }
  
  /**
   * Проверяет, что все обязательные моки были вызваны
   */
  verifyRequiredMocks(): void {
    const notCalled: string[] = []
    
    for (const [mockName, mock] of this.mocks.entries()) {
      if (mock.required && !mock.called) {
        notCalled.push(mockName)
      }
    }
    
    if (notCalled.length > 0) {
      throw new Error(`Required mocks were not called: ${notCalled.join(', ')}`)
    }
  }
  
  /**
   * Получает историю вызовов моков
   */
  getCallHistory(): typeof this.callHistory {
    return [...this.callHistory]
  }
  
  /**
   * Генерирует отчет о вызовах моков
   */
  generateCallReport(): Record<string, { callCount: number, calls: any[][] }> {
    const report: Record<string, { callCount: number, calls: any[][] }> = {}
    
    for (const [mockName, mock] of this.mocks.entries()) {
      report[mockName] = {
        callCount: mock.callCount,
        calls: mock.calls
      }
    }
    
    return report
  }
} 