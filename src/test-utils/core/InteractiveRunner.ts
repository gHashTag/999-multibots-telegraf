import readline from 'readline'
import { TestCategory, getSubcategories } from './categories'
import { TestRunner } from './TestRunner'
import { logger } from '@/utils/logger'

/**
 * Интерактивный запуск тестов
 * 
 * Позволяет выбрать тесты через интерактивное меню в терминале
 */
export class InteractiveRunner {
  private rl: readline.Interface
  private runner: TestRunner
  
  constructor(runner: TestRunner) {
    this.runner = runner
    this.rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    })
  }
  
  /**
   * Запускает интерактивный режим
   */
  async start(): Promise<void> {
    try {
      console.log('\n🧪 Интерактивный режим запуска тестов 🧪\n')
      
      // Выбор категории тестов
      const selectedCategories = await this.selectCategories()
      
      // Выбор дополнительных опций
      const options = await this.selectOptions()
      
      // Запуск тестов
      if (selectedCategories.length > 0) {
        console.log('\n🚀 Запуск тестов для категорий:')
        selectedCategories.forEach(cat => console.log(`  - ${cat}`))
        
        // Применяем опции к runner
        if (options.verbose) {
          this.runner.setVerbose(true)
        }
        
        // Запуск тестов
        console.log('\n⏳ Запуск тестов...\n')
        
        // Выбираем метод запуска в зависимости от опции parallel
        if (options.parallel) {
          await this.runner.runTestsInParallel()
        } else {
          await this.runner.runTests()
        }
      } else {
        console.log('❌ Не выбрано ни одной категории тестов')
      }
    } finally {
      this.rl.close()
    }
  }
  
  /**
   * Выбор категорий тестов с помощью интерактивного меню
   */
  private async selectCategories(): Promise<string[]> {
    const mainCategories = [
      TestCategory.All,
      TestCategory.Neuro,
      TestCategory.Database,
      TestCategory.Webhook,
      TestCategory.Inngest,
      TestCategory.Payment,
      TestCategory.Speech
    ]
    
    console.log('📋 Выберите категории тестов:')
    console.log('0. Все категории')
    
    mainCategories.forEach((cat, index) => {
      if (cat !== TestCategory.All) {
        console.log(`${index}. ${cat}`)
      }
    })
    
    console.log('\nВведите номера через запятую или "0" для выбора всех категорий:')
    const answer = await this.question('> ')
    
    // Обработка ответа
    if (answer === '0') {
      return [TestCategory.All]
    }
    
    // Парсим выбранные категории
    const selectedIndices = answer.split(',')
      .map(s => s.trim())
      .filter(s => /^\d+$/.test(s))
      .map(s => parseInt(s, 10))
      .filter(i => i >= 0 && i < mainCategories.length)
    
    // Если ничего не выбрано, возвращаем все категории
    if (selectedIndices.length === 0) {
      return [TestCategory.All]
    }
    
    // Преобразуем индексы в категории
    return selectedIndices.map(i => mainCategories[i])
  }
  
  /**
   * Выбор дополнительных опций
   */
  private async selectOptions(): Promise<{ verbose: boolean, parallel: boolean }> {
    const options = {
      verbose: false,
      parallel: false
    }
    
    console.log('\n📋 Дополнительные опции:')
    
    // Опция подробного вывода
    const verboseAnswer = await this.question('Включить подробный вывод? (y/n) [n]: ')
    options.verbose = verboseAnswer.toLowerCase() === 'y'
    
    // Опция параллельного запуска
    const parallelAnswer = await this.question('Запустить тесты параллельно? (y/n) [n]: ')
    options.parallel = parallelAnswer.toLowerCase() === 'y'
    
    return options
  }
  
  /**
   * Вспомогательный метод для запроса ввода с помощью promise
   */
  private question(query: string): Promise<string> {
    return new Promise(resolve => {
      this.rl.question(query, answer => {
        resolve(answer)
      })
    })
  }
  
  /**
   * Закрывает интерфейс readline
   */
  close(): void {
    this.rl.close()
  }
}

/**
 * Запускает тесты в интерактивном режиме
 */
export async function runInteractive(runner: TestRunner): Promise<void> {
  const interactive = new InteractiveRunner(runner)
  await interactive.start()
} 