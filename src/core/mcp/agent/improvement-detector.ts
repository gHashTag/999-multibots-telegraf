/**
 * Система обнаружения потенциальных улучшений в кодовой базе
 * Анализирует код и предлагает возможные улучшения
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { Service } from '@/core/mcp/types'
import { ImprovementType } from './self-improvement.js'

// Типы для системы обнаружения улучшений
export interface ImprovementSuggestion {
  id: string
  title: string
  description: string
  type: ImprovementType
  priority: number // От 1 (низкий) до 10 (высокий)
  affected_files: string[]
  detected_at: Date
  estimate_complexity: 'LOW' | 'MEDIUM' | 'HIGH'
  suggested_action: string
  is_implemented?: boolean
  tags?: string[] // Теги для категоризации улучшений
  confidence_score?: number // Уверенность в предлагаемом улучшении (0-1)
  potential_impact?: 'LOW' | 'MEDIUM' | 'HIGH' // Потенциальное влияние улучшения
  estimated_effort_hours?: number // Оценка трудозатрат в часах
  test_impact?: boolean // Влияет ли на тесты
  dependencies?: string[] // ID улучшений, от которых зависит текущее
  repository?: string // Репозиторий, если анализируется несколько
  ratings?: Array<{
    score: number
    feedback: string
    timestamp: Date
  }> // Рейтинги улучшения
  average_rating?: number // Средняя оценка рейтинга
}

export interface CodebaseAnalysisResult {
  suggestions: ImprovementSuggestion[]
  total_files_analyzed: number
  errors: string[]
  analysis_date: Date
  analysis_duration_ms?: number // Длительность анализа в миллисекундах
  analyzed_repositories?: string[] // Анализируемые репозитории
  stats?: {
    // Статистика по типам улучшений
    by_type: Record<string, number>
    by_priority: Record<string, number>
    by_complexity: Record<string, number>
  }
  filter_criteria?: Record<string, any> // Критерии фильтрации
}

// Интерфейс для анализа кода по различным аспектам
export interface CodeAnalysisAspect {
  name: string // Название аспекта
  analyze(
    file: string,
    content: string,
    fileExt: string
  ): Promise<ImprovementSuggestion[]>
}

// Класс для реализации конкретного аспекта анализа кода
class CodeQualityAnalysisAspect implements CodeAnalysisAspect {
  name = 'CodeQuality'
  private mcpService: Service

  constructor(mcpService: Service) {
    this.mcpService = mcpService
  }

  async analyze(
    filePath: string,
    content: string,
    fileExt: string
  ): Promise<ImprovementSuggestion[]> {
    // Формируем промпт для анализа качества кода
    const analysisPrompt = `
You are an autonomous agent analyzing a source code file to detect potential code quality improvements.

File: ${filePath}
Language: ${getLanguageByExtension(fileExt)}

CODE CONTENT:
\`\`\`
${content}
\`\`\`

Focus specifically on code quality issues:
1. Code complexity and readability
2. Naming conventions
3. Code duplication
4. Function/method length
5. Proper error handling
6. Comment quality and documentation
7. Adherence to language best practices

For each potential improvement, respond in this structured format:
IMPROVEMENT: [Short title of the improvement]
TYPE: CODE_QUALITY
DESCRIPTION: [Detailed description of the issue and how it could be improved]
PRIORITY: [1-10, where 10 is highest priority]
COMPLEXITY: [LOW|MEDIUM|HIGH]
AFFECTED_FILES: [List of files that would need to be modified, with this file as primary]
SUGGESTED_ACTION: [Brief description of the recommended action]
TAGS: [Comma-separated list of relevant tags like "readability", "naming", "complexity"]
CONFIDENCE: [0.0-1.0 confidence score]
IMPACT: [LOW|MEDIUM|HIGH]
EFFORT: [Estimated hours]

Limit your response to the 3 most important code quality improvements. If no significant improvements are needed, respond with "NO_IMPROVEMENTS_NEEDED".
    `

    try {
      // @ts-ignore
      const analysisResult = await this.mcpService.processTask(analysisPrompt)

      if (analysisResult.includes('NO_IMPROVEMENTS_NEEDED')) {
        return []
      }

      return parseImprovementSuggestions(analysisResult, filePath)
    } catch (error) {
      console.error(`Error analyzing code quality for ${filePath}:`, error)
      return []
    }
  }
}

// Класс для анализа производительности кода
class PerformanceAnalysisAspect implements CodeAnalysisAspect {
  name = 'Performance'
  private mcpService: Service

  constructor(mcpService: Service) {
    this.mcpService = mcpService
  }

  async analyze(
    filePath: string,
    content: string,
    fileExt: string
  ): Promise<ImprovementSuggestion[]> {
    // Формируем промпт для анализа производительности
    const analysisPrompt = `
You are an autonomous agent analyzing a source code file to detect potential performance improvements.

File: ${filePath}
Language: ${getLanguageByExtension(fileExt)}

CODE CONTENT:
\`\`\`
${content}
\`\`\`

Focus specifically on performance issues:
1. Inefficient algorithms
2. Redundant operations
3. Memory leaks
4. Unnecessary computations
5. Inefficient data structures
6. Potential bottlenecks
7. Resource-intensive operations that could be optimized

For each potential improvement, respond in this structured format:
IMPROVEMENT: [Short title of the improvement]
TYPE: PERFORMANCE
DESCRIPTION: [Detailed description of the issue and how it could be improved]
PRIORITY: [1-10, where 10 is highest priority]
COMPLEXITY: [LOW|MEDIUM|HIGH]
AFFECTED_FILES: [List of files that would need to be modified, with this file as primary]
SUGGESTED_ACTION: [Brief description of the recommended action]
TAGS: [Comma-separated list of relevant tags like "algorithm", "memory", "cpu"]
CONFIDENCE: [0.0-1.0 confidence score]
IMPACT: [LOW|MEDIUM|HIGH]
EFFORT: [Estimated hours]

Limit your response to the 2 most important performance improvements. If no significant improvements are needed, respond with "NO_IMPROVEMENTS_NEEDED".
    `

    try {
      // @ts-ignore
      const analysisResult = await this.mcpService.processTask(analysisPrompt)

      if (analysisResult.includes('NO_IMPROVEMENTS_NEEDED')) {
        return []
      }

      return parseImprovementSuggestions(analysisResult, filePath)
    } catch (error) {
      console.error(`Error analyzing performance for ${filePath}:`, error)
      return []
    }
  }
}

// Класс для анализа безопасности кода
class SecurityAnalysisAspect implements CodeAnalysisAspect {
  name = 'Security'
  private mcpService: Service

  constructor(mcpService: Service) {
    this.mcpService = mcpService
  }

  async analyze(
    filePath: string,
    content: string,
    fileExt: string
  ): Promise<ImprovementSuggestion[]> {
    // Формируем промпт для анализа безопасности
    const analysisPrompt = `
You are an autonomous agent analyzing a source code file to detect potential security vulnerabilities.

File: ${filePath}
Language: ${getLanguageByExtension(fileExt)}

CODE CONTENT:
\`\`\`
${content}
\`\`\`

Focus specifically on security issues:
1. Injection vulnerabilities
2. Authentication problems
3. Insecure data handling
4. Sensitive information exposure
5. Missing access controls
6. Input validation issues
7. Potential security vulnerabilities specific to the language/framework

For each potential security issue, respond in this structured format:
IMPROVEMENT: [Short title of the security improvement]
TYPE: SECURITY
DESCRIPTION: [Detailed description of the vulnerability and how it could be fixed]
PRIORITY: [1-10, where 10 is highest priority]
COMPLEXITY: [LOW|MEDIUM|HIGH]
AFFECTED_FILES: [List of files that would need to be modified, with this file as primary]
SUGGESTED_ACTION: [Brief description of the recommended action]
TAGS: [Comma-separated list of relevant tags like "injection", "authentication", "validation"]
CONFIDENCE: [0.0-1.0 confidence score]
IMPACT: [LOW|MEDIUM|HIGH]
EFFORT: [Estimated hours]

Limit your response to the 2 most critical security improvements. If no significant issues are found, respond with "NO_IMPROVEMENTS_NEEDED".
    `

    try {
      // @ts-ignore
      const analysisResult = await this.mcpService.processTask(analysisPrompt)

      if (analysisResult.includes('NO_IMPROVEMENTS_NEEDED')) {
        return []
      }

      return parseImprovementSuggestions(analysisResult, filePath)
    } catch (error) {
      console.error(`Error analyzing security for ${filePath}:`, error)
      return []
    }
  }
}

// Общая функция для парсинга результатов анализа в структурированные предложения
function parseImprovementSuggestions(
  analysisResult: string,
  primaryFilePath: string
): ImprovementSuggestion[] {
  const suggestions: ImprovementSuggestion[] = []
  const improvementSections = analysisResult.split('IMPROVEMENT:').slice(1)

  for (const section of improvementSections) {
    try {
      const titleMatch = section.trim().split('\n')[0].trim()
      const typeMatch = /TYPE:\s*([A-Z_]+)/.exec(section)
      const descriptionMatch =
        /DESCRIPTION:\s*(.+?)(?=PRIORITY:|TYPE:|COMPLEXITY:|AFFECTED_FILES:|SUGGESTED_ACTION:|TAGS:|CONFIDENCE:|IMPACT:|EFFORT:|$)/s.exec(
          section
        )
      const priorityMatch = /PRIORITY:\s*([0-9]+)/.exec(section)
      const complexityMatch = /COMPLEXITY:\s*(LOW|MEDIUM|HIGH)/.exec(section)
      const affectedFilesMatch =
        /AFFECTED_FILES:\s*(.+?)(?=SUGGESTED_ACTION:|TAGS:|CONFIDENCE:|IMPACT:|EFFORT:|$)/s.exec(
          section
        )
      const suggestedActionMatch =
        /SUGGESTED_ACTION:\s*(.+?)(?=TAGS:|CONFIDENCE:|IMPACT:|EFFORT:|$)/s.exec(
          section
        )
      const tagsMatch = /TAGS:\s*(.+?)(?=CONFIDENCE:|IMPACT:|EFFORT:|$)/s.exec(
        section
      )
      const confidenceMatch = /CONFIDENCE:\s*([0-9.]+)/.exec(section)
      const impactMatch = /IMPACT:\s*(LOW|MEDIUM|HIGH)/.exec(section)
      const effortMatch = /EFFORT:\s*([0-9.]+)/.exec(section)

      if (titleMatch) {
        const suggestion: ImprovementSuggestion = {
          id: generateImprovementId(),
          title: titleMatch,
          description: descriptionMatch
            ? descriptionMatch[1].trim()
            : 'No description provided',
          type: typeMatch
            ? (typeMatch[1] as ImprovementType)
            : ImprovementType.CODE_QUALITY,
          priority: priorityMatch ? parseInt(priorityMatch[1]) : 5,
          affected_files: [primaryFilePath],
          detected_at: new Date(),
          estimate_complexity: complexityMatch
            ? (complexityMatch[1] as 'LOW' | 'MEDIUM' | 'HIGH')
            : 'MEDIUM',
          suggested_action: suggestedActionMatch
            ? suggestedActionMatch[1].trim()
            : 'Review and refactor as needed',
        }

        // Добавляем дополнительные поля, если они есть
        if (tagsMatch && tagsMatch[1]) {
          suggestion.tags = tagsMatch[1]
            .trim()
            .split(/\s*,\s*/)
            .filter(Boolean)
        }

        if (confidenceMatch && confidenceMatch[1]) {
          suggestion.confidence_score = parseFloat(confidenceMatch[1])
        }

        if (impactMatch && impactMatch[1]) {
          suggestion.potential_impact = impactMatch[1] as
            | 'LOW'
            | 'MEDIUM'
            | 'HIGH'
        }

        if (effortMatch && effortMatch[1]) {
          suggestion.estimated_effort_hours = parseFloat(effortMatch[1])
        }

        // Парсим дополнительные затронутые файлы, если они указаны
        if (affectedFilesMatch) {
          const additionalFiles = affectedFilesMatch[1]
            .trim()
            .split(/[,\n]/)
            .map((file: string) => file.trim())
            .filter((file: string) => file && file !== primaryFilePath)

          suggestion.affected_files = [primaryFilePath, ...additionalFiles]
        }

        suggestions.push(suggestion)
      }
    } catch (parseError) {
      console.error('Error parsing improvement suggestion:', parseError)
    }
  }

  return suggestions
}

/**
 * Анализ файла исходного кода на потенциальные улучшения
 * Базовый вариант анализа файла без специализации по аспектам
 * @param mcpService Сервис MCP
 * @param filePath Путь к файлу
 * @param fileContent Содержимое файла
 * @returns Массив предложений по улучшению
 */
async function analyzeFile(
  mcpService: Service,
  filePath: string,
  fileContent: string
): Promise<ImprovementSuggestion[]> {
  const fileExtension = path.extname(filePath).toLowerCase()
  const fileName = path.basename(filePath)

  // Формируем промпт для анализа файла
  const analysisPrompt = `
You are an autonomous agent analyzing a source code file to detect potential improvements.

File: ${filePath}
Language: ${getLanguageByExtension(fileExtension)}

CODE CONTENT:
\`\`\`
${fileContent}
\`\`\`

Please analyze this file and identify potential improvements that could be made.
Focus on:
1. Code quality issues
2. Performance optimizations
3. Security vulnerabilities
4. Missing error handling
5. Duplicated code
6. Outdated patterns or practices
7. Missing tests or documentation

For each potential improvement, respond in this structured format:
IMPROVEMENT: [Short title of the improvement]
TYPE: [CODE_QUALITY|NEW_FEATURE|BUG_FIX|PERFORMANCE|DOCUMENTATION|TESTING|SECURITY]
DESCRIPTION: [Detailed description of the issue and how it could be improved]
PRIORITY: [1-10, where 10 is highest priority]
COMPLEXITY: [LOW|MEDIUM|HIGH]
AFFECTED_FILES: [List of files that would need to be modified, with this file as primary]
SUGGESTED_ACTION: [Brief description of the recommended action]

Limit your response to the 3 most important improvements. If no significant improvements are needed, respond with "NO_IMPROVEMENTS_NEEDED".
  `

  try {
    // @ts-ignore
    const analysisResult = await mcpService.processTask(analysisPrompt)

    if (analysisResult.includes('NO_IMPROVEMENTS_NEEDED')) {
      return []
    }

    return parseImprovementSuggestions(analysisResult, filePath)
  } catch (error) {
    console.error(`Error analyzing file ${filePath}:`, error)
    return []
  }
}

/**
 * Улучшенный анализ файла с использованием нескольких аспектов
 * @param mcpService Сервис MCP
 * @param filePath Путь к файлу
 * @param fileContent Содержимое файла
 * @param aspects Аспекты анализа для применения
 * @returns Массив предложений по улучшению
 */
async function analyzeFileWithAspects(
  mcpService: Service,
  filePath: string,
  fileContent: string,
  aspects: CodeAnalysisAspect[] = []
): Promise<ImprovementSuggestion[]> {
  if (aspects.length === 0) {
    // Если аспекты не указаны, используем обычный анализ
    return analyzeFile(mcpService, filePath, fileContent)
  }

  const fileExtension = path.extname(filePath).toLowerCase()
  const allSuggestions: ImprovementSuggestion[] = []

  // Запускаем анализ по каждому аспекту параллельно
  const aspectPromises = aspects.map(aspect =>
    aspect.analyze(filePath, fileContent, fileExtension).catch(error => {
      console.error(`Error in aspect ${aspect.name}:`, error)
      return [] as ImprovementSuggestion[]
    })
  )

  // Ждем завершения всех анализов
  const aspectResults = await Promise.all(aspectPromises)

  // Объединяем результаты
  for (let i = 0; i < aspectResults.length; i++) {
    allSuggestions.push(...aspectResults[i])
  }

  return allSuggestions
}

/**
 * Анализирует директорию для поиска потенциальных улучшений с расширенными опциями
 * @param mcpService Сервис MCP
 * @param directory Директория для анализа
 * @param options Опции анализа
 * @returns Результат анализа кодовой базы
 */
export async function analyzeCodebase(
  mcpService: Service,
  directory: string = 'src',
  options: {
    ignore?: string[]
    extensions?: string[]
    limit?: number
    aspectTypes?: ('code_quality' | 'performance' | 'security')[]
    repository?: string
    filterMinPriority?: number
  } = {}
): Promise<CodebaseAnalysisResult> {
  const startTime = Date.now()

  const result: CodebaseAnalysisResult = {
    suggestions: [],
    total_files_analyzed: 0,
    errors: [],
    analysis_date: new Date(),
    stats: {
      by_type: {},
      by_priority: {},
      by_complexity: {},
    },
    filter_criteria: { ...options },
  }

  if (options.repository) {
    result.analyzed_repositories = [options.repository]
  }

  const ignorePaths = options.ignore || ['node_modules', 'dist', '.git']
  const fileExtensions = options.extensions || ['.ts', '.js', '.tsx', '.jsx']
  const maxSuggestions = options.limit || 10
  const filterMinPriority = options.filterMinPriority || 0

  // Создаем аспекты анализа на основе запрошенных типов
  const aspects: CodeAnalysisAspect[] = []

  if (!options.aspectTypes || options.aspectTypes.includes('code_quality')) {
    aspects.push(new CodeQualityAnalysisAspect(mcpService))
  }

  if (options.aspectTypes && options.aspectTypes.includes('performance')) {
    aspects.push(new PerformanceAnalysisAspect(mcpService))
  }

  if (options.aspectTypes && options.aspectTypes.includes('security')) {
    aspects.push(new SecurityAnalysisAspect(mcpService))
  }

  try {
    // Нормализуем путь к директории
    const basePath = path.isAbsolute(directory)
      ? directory
      : path.join(process.cwd(), directory)

    // Получаем список файлов для анализа
    const files = await findSourceFiles(basePath, fileExtensions, ignorePaths)
    console.log(`Found ${files.length} files for analysis`)

    // Анализируем каждый файл
    for (const file of files) {
      try {
        console.log(`Analyzing file: ${file}`)

        // Читаем содержимое файла
        const content = await fs.promises.readFile(file, 'utf-8')

        // Анализируем файл с использованием выбранных аспектов
        const fileSuggestions = await analyzeFileWithAspects(
          mcpService,
          file,
          content,
          aspects
        )

        // Фильтруем предложения по минимальному приоритету
        const filteredSuggestions = fileSuggestions.filter(
          s => s.priority >= filterMinPriority
        )

        // Добавляем информацию о репозитории, если указан
        if (options.repository) {
          for (const suggestion of filteredSuggestions) {
            suggestion.repository = options.repository
          }
        }

        // Добавляем предложения к общему результату
        result.suggestions.push(...filteredSuggestions)
        result.total_files_analyzed++

        // Обновляем статистику
        for (const suggestion of filteredSuggestions) {
          // По типу
          if (!result.stats!.by_type[suggestion.type]) {
            result.stats!.by_type[suggestion.type] = 0
          }
          result.stats!.by_type[suggestion.type]++

          // По приоритету
          const priorityBucket = `${Math.floor(suggestion.priority / 3) * 3 + 1}-${Math.min(Math.floor(suggestion.priority / 3) * 3 + 3, 10)}`
          if (!result.stats!.by_priority[priorityBucket]) {
            result.stats!.by_priority[priorityBucket] = 0
          }
          result.stats!.by_priority[priorityBucket]++

          // По сложности
          if (!result.stats!.by_complexity[suggestion.estimate_complexity]) {
            result.stats!.by_complexity[suggestion.estimate_complexity] = 0
          }
          result.stats!.by_complexity[suggestion.estimate_complexity]++
        }

        // Если достигли лимита предложений, останавливаем анализ
        if (result.suggestions.length >= maxSuggestions) {
          console.log(
            `Reached maximum number of suggestions (${maxSuggestions}). Stopping analysis.`
          )
          break
        }
      } catch (fileError) {
        const errorMessage = `Error analyzing file ${file}: ${fileError instanceof Error ? fileError.message : String(fileError)}`
        console.error(errorMessage)
        result.errors.push(errorMessage)
      }
    }

    // Сортируем предложения по приоритету (по убыванию)
    result.suggestions.sort((a, b) => b.priority - a.priority)

    // Вычисляем длительность анализа
    result.analysis_duration_ms = Date.now() - startTime

    return result
  } catch (error) {
    const errorMessage = `Error analyzing codebase: ${error instanceof Error ? error.message : String(error)}`
    console.error(errorMessage)
    result.errors.push(errorMessage)

    // Вычисляем длительность анализа даже при ошибке
    result.analysis_duration_ms = Date.now() - startTime

    return result
  }
}

/**
 * Поиск исходных файлов в директории рекурсивно
 * @param directory Директория для поиска
 * @param extensions Расширения файлов для включения
 * @param ignorePaths Пути для исключения
 * @returns Массив путей к файлам
 */
async function findSourceFiles(
  directory: string,
  extensions: string[],
  ignorePaths: string[]
): Promise<string[]> {
  const files: string[] = []

  async function scan(dir: string) {
    try {
      const entries = await fs.promises.readdir(dir, { withFileTypes: true })

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name)

        // Проверяем, нужно ли игнорировать путь
        const shouldIgnore = ignorePaths.some(
          ignorePath =>
            fullPath.includes(path.sep + ignorePath) ||
            fullPath.endsWith(path.sep + ignorePath)
        )

        if (shouldIgnore) {
          continue
        }

        if (entry.isDirectory()) {
          await scan(fullPath)
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name).toLowerCase()
          if (extensions.includes(ext)) {
            files.push(fullPath)
          }
        }
      }
    } catch (error) {
      console.error(`Error scanning directory ${dir}:`, error)
    }
  }

  await scan(directory)
  return files
}

/**
 * Генерация уникального ID для предложения по улучшению
 * @returns Уникальный идентификатор
 */
function generateImprovementId(): string {
  return (
    'imp-' +
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 7)
  )
}

/**
 * Определение языка программирования по расширению файла
 * @param extension Расширение файла
 * @returns Название языка программирования
 */
function getLanguageByExtension(extension: string): string {
  const extensionMap: Record<string, string> = {
    '.ts': 'TypeScript',
    '.js': 'JavaScript',
    '.tsx': 'TypeScript React',
    '.jsx': 'JavaScript React',
    '.py': 'Python',
    '.java': 'Java',
    '.c': 'C',
    '.cpp': 'C++',
    '.cs': 'C#',
    '.go': 'Go',
    '.rs': 'Rust',
    '.php': 'PHP',
    '.rb': 'Ruby',
    '.swift': 'Swift',
    '.kt': 'Kotlin',
    '.sh': 'Shell',
    '.html': 'HTML',
    '.css': 'CSS',
    '.scss': 'SCSS',
    '.json': 'JSON',
    '.md': 'Markdown',
    '.sql': 'SQL',
  }

  return extensionMap[extension.toLowerCase()] || 'Unknown'
}

/**
 * Сохранение результатов анализа улучшений в файл
 * @param suggestions Предложения по улучшению
 * @param outputPath Путь к файлу для сохранения
 */
export async function saveImprovementSuggestions(
  suggestions: ImprovementSuggestion[],
  outputPath: string = 'improvements.json'
): Promise<void> {
  try {
    const outputDir = path.dirname(outputPath)

    // Создаем директорию, если она не существует
    if (!fs.existsSync(outputDir)) {
      await fs.promises.mkdir(outputDir, { recursive: true })
    }

    // Сохраняем в JSON формате
    await fs.promises.writeFile(
      outputPath,
      JSON.stringify(suggestions, null, 2),
      'utf-8'
    )

    console.log(
      `Saved ${suggestions.length} improvement suggestions to ${outputPath}`
    )
  } catch (error) {
    console.error('Error saving improvement suggestions:', error)
    throw error
  }
}

/**
 * Загрузка предложений по улучшению из файла
 * @param inputPath Путь к файлу с сохраненными предложениями
 * @returns Массив предложений по улучшению
 */
export async function loadImprovementSuggestions(
  inputPath: string = 'improvements.json'
): Promise<ImprovementSuggestion[]> {
  try {
    if (!fs.existsSync(inputPath)) {
      return []
    }

    const content = await fs.promises.readFile(inputPath, 'utf-8')
    const suggestions = JSON.parse(content) as ImprovementSuggestion[]

    // Преобразуем строки дат в объекты Date
    for (const suggestion of suggestions) {
      suggestion.detected_at = new Date(suggestion.detected_at)
    }

    return suggestions
  } catch (error) {
    console.error('Error loading improvement suggestions:', error)
    return []
  }
}

/**
 * Создание отчета в формате Markdown с предложениями по улучшению
 * @param suggestions Предложения по улучшению
 * @param ratings Рейтинги улучшений
 * @returns Отчет в формате строки
 */
export async function generateImprovementReport(
  suggestions: ImprovementSuggestion[],
  ratings?: { improvementId: string; score: number }[]
): Promise<string> {
  try {
    // Создаем содержимое отчета
    let report = `# Предложения по улучшению кодовой базы\n\n`
    report += `*Дата генерации: ${new Date().toISOString().split('T')[0]}*\n\n`
    report += `## Сводка\n\n`
    report += `Всего предложений: ${suggestions.length}\n\n`

    // Группируем предложения по типу
    const groupedByType: Record<string, ImprovementSuggestion[]> = {}

    for (const suggestion of suggestions) {
      if (!groupedByType[suggestion.type]) {
        groupedByType[suggestion.type] = []
      }

      groupedByType[suggestion.type].push(suggestion)
    }

    // Добавляем статистику по типам
    report += `### По типам\n\n`

    for (const type in groupedByType) {
      report += `- **${type}**: ${groupedByType[type].length} предложений\n`
    }

    report += `\n### По приоритету\n\n`

    // Группируем по приоритету
    const highPriority = suggestions.filter(s => s.priority >= 8).length
    const mediumPriority = suggestions.filter(
      s => s.priority >= 4 && s.priority < 8
    ).length
    const lowPriority = suggestions.filter(s => s.priority < 4).length

    report += `- **Высокий приоритет (8-10)**: ${highPriority} предложений\n`
    report += `- **Средний приоритет (4-7)**: ${mediumPriority} предложений\n`
    report += `- **Низкий приоритет (1-3)**: ${lowPriority} предложений\n\n`

    // Добавляем детали по каждому предложению, отсортированные по приоритету
    report += `## Детальные предложения\n\n`

    // Сортируем предложения по приоритету
    const sortedSuggestions = [...suggestions].sort(
      (a, b) => b.priority - a.priority
    )

    for (const suggestion of sortedSuggestions) {
      const rating = ratings?.find(r => r.improvementId === suggestion.id)
      const ratingText = rating ? ` ⭐ ${rating.score}/5` : ''

      report += `### ${suggestion.title}${ratingText}\n\n`
      report += `- **ID**: \`${suggestion.id}\`\n`
      report += `- **Тип**: ${suggestion.type}\n`
      report += `- **Приоритет**: ${suggestion.priority}/10\n`
      report += `- **Сложность**: ${suggestion.estimate_complexity}\n`
      report += `- **Обнаружено**: ${suggestion.detected_at.toISOString().split('T')[0]}\n\n`

      report += `**Описание**:\n${suggestion.description}\n\n`

      report += `**Затронутые файлы**:\n`
      for (const file of suggestion.affected_files) {
        report += `- \`${file}\`\n`
      }

      report += `\n**Рекомендуемое действие**:\n${suggestion.suggested_action}\n\n`

      // Разделитель между предложениями
      report += `---\n\n`
    }

    // Добавляем заключение
    report += `## Заключение\n\n`
    report += `Рекомендуется начать с исправления проблем с высоким приоритетом, `
    report += `поскольку они представляют наиболее важные улучшения для кодовой базы.`

    console.log(`Generated improvement report summary`)
    return report
  } catch (error) {
    console.error('Error generating improvement report:', error)
    throw error
  }
}

/**
 * Анализирует несколько репозиториев одновременно
 * @param mcpService Сервис MCP
 * @param repositories Список репозиториев для анализа
 * @param options Опции анализа
 */
export async function analyzeMultipleRepositories(
  mcpService: Service,
  repositories: { path: string; name: string }[],
  options: {
    ignore?: string[]
    extensions?: string[]
    limit?: number
    aspectTypes?: ('code_quality' | 'performance' | 'security')[]
  } = {}
): Promise<CodebaseAnalysisResult> {
  const startTime = Date.now()

  const combinedResult: CodebaseAnalysisResult = {
    suggestions: [],
    total_files_analyzed: 0,
    errors: [],
    analysis_date: new Date(),
    analyzed_repositories: [],
    stats: {
      by_type: {},
      by_priority: {},
      by_complexity: {},
    },
  }

  // Анализируем каждый репозиторий
  for (const repo of repositories) {
    console.log(`Analyzing repository: ${repo.name} at ${repo.path}`)

    try {
      const repoResult = await analyzeCodebase(mcpService, repo.path, {
        ...options,
        repository: repo.name,
      })

      // Объединяем результаты
      combinedResult.suggestions.push(...repoResult.suggestions)
      combinedResult.total_files_analyzed += repoResult.total_files_analyzed
      combinedResult.errors.push(...repoResult.errors)
      combinedResult.analyzed_repositories!.push(repo.name)

      // Объединяем статистику
      if (repoResult.stats) {
        // По типу
        for (const type in repoResult.stats.by_type) {
          if (!combinedResult.stats!.by_type[type]) {
            combinedResult.stats!.by_type[type] = 0
          }
          combinedResult.stats!.by_type[type] += repoResult.stats.by_type[type]
        }

        // По приоритету
        for (const priority in repoResult.stats.by_priority) {
          if (!combinedResult.stats!.by_priority[priority]) {
            combinedResult.stats!.by_priority[priority] = 0
          }
          combinedResult.stats!.by_priority[priority] +=
            repoResult.stats.by_priority[priority]
        }

        // По сложности
        for (const complexity in repoResult.stats.by_complexity) {
          if (!combinedResult.stats!.by_complexity[complexity]) {
            combinedResult.stats!.by_complexity[complexity] = 0
          }
          combinedResult.stats!.by_complexity[complexity] +=
            repoResult.stats.by_complexity[complexity]
        }
      }
    } catch (error) {
      const errorMessage = `Error analyzing repository ${repo.name}: ${error instanceof Error ? error.message : String(error)}`
      console.error(errorMessage)
      combinedResult.errors.push(errorMessage)
    }
  }

  // Сортируем предложения по приоритету (по убыванию)
  combinedResult.suggestions.sort((a, b) => b.priority - a.priority)

  // Ограничиваем количество предложений, если указан лимит
  if (options.limit && combinedResult.suggestions.length > options.limit) {
    combinedResult.suggestions = combinedResult.suggestions.slice(
      0,
      options.limit
    )
  }

  // Вычисляем длительность анализа
  combinedResult.analysis_duration_ms = Date.now() - startTime

  return combinedResult
}
