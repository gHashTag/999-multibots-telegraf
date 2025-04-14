/**
 * Система самосовершенствования автономного агента
 * Определяет модели, типы и утилиты для самосовершенствования
 */

import fs from 'fs'
import path from 'path'
import { Service } from '../types'

// Типы для системы самосовершенствования
export enum ImprovementType {
  CODE_QUALITY = 'CODE_QUALITY',
  NEW_FEATURE = 'NEW_FEATURE',
  BUG_FIX = 'BUG_FIX',
  PERFORMANCE = 'PERFORMANCE',
  DOCUMENTATION = 'DOCUMENTATION',
  TESTING = 'TESTING',
  SECURITY = 'SECURITY',
  OTHER = 'OTHER',
  UNKNOWN = 'UNKNOWN', // Added for initialization
}

// Результат выполнения самосовершенствования (Обновлено)
export interface ImprovementResult {
  success: boolean
  message: string
  improvementType?: string // Keep as string for flexibility
  affectedComponents?: string[]
  createdFiles: string[]
  updatedFiles: string[]
  error?: string
  score?: number // Optional score from evaluation
  recommendations?: string[] // Optional recommendations from evaluation
  timestamp?: Date

  // Added fields based on parsing logic in code-generator.ts
  analysis: string
  proposedImprovements: Array<{
    explanation: string
    codeChanges: Array<{
      filePath: string
      refactoredContent: string
    }>
    benefits: string
  }>
  changesApplied: boolean // Track if changes were (attempted) to be applied
}

// Оценка качества самосовершенствования
export interface ImprovementEvaluation {
  score: number // От 0 до 10
  feedback: string[]
  recommendations: string[]
}

/**
 * Анализирует запрос на самосовершенствование через MCP
 * @param mcpService Сервис MCP
 * @param description Описание запроса
 * @returns Результат анализа
 */
export async function analyzeImprovementRequest(
  mcpService: Service,
  description: string
): Promise<{
  improvementType: string
  affectedComponents: string[]
  requiredFiles: string[]
}> {
  const analysisPrompt = `
You are an autonomous agent analyzing a self-improvement request. You need to determine:
1. What specific improvement is being requested
2. Which files and components need to be modified
3. What new capabilities need to be implemented
4. How to structure the implementation

Request: "${description}"

Please analyze this request and provide a structured plan with these sections:
- IMPROVEMENT_TYPE: [CODE_QUALITY, NEW_FEATURE, BUG_FIX, PERFORMANCE, DOCUMENTATION]
- AFFECTED_COMPONENTS: [List of components/systems that need modification]
- REQUIRED_FILES: [Files that need to be created or modified]
- IMPLEMENTATION_PLAN: [Step-by-step plan for implementing the improvement]
  `

  try {
    // @ts-ignore
    const analysisResult = await mcpService.processTask(analysisPrompt)
    console.log('Analysis result:', analysisResult)

    // Парсим структурированный результат анализа
    const typeMatch = /IMPROVEMENT_TYPE:\s*\[([^\]]+)\]/.exec(analysisResult)
    const componentsMatch = /AFFECTED_COMPONENTS:\s*\[([^\]]+)\]/.exec(
      analysisResult
    )
    const filesMatch = /REQUIRED_FILES:\s*\[([^\]]+)\]/.exec(analysisResult)

    return {
      improvementType: typeMatch ? typeMatch[1] : ImprovementType.OTHER,
      affectedComponents: componentsMatch
        ? componentsMatch[1].split(',').map(c => c.trim())
        : [],
      requiredFiles: filesMatch
        ? filesMatch[1].split(',').map(f => f.trim())
        : [],
    }
  } catch (error) {
    console.error('Error analyzing improvement request:', error)
    return {
      improvementType: ImprovementType.OTHER,
      affectedComponents: [],
      requiredFiles: [],
    }
  }
}

/**
 * Оценивает результаты самосовершенствования
 * @param mcpService Сервис MCP
 * @param description Описание запроса
 * @param result Результат выполнения
 * @returns Оценка качества самосовершенствования
 */
export async function evaluateImprovement(
  mcpService: Service,
  description: string,
  result: ImprovementResult
): Promise<ImprovementEvaluation> {
  const evaluationPrompt = `
You are an autonomous agent evaluating the results of a self-improvement task.

Original improvement request:
"${description}"

Implementation results:
- Success: ${result.success}
- Message: ${result.message}
- Analysis: ${result.analysis ?? 'N/A'}
- Changes Applied: ${result.changesApplied}
- Improvement type: ${result.improvementType || 'N/A'}
- Created files: ${result.createdFiles?.join(', ') || 'None'}
- Updated files: ${result.updatedFiles?.join(', ') || 'None'}
${result.error ? `- Error: ${result.error}` : ''}

Please evaluate the quality of this improvement on a scale from 0 to 10, where:
- 0: Complete failure, no meaningful improvement
- 5: Partial implementation with some issues
- 10: Perfect implementation that fully satisfies the request

Also provide feedback on what could be improved and any recommendations for future enhancements.

Your response should be in this format:
SCORE: [numeric score]
FEEDBACK:
- [feedback point 1]
- [feedback point 2]
...
RECOMMENDATIONS:
- [recommendation 1]
- [recommendation 2]
...
  `

  try {
    // @ts-ignore
    const evaluationResult = await mcpService.processTask(evaluationPrompt)

    // Парсим результат оценки
    const scoreMatch = /SCORE:\s*([0-9.]+)/.exec(evaluationResult)

    // Получаем секции обратной связи и рекомендаций
    const feedbackMatch = evaluationResult.match(
      /FEEDBACK:\s*([\s\S]*?)(?=RECOMMENDATIONS:)/
    )
    const recommendationsMatch = evaluationResult.match(
      /RECOMMENDATIONS:\s*([\s\S]*?)$/
    )

    // Парсим пункты обратной связи
    const feedback: string[] = []
    if (feedbackMatch && feedbackMatch[1]) {
      const feedbackText = feedbackMatch[1].trim()
      feedback.push(
        ...feedbackText
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.startsWith('-'))
          .map((line: string) => line.substring(1).trim())
      )
    }

    // Парсим рекомендации
    const recommendations: string[] = []
    if (recommendationsMatch && recommendationsMatch[1]) {
      const recommendationsText = recommendationsMatch[1].trim()
      recommendations.push(
        ...recommendationsText
          .split('\n')
          .map((line: string) => line.trim())
          .filter((line: string) => line.startsWith('-'))
          .map((line: string) => line.substring(1).trim())
      )
    }

    return {
      score: scoreMatch ? parseFloat(scoreMatch[1]) : 0,
      feedback,
      recommendations,
    }
  } catch (error) {
    console.error('Error evaluating improvement:', error)
    return {
      score: 0,
      feedback: ['Error during evaluation'],
      recommendations: ['Try with a different approach'],
    }
  }
}

/**
 * Логирует результаты самосовершенствования в CG Log
 * @param description Описание запроса
 * @param result Результат выполнения
 */
export async function logSelfImprovement(
  description: string,
  result: ImprovementResult
): Promise<void> {
  try {
    // Получаем путь к директории CG Log используя __dirname
    const cgLogDir = path.join(__dirname, '../../../cg-log')

    // Проверяем, существует ли README.md
    const readmePath = path.join(cgLogDir, 'README.md')

    if (!fs.existsSync(cgLogDir)) {
      fs.mkdirSync(cgLogDir, { recursive: true })
    }

    let content = ''
    const timestamp = result.timestamp?.toISOString().split('T')[0] ?? new Date().toISOString().split('T')[0]

    if (fs.existsSync(readmePath)) {
      content = fs.readFileSync(readmePath, 'utf-8')
    } else {
      content =
        '# Лог изменений агента-разработчика (CG Log)\n\n' +
        'Этот каталог содержит информацию о самосовершенствовании агента - ' +
        'историю изменений, внесенных в кодовую базу в рамках процесса самосовершенствования.\n\n' +
        '## История улучшений\n\n'
    }

    // Создаем запись для нового улучшения
    const entry = `### ${timestamp} - ${description}\n\n`

    // Добавляем детали о созданных и обновленных файлах
    let details = ''
    details += `**Статус:** ${result.success ? 'Успешно' : 'Ошибка'}${result.error ? ` (${result.error})` : ''}\n`
    details += `**Сообщение:** ${result.message}\n`
    details += `**Тип:** ${result.improvementType ?? 'N/A'}\n`
    details += `**Анализ:**\n\`\`\`\n${result.analysis ?? 'N/A'}\n\`\`\`\n`
    details += `**Изменения применены:** ${result.changesApplied}\n`

    if (result.proposedImprovements?.length > 0) {
      details += `**Предложенные улучшения:**\n`
      result.proposedImprovements.forEach((imp, index) => {
        details += `  ${index + 1}. **Объяснение:** ${imp.explanation}\n`
        if (imp.codeChanges?.length > 0) {
          details += `     **Изменения кода:**\n`
          imp.codeChanges.forEach(change => {
            details += `       - \`${change.filePath}\`\n`
          })
        }
        details += `     **Преимущества:** ${imp.benefits}\n`
      })
      details += `\n`
    }

    if (result.createdFiles?.length > 0) {
      details += `**Созданные файлы:**\n${result.createdFiles.map(f => `- ${f}`).join('\n')}\n`
    }
    if (result.updatedFiles?.length > 0) {
      details += `**Обновленные файлы:**\n${result.updatedFiles.map(f => `- ${f}`).join('\n')}\n`
    }
    if (result.recommendations && result.recommendations.length > 0) {
      details += `**Рекомендации:**\n${result.recommendations.map(r => `- ${r}`).join('\n')}\n`
    }
    if (result.score !== undefined) {
      details += `**Оценка:** ${result.score}/10\n`
    }

    // Добавляем запись в начало истории
    const headerIndex = content.indexOf('## История улучшений')
    if (headerIndex !== -1) {
      const headerEndIndex = content.indexOf('\n', headerIndex) + 1
      content =
        content.slice(0, headerEndIndex) +
        entry +
        details +
        '\n---\n\n' +
        content.slice(headerEndIndex)
    } else {
      // Если заголовка нет, просто добавляем в конец
      content += '## История улучшений\n\n' + entry + details + '\n---\n\n'
    }

    // Записываем обновленный файл
    fs.writeFileSync(readmePath, content, 'utf-8')

    console.log('Self-improvement result logged to CG Log.')
  } catch (error) {
    console.error('Error logging self-improvement:', error)
  }
}

/**
 * Утилиты для работы с файловой системой при самосовершенствовании
 */
export const fileUtils = {
  /**
   * Проверяет, существует ли файл
   * @param filePath Путь к файлу
   * @returns true, если файл существует
   */
  async fileExists(filePath: string): Promise<boolean> {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath)

      await fs.promises.access(absolutePath, fs.constants.F_OK)
      return true
    } catch (error) {
      return false
    }
  },

  /**
   * Создает все директории в пути, если они не существуют
   * @param dirPath Путь к директории
   */
  async ensureDirectoryExists(dirPath: string): Promise<void> {
    try {
      const absolutePath = path.isAbsolute(dirPath)
        ? dirPath
        : path.join(process.cwd(), dirPath)

      await fs.promises.mkdir(absolutePath, { recursive: true })
    } catch (error) {
      console.error(`Error creating directory ${dirPath}:`, error)
      throw error
    }
  },

  /**
   * Читает содержимое файла
   * @param filePath Путь к файлу
   * @returns Содержимое файла
   */
  async readFile(filePath: string): Promise<string> {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath)

      return await fs.promises.readFile(absolutePath, 'utf-8')
    } catch (error) {
      console.error(`Error reading file ${filePath}:`, error)
      throw error
    }
  },

  /**
   * Записывает содержимое в файл
   * @param filePath Путь к файлу
   * @param content Содержимое файла
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    try {
      const absolutePath = path.isAbsolute(filePath)
        ? filePath
        : path.join(process.cwd(), filePath)

      await fs.promises.writeFile(absolutePath, content, 'utf-8')
    } catch (error) {
      console.error(`Error writing file ${filePath}:`, error)
      throw error
    }
  },
}
