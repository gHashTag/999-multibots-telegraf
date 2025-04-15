import {
  TestSuite,
  Test,
  BeforeAll,
  AfterAll,
  BeforeEach,
  AfterEach,
} from '../../core/types'
import { TestCategory } from '../../core/categories'
import { logger } from '@/utils/logger'

/**
 * Пример тестового класса с использованием декораторов
 */
@TestSuite('Пример тестового набора', {
  category: TestCategory.Database,
  description: 'Демонстрация использования декораторов для тестов',
})
export class ExampleTest {
  private testData: Record<string, any> = {}

  /**
   * Выполняется один раз перед всеми тестами в классе
   */
  @BeforeAll()
  async setupTestSuite() {
    logger.info('🔧 Настройка тестового набора')
    this.testData = {
      createdAt: new Date(),
      items: ['item1', 'item2', 'item3'],
    }
  }

  /**
   * Выполняется один раз после всех тестов в классе
   */
  @AfterAll()
  async teardownTestSuite() {
    logger.info('🧹 Очистка после тестового набора')
    this.testData = {}
  }

  /**
   * Выполняется перед каждым тестом
   */
  @BeforeEach()
  async setupTest() {
    logger.info('🔄 Подготовка к тесту')
    this.testData.counter = 0
  }

  /**
   * Выполняется после каждого теста
   */
  @AfterEach()
  async teardownTest() {
    logger.info('✓ Завершение теста')
  }

  /**
   * Пример простого теста
   */
  @Test('Простой тест', {
    tags: ['simple', 'example'],
    description: 'Базовый тест, который всегда успешен',
  })
  async testSimple() {
    logger.info('📝 Выполнение простого теста')

    // Тест всегда успешен
    return {
      success: true,
      message: 'Тест успешно пройден',
    }
  }

  /**
   * Пример теста с асинхронными операциями
   */
  @Test('Асинхронный тест', {
    tags: ['async', 'example'],
    description: 'Тест с асинхронными операциями',
  })
  async testAsync() {
    logger.info('⏱️ Выполнение асинхронного теста')

    // Имитация асинхронной операции
    await new Promise(resolve => setTimeout(resolve, 100))

    this.testData.counter += 1

    return {
      success: true,
      message: `Асинхронная операция выполнена, счетчик: ${this.testData.counter}`,
    }
  }

  /**
   * Пример теста, который может завершиться неудачей
   */
  @Test('Условный тест', {
    tags: ['conditional', 'example'],
    description:
      'Тест, который может быть успешным или неудачным в зависимости от условия',
  })
  async testConditional() {
    logger.info('🎲 Выполнение условного теста')

    // Генерируем случайное число
    const random = Math.random()

    // Если число больше 0.3, тест успешен
    if (random > 0.3) {
      return {
        success: true,
        message: `Тест успешен (${random})`,
      }
    } else {
      // Иначе тест завершается неудачей
      return {
        success: false,
        message: `Тест не пройден (${random})`,
      }
    }
  }

  /**
   * Пример теста, который пропускается
   */
  @Test('Пропущенный тест', {
    tags: ['skipped', 'example'],
    description: 'Этот тест будет пропущен',
    skip: true,
  })
  async testSkipped() {
    logger.info('⏭️ Этот код не должен выполняться')

    return {
      success: false,
      message: 'Этот тест не должен выполняться',
    }
  }

  /**
   * Пример теста, который выполняется единственным
   */
  @Test('Эксклюзивный тест', {
    tags: ['exclusive', 'example'],
    description: 'Этот тест будет выполнен, если используется фильтр only',
    only: true,
  })
  async testOnly() {
    logger.info('🔍 Выполнение эксклюзивного теста')

    return {
      success: true,
      message: 'Эксклюзивный тест выполнен',
    }
  }
}
