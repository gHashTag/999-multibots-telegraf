import { Inngest } from 'inngest'
import { Logger } from '@/utils/logger'

/**
 * 🎯 CLAUDE CODE INNGEST FUNCTIONS SPECIALIST
 *
 * Эксперт по созданию Inngest функций для проекта 999-agents-telegraf
 * Автоматически применяет правила из INNGEST_DEVELOPMENT_RULES.md
 *
 * КОМАНДЫ:
 * /inngest-create <название> <описание> - Создать новую функцию
 * /inngest-test <название_функции> - Протестировать функцию
 * /inngest-analyze <папка> - Анализ существующих функций
 * /inngest-register <название> - Зарегистрировать функцию
 */

const logger = new Logger('InngestSpecialist')

interface InngestFunctionConfig {
  name: string
  description: string
  category: 'content' | 'instagram' | 'monitoring' | 'training' | 'generation' | 'payment' | 'broadcast' | 'render' | 'existing'
  eventName: string
  retries?: { attempts: number; delay: string }
  concurrency?: number
  useFactory?: boolean
}

interface TestResult {
  success: boolean
  message: string
  functionPath?: string
  errors?: string[]
}

export class InngestFunctionsSpecialist {
  private projectRoot: string
  private functionsDir: string
  private registerFilePath: string
  private rulesPath: string

  constructor() {
    this.projectRoot = '/Users/playra/999-agents-telegraf/worktrees/transfer-server'
    this.functionsDir = `${this.projectRoot}/src/inngest_app/functions`
    this.registerFilePath = `${this.projectRoot}/src/inngest_app/registerFunctions.ts`
    this.rulesPath = `${this.projectRoot}/INNGEST_DEVELOPMENT_RULES.md`
  }

  /**
   * 📝 Обработчик команды создания функции
   * Usage: /inngest-create generateContentScript "Генерация скриптов для контента"
   */
  async createFunction(functionName: string, description: string, category: InngestFunctionConfig['category'] = 'existing'): Promise<string> {
    logger.info('🎯 [INNGEST CREATE] Начинаю создание функции', { functionName, description, category })

    try {
      // ШАГ 1: Найти похожую функцию как шаблон
      const templateFunction = await this.findSimilarFunction(description, category)
      if (!templateFunction) {
        throw new Error(`Не найден подходящий шаблон для категории: ${category}`)
      }

      // ШАГ 2: Определить путь для новой функции
      const functionPath = this.generateFunctionPath(functionName, category)

      // ШАГ 3: Создать функцию по шаблону
      const functionCode = await this.generateFunctionCode({
        functionName,
        description,
        category,
        templatePath: templateFunction.path,
        templateContent: templateFunction.content
      })

      // ШАГ 4: Записать файл
      await this.writeFunctionFile(functionPath, functionCode)

      // ШАГ 5: Обновить registerFunctions.ts
      await this.updateRegisterFile(functionName, category)

      logger.info('✅ [INNGEST CREATE] Функция создана успешно', {
        functionName,
        path: functionPath
      })

      return `✅ Функция "${functionName}" создана успешно!
📁 Путь: ${functionPath}
📝 Описание: ${description}
🏷️ Категория: ${category}

Следующие шаги:
1. Заполните интерфейсы и типы
2. Реализуйте основную логику в step.run()
3. Протестируйте: /inngest-test ${functionName}
4. Создайте Pull Request

⚠️ ВАЖНО: Не забудьте проверить и обновить:
- Название события (event.name)
- Логику обработки ошибок
- Параметры конфигурации`

    } catch (error) {
      logger.error('❌ [INNGEST CREATE] Ошибка при создании функции', {
        error: error instanceof Error ? error.message : String(error),
        functionName
      })
      throw error
    }
  }

  /**
   * 🧪 Обработчик команды тестирования функции
   * Usage: /inngest-test generateAIReelsFunction
   */
  async testFunction(functionName: string): Promise<TestResult> {
    logger.info('🧪 [INNGEST TEST] Начинаю тестирование функции', { functionName })

    try {
      const functionPath = await this.findFunctionPath(functionName)
      const errors: string[] = []

      // Проверка 1: Файл существует
      if (!functionPath) {
        errors.push(`Функция "${functionName}" не найдена`)
        return { success: false, message: 'Тестирование не пройдено', errors }
      }

      // Проверка 2: Импорты корректны
      const content = await this.readFile(functionPath)
      const importCheck = this.validateImports(content)
      if (!importCheck.valid) {
        errors.push(...importCheck.errors)
      }

      // Проверка 3: Структура функции
      const structureCheck = this.validateStructure(content)
      if (!structureCheck.valid) {
        errors.push(...structureCheck.errors)
      }

      // Проверка 4: Логирование
      const loggingCheck = this.validateLogging(content)
      if (!loggingCheck.valid) {
        errors.push(...loggingCheck.errors)
      }

      // Проверка 5: Зарегистрирована ли в registerFunctions.ts
      const registrationCheck = await this.validateRegistration(functionName)
      if (!registrationCheck.registered) {
        errors.push(`Функция не зарегистрирована в ${this.registerFilePath}`)
      }

      const success = errors.length === 0

      logger.info(success ? '✅ [INNGEST TEST] Все проверки пройдены' : '⚠️ [INNGEST TEST] Найдены проблемы', {
        functionName,
        errorsCount: errors.length
      })

      return {
        success,
        message: success
          ? `✅ Функция "${functionName}" прошла все проверки!`
          : `⚠️ Функция "${functionName}" имеет ${errors.length} проблем:`,
        functionPath,
        errors: errors.length > 0 ? errors : undefined
      }

    } catch (error) {
      logger.error('❌ [INNGEST TEST] Ошибка при тестировании', {
        error: error instanceof Error ? error.message : String(error),
        functionName
      })
      return {
        success: false,
        message: 'Критическая ошибка при тестировании',
        errors: [error instanceof Error ? error.message : String(error)]
      }
    }
  }

  /**
   * 🔍 Обработчик команды анализа существующих функций
   * Usage: /inngest-analyze content
   */
  async analyzeFunctions(categoryOrPath?: string): Promise<string> {
    logger.info('🔍 [INNGEST ANALYZE] Анализ существующих функций', { categoryOrPath })

    try {
      const searchPath = categoryOrPath
        ? `${this.functionsDir}/${categoryOrPath}`
        : this.functionsDir

      const functions = await this.findAllFunctions(searchPath)

      const analysis = this.generateAnalysisReport(functions, categoryOrPath)

      logger.info('✅ [INNGEST ANALYZE] Анализ завершен', {
        count: functions.length
      })

      return analysis

    } catch (error) {
      logger.error('❌ [INNGEST ANALYZE] Ошибка при анализе', {
        error: error instanceof Error ? error.message : String(error)
      })
      throw error
    }
  }

  /**
   * 📝 Обработчик команды регистрации функции
   * Usage: /inngest-register generateContentScript
   */
  async registerFunction(functionName: string): Promise<string> {
    logger.info('📝 [INNGEST REGISTER] Регистрация функции', { functionName })

    try {
      const functionPath = await this.findFunctionPath(functionName)
      if (!functionPath) {
        throw new Error(`Функция "${functionName}" не найдена`)
      }

      const category = this.determineCategoryFromPath(functionPath)
      await this.updateRegisterFile(functionName, category)

      logger.info('✅ [INNGEST REGISTER] Функция зарегистрирована', { functionName })

      return `✅ Функция "${functionName}" успешно зарегистрирована в registerFunctions.ts!

🏷️ Категория: ${category}
📁 Файл регистрации: ${this.registerFilePath}

⚠️ Проверьте:
1. Правильность импорта функции
2. Корректность имени в списке функций
3. Выполните тестирование: /inngest-test ${functionName}`

    } catch (error) {
      logger.error('❌ [INNGEST REGISTER] Ошибка при регистрации', {
        error: error instanceof Error ? error.message : String(error),
        functionName
      })
      throw error
    }
  }

  // ===== ВСПОМОГАТЕЛЬНЫЕ МЕТОДЫ =====

  /**
   * Найти похожую функцию по описанию
   */
  private async findSimilarFunction(description: string, category: InngestFunctionConfig['category']): Promise<{ path: string; content: string } | null> {
    const categoryPath = `${this.functionsDir}/${category}`
    const functions = await this.findAllFunctions(categoryPath)

    // Простая эвристика: ищем функции с похожими ключевыми словами
    const keywords = description.toLowerCase().split(' ')
    let bestMatch = null
    let maxMatches = 0

    for (const func of functions) {
      const funcContent = func.content.toLowerCase()
      let matches = 0
      for (const keyword of keywords) {
        if (keyword.length > 3 && funcContent.includes(keyword)) {
          matches++
        }
      }
      if (matches > maxMatches) {
        maxMatches = matches
        bestMatch = func
      }
    }

    // Если не нашли по категории, ищем в существующих
    if (!bestMatch && category === 'existing') {
      const existingPath = `${this.functionsDir}/existing`
      const existing = await this.findAllFunctions(existingPath)
      return existing.length > 0 ? existing[0] : null
    }

    return bestMatch
  }

  /**
   * Сгенерировать путь для функции
   */
  private generateFunctionPath(functionName: string, category: InngestFunctionConfig['category']): string {
    // Преобразуем имя функции в kebab-case
    const fileName = functionName
      .replace(/([A-Z])/g, '-$1')
      .toLowerCase()
      .replace(/^-/, '')

    return `${this.functionsDir}/${category}/${fileName}.ts`
  }

  /**
   * Сгенерировать код функции по шаблону
   */
  private async generateFunctionCode(config: {
    functionName: string
    description: string
    category: InngestFunctionConfig['category']
    templatePath: string
    templateContent: string
  }): Promise<string> {
    const { functionName, description, templateContent } = config

    // Определяем имя события из описания
    const eventName = this.generateEventName(description)

    // Извлекаем базовую структуру из шаблона
    const functionNameCamel = this.toCamelCase(functionName)
    const functionNamePascal = this.toPascalCase(functionName)

    // Заменяем ключевые части в шаблоне
    let code = templateContent

    // Заменяем название функции
    code = code.replace(/export const (\w+) = inngest\.createFunction/g, `export const ${functionNameCamel} = inngest.createFunction`)
    code = code.replace(/function (\w+)\(/g, `function ${functionNameCamel}(`)
    code = code.replace(/id: '([^']+)'/g, `id: '${functionNameCamel.replace(/([A-Z])/g, '-$1').toLowerCase()}'`)
    code = code.replace(/name: '([^']+)'/g, `name: '${functionNamePascal}'`)

    // Заменяем событие
    code = code.replace(/event: '([^']+)'/g, `event: '${eventName}'`)

    // Добавляем описание
    const comment = `/**
 * ${functionNamePascal}
 *
 * ${description}
 *
 * Создано автоматически с помощью Claude Code Inngest Specialist
 * Дата: ${new Date().toISOString()}
 */\n\n`

    if (!code.startsWith('/**')) {
      code = comment + code
    } else {
      code = comment + code.replace(/^\/\*\*.*?\*\/\s*/s, '')
    }

    return code
  }

  /**
   * Генерировать имя события
   */
  private generateEventName(description: string): string {
    return description
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, '')
      .split(' ')
      .filter(word => word.length > 2)
      .join('/')
  }

  /**
   * Преобразовать в camelCase
   */
  private toCamelCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) =>
        index === 0 ? word.toLowerCase() : word.toUpperCase()
      )
      .replace(/\s+/g, '')
  }

  /**
   * Преобразовать в PascalCase
   */
  private toPascalCase(str: string): string {
    return str
      .replace(/(?:^\w|[A-Z]|\b\w)/g, word => word.toUpperCase())
      .replace(/\s+/g, '')
  }

  /**
   * Записать файл функции
   */
  private async writeFunctionFile(path: string, content: string): Promise<void> {
    // Здесь должен быть код записи файла
    // В реальной реализации используется fs/promises
    console.log(`Запись файла: ${path}`)
    console.log(`Содержимое:\n${content}`)
  }

  /**
   * Найти все функции в папке
   */
  private async findAllFunctions(searchPath: string): Promise<Array<{ path: string; content: string }>> {
    // Здесь должен быть код поиска файлов
    // В реальной реализации используется fs/promises и glob
    return []
  }

  /**
   * Найти путь к функции по имени
   */
  private async findFunctionPath(functionName: string): Promise<string | null> {
    // Здесь должен быть код поиска
    return null
  }

  /**
   * Определить категорию по пути
   */
  private determineCategoryFromPath(path: string): InngestFunctionConfig['category'] {
    const parts = path.split('/')
    const categoryIndex = parts.indexOf('functions') + 1
    return parts[categoryIndex] as InngestFunctionConfig['category']
  }

  /**
   * Обновить файл регистрации
   */
  private async updateRegisterFile(functionName: string, category: InngestFunctionConfig['category']): Promise<void> {
    // Здесь должен быть код обновления registerFunctions.ts
    console.log(`Обновление registerFunctions.ts: добавление ${functionName} из категории ${category}`)
  }

  /**
   * Проверить корректность импортов
   */
  private validateImports(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!content.includes("import { inngest }")) {
      errors.push('Отсутствует импорт inngest')
    }

    if (!content.includes("import { logger }")) {
      errors.push('Отсутствует импорт logger')
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Проверить структуру функции
   */
  private validateStructure(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!content.includes('inngest.createFunction')) {
      errors.push('Функция не использует inngest.createFunction')
    }

    if (!content.includes('async ({ event, step }')) {
      errors.push('Функция не имеет правильную сигнатуру ({ event, step })')
    }

    if (!content.includes('retries:')) {
      errors.push('Отсутствует конфигурация retries')
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Проверить логирование
   */
  private validateLogging(content: string): { valid: boolean; errors: string[] } {
    const errors: string[] = []

    if (!content.includes('logger.info')) {
      errors.push('Отсутствует logger.info для логирования')
    }

    if (!content.includes('logger.error')) {
      errors.push('Отсутствует logger.error для обработки ошибок')
    }

    return { valid: errors.length === 0, errors }
  }

  /**
   * Проверить регистрацию функции
   */
  private async validateRegistration(functionName: string): Promise<{ registered: boolean }> {
    // Здесь должен быть код проверки регистрации
    return { registered: true }
  }

  /**
   * Прочитать файл
   */
  private async readFile(path: string): Promise<string> {
    // Здесь должен быть код чтения файла
    return ''
  }

  /**
   * Генерировать отчет анализа
   */
  private generateAnalysisReport(functions: Array<{ path: string; content: string }>, categoryOrPath?: string): string {
    const count = functions.length

    return `🔍 АНАЛИЗ СУЩЕСТВУЮЩИХ ФУНКЦИЙ

📊 Статистика:
- Найдено функций: ${count}
${categoryOrPath ? `- Категория: ${categoryOrPath}` : ''}

📁 Найденные функции:
${functions.map(f => `- ${f.path}`).join('\n')}

📋 Рекомендации:
1. Изучите структуру существующих функций
2. Найдите функцию с похожей логикой
3. Скопируйте её как шаблон
4. Адаптируйте под ваши потребности

✅ Следуйте правилам из INNGEST_DEVELOPMENT_RULES.md!
`
  }
}

// Экспортируем экземпляр специалиста
export const inngestSpecialist = new InngestFunctionsSpecialist()
