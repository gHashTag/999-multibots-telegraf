/**
 * Автономный агент-разработчик
 * Интегрирует все компоненты системы
 * Реализован в функциональном стиле без использования классов
 */

import {
  AgentState,
  Task,
  TaskType,
  TaskStatus,
  createAgentState,
  addTask as addTaskToState,
  updateTaskStatus as updateTaskStatusInState,
  getAllTasks as getAllTasksFromState,
} from './state.js'
import { TaskScheduler, TaskHandler, createTaskScheduler } from './scheduler.js'
import { createMcpService } from '../services/mcp.js'
import { Service } from '../types.js'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  analyzeImprovementRequest,
  evaluateImprovement,
  logSelfImprovement as logSelfImprovementToFile,
  fileUtils,
  ImprovementResult,
  ImprovementType,
} from './self-improvement.js'
import {
  analyzeCodebase,
  saveImprovementSuggestions,
  loadImprovementSuggestions,
  generateImprovementReport,
  ImprovementSuggestion,
  CodebaseAnalysisResult,
  analyzeMultipleRepositories,
} from './improvement-detector.js'
import { EventEmitter } from 'events'

// Интерфейс для конфигурации агента
export interface AgentConfig {
  id: string
  maxConcurrentTasks?: number
  mcpConfig?: {
    serverUrl: string
    apiKey: string
  }
}

// Тип для агента в функциональном стиле
export interface Agent {
  initialize: () => Promise<void>
  shutdown: () => Promise<void>
  addTask: (
    type: TaskType,
    description: string,
    options?: {
      priority?: number
      dependencies?: string[]
      metadata?: Record<string, any>
    }
  ) => Promise<Task>
  getAllTasks: () => Task[]
  startBackgroundImprovement: (
    description: string,
    userId: string
  ) => Promise<{ taskId: string }>
  getBackgroundImprovementStatus: (
    taskId: string
  ) => Promise<{ status: TaskStatus; result?: any }>
  scanForImprovements: (
    directory?: string,
    options?: {
      ignore?: string[]
      extensions?: string[]
      limit?: number
      saveResults?: boolean
    }
  ) => Promise<CodebaseAnalysisResult>
  scanMultipleRepositories: (
    repositories: { path: string; name: string }[],
    options?: {
      limit?: number
      aspectTypes?: ('code_quality' | 'performance' | 'security')[]
      ignore?: string[]
      extensions?: string[]
    }
  ) => Promise<CodebaseAnalysisResult>
  getImprovementSuggestions: (filter?: {
    type?: ImprovementType
    minPriority?: number
    maxPriority?: number
    implemented?: boolean
    repository?: string
  }) => Promise<ImprovementSuggestion[]>
  getImprovementDetails: (
    improvementId: string
  ) => Promise<ImprovementSuggestion | null>
  applyImprovement: (
    improvementId: string,
    options?: {
      feedbackRequired?: boolean
      notifyOnCompletion?: boolean
    }
  ) => Promise<string>
  rateImprovement: (
    improvementId: string,
    score: number,
    feedback?: string
  ) => Promise<void>
  generateImprovementReport: () => Promise<{
    summary: string
    fullReportPath?: string
  }>
  startPeriodicScanning: (intervalMinutes?: number) => void
  stopPeriodicScanning: () => void
  getLastScanResults: () => CodebaseAnalysisResult | null
  notifyAdmins: (message: string) => Promise<void>
  on: (event: string, listener: (...args: any[]) => void) => void
  emit: (event: string, ...args: any[]) => boolean
}

// Интерфейс внутреннего состояния агента
interface AgentInternalState {
  state: AgentState
  scheduler: TaskScheduler
  mcpService: Service
  initialized: boolean
  periodicScannerInterval: NodeJS.Timeout | null
  lastScanResults: CodebaseAnalysisResult | null
  eventEmitter: EventEmitter
}

/**
 * Создает внутреннее состояние агента
 */
function createAgentInternalState(config: AgentConfig): AgentInternalState {
  return {
    state: createAgentState(config.id),
    scheduler: createTaskScheduler(createAgentState(config.id), {
      maxConcurrentTasks: config.maxConcurrentTasks,
    }),
    mcpService: createMcpService(config.mcpConfig),
    initialized: false,
    periodicScannerInterval: null,
    lastScanResults: null,
    eventEmitter: new EventEmitter(),
  }
}

/**
 * Инициализация агента
 */
async function initializeAgent(agentState: AgentInternalState): Promise<void> {
  if (agentState.initialized) {
    return
  }

  console.log(`Initializing agent ${agentState.state.id}...`)

  // Инициализируем MCP сервис
  await agentState.mcpService.initialize()

  // Регистрируем обработчики задач
  registerTaskHandlers(agentState)

  // Запускаем планировщик
  await agentState.scheduler.start()

  // Запускаем периодическое сканирование, если включено
  if (process.env.ENABLE_PERIODIC_SCAN === 'true') {
    startPeriodicScanning(agentState)
  }

  agentState.initialized = true
  console.log(`Agent ${agentState.state.id} initialized successfully`)
}

/**
 * Остановка агента
 */
async function shutdownAgent(agentState: AgentInternalState): Promise<void> {
  if (!agentState.initialized) {
    return
  }

  console.log(`Shutting down agent ${agentState.state.id}...`)

  // Останавливаем планировщик
  await agentState.scheduler.stop()

  // Останавливаем периодическое сканирование
  stopPeriodicScanning(agentState)

  // Закрываем соединение с MCP
  await agentState.mcpService.close()

  agentState.initialized = false
  console.log(`Agent ${agentState.state.id} shut down successfully`)
}

/**
 * Добавление новой задачи
 */
async function addTask(
  agentState: AgentInternalState,
  type: TaskType,
  description: string,
  options: {
    priority?: number
    dependencies?: string[]
    metadata?: Record<string, any>
  } = {}
): Promise<Task> {
  if (!agentState.initialized) {
    throw new Error('Agent not initialized')
  }

  const task = addTaskToState(agentState.state, {
    type,
    description,
    priority: options.priority || 1,
    dependencies: options.dependencies || [],
    metadata: options.metadata || {},
  })

  console.log(`Added task ${task.id} of type ${type}: ${description}`)
  return task
}

/**
 * Регистрация обработчиков задач
 */
function registerTaskHandlers(agentState: AgentInternalState): void {
  // Регистрируем обработчик для анализа кода
  agentState.scheduler.registerHandler(
    createCodeAnalysisHandler(agentState.mcpService)
  )

  // Регистрируем обработчик для генерации кода
  agentState.scheduler.registerHandler(
    createCodeGenerationHandler(agentState.mcpService)
  )

  // Регистрируем обработчик для рефакторинга кода
  agentState.scheduler.registerHandler(
    createCodeRefactoringHandler(agentState.mcpService)
  )

  // Регистрируем обработчик для генерации тестов
  agentState.scheduler.registerHandler(
    createTestGenerationHandler(agentState.mcpService)
  )

  // Регистрируем обработчик для документации
  agentState.scheduler.registerHandler(
    createDocumentationHandler(agentState.mcpService)
  )

  // Регистрируем обработчик для управления зависимостями
  agentState.scheduler.registerHandler(
    createDependencyManagementHandler(agentState.mcpService)
  )

  // Регистрируем обработчик для операций с Git
  agentState.scheduler.registerHandler(
    createGitOperationsHandler(agentState.mcpService)
  )

  // Регистрируем обработчик для самосовершенствования
  agentState.scheduler.registerHandler(
    createSelfImprovementHandler(agentState.mcpService)
  )
}

/**
 * Создание обработчика для анализа кода
 */
function createCodeAnalysisHandler(mcpService: Service): TaskHandler {
  return {
    canHandle: (task: Task): boolean => {
      return task.type === TaskType.CODE_ANALYSIS
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`Analyzing code: ${task.description}`)

      const prompt = `
Analyze the following code: ${task.description}

Please provide:
1. Overview of the code structure
2. Potential issues or bugs
3. Performance concerns
4. Security vulnerabilities
5. Recommendations for improvement
      `

      const analysis = await processMcpRequest(mcpService, prompt)

      return {
        analysis,
        timestamp: new Date(),
      }
    },
  }
}

/**
 * Создание обработчика для генерации кода
 */
function createCodeGenerationHandler(mcpService: Service): TaskHandler {
  return {
    canHandle: (task: Task): boolean => {
      return task.type === TaskType.CODE_GENERATION
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`Generating code: ${task.description}`)

      const prompt = `
Generate code for the following request: ${task.description}

Please provide fully functional, production-ready code that follows best practices.
Include necessary imports, error handling, and comments.
      `

      const generatedCode = await processMcpRequest(mcpService, prompt)

      return {
        code: generatedCode,
        timestamp: new Date(),
      }
    },
  }
}

/**
 * Создание обработчика для рефакторинга кода
 */
function createCodeRefactoringHandler(mcpService: Service): TaskHandler {
  return {
    canHandle: (task: Task): boolean => {
      return task.type === TaskType.CODE_REFACTORING
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`Refactoring code: ${task.description}`)

      // Определяем, есть ли в описании и код, и инструкции по рефакторингу
      const isFullRefactoringTask =
        task.description.includes('```') ||
        task.metadata?.codeContent ||
        task.metadata?.filePath

      let prompt

      if (isFullRefactoringTask) {
        // Получаем код для рефакторинга
        let codeContent = ''

        if (task.metadata?.codeContent) {
          // Код передан в метаданных
          codeContent = task.metadata.codeContent
        } else if (task.metadata?.filePath) {
          // Код нужно прочитать из файла
          try {
            codeContent = await fileUtils.readFile(task.metadata.filePath)
          } catch (error) {
            throw new Error(
              `Failed to read file for refactoring: ${error instanceof Error ? error.message : String(error)}`
            )
          }
        } else {
          // Извлекаем код из описания задачи
          const codeBlocks = task.description.match(
            /```(?:\w+)?\n([\s\S]*?)```/g
          )
          if (codeBlocks && codeBlocks.length > 0) {
            codeContent = codeBlocks[0]
              .replace(/```(?:\w+)?\n/, '') // Удаляем начало блока кода
              .replace(/```$/, '') // Удаляем конец блока кода
          }
        }

        if (!codeContent) {
          throw new Error('No code content found for refactoring')
        }

        // Формируем инструкции по рефакторингу
        let refactoringInstructions = task.description

        // Удаляем блоки кода из инструкций
        refactoringInstructions = refactoringInstructions.replace(
          /```(?:\w+)?\n[\s\S]*?```/g,
          ''
        )

        prompt = `
Refactor the following code according to these instructions:

Instructions: ${refactoringInstructions}

Original code:
\`\`\`
${codeContent}
\`\`\`

Please provide the refactored code with all necessary improvements.
Return ONLY the refactored code without any explanations.
        `
      } else {
        // Общий промпт для рефакторинга
        prompt = `
Refactoring task: ${task.description}

Please provide detailed recommendations for code refactoring based on the above description.
Include specific patterns to look for, proposed changes, and reasoning.
        `
      }

      try {
        const refactoredCode = await processMcpRequest(mcpService, prompt)

        // Если был указан путь к файлу и флаг автоматического применения изменений
        if (task.metadata?.filePath && task.metadata?.autoApply) {
          try {
            await fileUtils.writeFile(task.metadata.filePath, refactoredCode)
            console.log(`Refactored code applied to ${task.metadata.filePath}`)
          } catch (error) {
            console.error(`Error writing refactored code to file: ${error}`)
          }
        }

        return {
          refactoredCode,
          originalFilePath: task.metadata?.filePath,
          appliedToFile: !!(
            task.metadata?.filePath && task.metadata?.autoApply
          ),
          timestamp: new Date(),
        }
      } catch (error) {
        console.error('Error in code refactoring handler:', error)
        throw error
      }
    },
  }
}

/**
 * Создание обработчика для генерации тестов
 */
function createTestGenerationHandler(mcpService: Service): TaskHandler {
  return {
    canHandle: (task: Task): boolean => {
      return task.type === TaskType.TEST_GENERATION
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`Generating tests: ${task.description}`)

      // Получаем код для тестирования
      let codeContent = ''
      let filePath = ''

      if (task.metadata?.codeContent) {
        // Код передан в метаданных
        codeContent = task.metadata.codeContent
      } else if (task.metadata?.filePath) {
        // Код нужно прочитать из файла
        filePath = task.metadata.filePath
        try {
          codeContent = await fileUtils.readFile(filePath)
        } catch (error) {
          throw new Error(
            `Failed to read file for testing: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      } else {
        // Извлекаем код из описания задачи
        const codeBlocks = task.description.match(/```(?:\w+)?\n([\s\S]*?)```/g)
        if (codeBlocks && codeBlocks.length > 0) {
          codeContent = codeBlocks[0]
            .replace(/```(?:\w+)?\n/, '') // Удаляем начало блока кода
            .replace(/```$/, '') // Удаляем конец блока кода
        }
      }

      // Формируем промпт для генерации тестов
      const prompt = `
Generate tests for the following code:

${codeContent || task.description}

Please provide comprehensive test cases that cover:
1. Happy path scenarios
2. Edge cases
3. Error handling
4. Integration points

Use an appropriate testing framework based on the code's language and context.
Include setup, teardown, and all necessary imports.
      `

      try {
        const testCode = await processMcpRequest(mcpService, prompt)

        // Если нужно автоматически создать файл с тестами
        if (task.metadata?.autoCreate && filePath) {
          // Формируем имя файла для тестов
          const fileExt = path.extname(filePath)
          const fileName = path.basename(filePath, fileExt)
          const dirName = path.dirname(filePath)

          // Определяем имя файла для тестов в зависимости от расширения
          let testFileName
          if (fileExt === '.ts' || fileExt === '.js') {
            testFileName = `${fileName}.test${fileExt}`
          } else {
            testFileName = `${fileName}_test${fileExt}`
          }

          const testFilePath = path.join(dirName, testFileName)

          try {
            await fileUtils.writeFile(testFilePath, testCode)
            console.log(`Test file created: ${testFilePath}`)

            return {
              testCode,
              testFilePath,
              originalFilePath: filePath,
              timestamp: new Date(),
            }
          } catch (error) {
            console.error(`Error creating test file: ${error}`)
          }
        }

        return {
          testCode,
          timestamp: new Date(),
        }
      } catch (error) {
        console.error('Error in test generation handler:', error)
        throw error
      }
    },
  }
}

/**
 * Создание обработчика для создания документации
 */
function createDocumentationHandler(mcpService: Service): TaskHandler {
  return {
    canHandle: (task: Task): boolean => {
      return task.type === TaskType.DOCUMENTATION
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`Generating documentation: ${task.description}`)

      // Получаем код для документирования
      let codeContent = ''
      let filePath = ''

      if (task.metadata?.codeContent) {
        // Код передан в метаданных
        codeContent = task.metadata.codeContent
      } else if (task.metadata?.filePath) {
        // Код нужно прочитать из файла
        filePath = task.metadata.filePath
        try {
          codeContent = await fileUtils.readFile(filePath)
        } catch (error) {
          throw new Error(
            `Failed to read file for documentation: ${error instanceof Error ? error.message : String(error)}`
          )
        }
      }

      // Формируем промпт для генерации документации
      const prompt = `
Generate documentation for the following:

${codeContent || task.description}

Please provide:
1. Overview of functionality
2. API documentation (parameters, return values, exceptions)
3. Usage examples
4. Dependencies and requirements
5. Appropriate JSDoc/TSDoc/etc. comments

Format the documentation in Markdown.
      `

      try {
        const documentation = await processMcpRequest(mcpService, prompt)

        // Если нужно автоматически создать файл с документацией
        if (task.metadata?.autoCreate && filePath) {
          // Формируем имя файла для документации
          const fileExt = path.extname(filePath)
          const fileName = path.basename(filePath, fileExt)
          const dirName = path.dirname(filePath)

          const docFileName = `${fileName}.md`
          const docFilePath = path.join(dirName, docFileName)

          try {
            await fileUtils.writeFile(docFilePath, documentation)
            console.log(`Documentation file created: ${docFilePath}`)

            return {
              documentation,
              documentationFilePath: docFilePath,
              originalFilePath: filePath,
              timestamp: new Date(),
            }
          } catch (error) {
            console.error(`Error creating documentation file: ${error}`)
          }
        }

        return {
          documentation,
          timestamp: new Date(),
        }
      } catch (error) {
        console.error('Error in documentation handler:', error)
        throw error
      }
    },
  }
}

/**
 * Создание обработчика для управления зависимостями
 */
function createDependencyManagementHandler(mcpService: Service): TaskHandler {
  return {
    canHandle: (task: Task): boolean => {
      return task.type === TaskType.DEPENDENCY_MANAGEMENT
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`Managing dependencies: ${task.description}`)

      // Формируем промпт для управления зависимостями
      const prompt = `
Dependency management task: ${task.description}

Please provide:
1. List of packages to add/remove/update
2. Package versions (if specific versions are needed)
3. Appropriate package manager commands (npm, yarn, pnpm, etc.)
4. Any configuration changes needed
      `

      try {
        const result = await processMcpRequest(mcpService, prompt)

        return {
          recommendations: result,
          timestamp: new Date(),
        }
      } catch (error) {
        console.error('Error in dependency management handler:', error)
        throw error
      }
    },
  }
}

/**
 * Создание обработчика для операций с Git
 */
function createGitOperationsHandler(mcpService: Service): TaskHandler {
  return {
    canHandle: (task: Task): boolean => {
      return task.type === TaskType.GIT_OPERATIONS
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`Git operations: ${task.description}`)

      // Формируем промпт для операций с Git
      const prompt = `
Git operation task: ${task.description}

Please provide:
1. Appropriate Git commands to perform the requested operation
2. Step-by-step instructions
3. Potential issues and how to resolve them
      `

      try {
        const result = await processMcpRequest(mcpService, prompt)

        return {
          gitInstructions: result,
          timestamp: new Date(),
        }
      } catch (error) {
        console.error('Error in Git operations handler:', error)
        throw error
      }
    },
  }
}

/**
 * Создание обработчика для самосовершенствования
 */
function createSelfImprovementHandler(mcpService: Service): TaskHandler {
  return {
    canHandle: (task: Task): boolean => {
      return (
        task.type === TaskType.SELF_IMPROVEMENT ||
        task.type === TaskType.BACKGROUND_IMPROVEMENT
      )
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`Self-improvement: ${task.description}`)

      // Проверяем, связана ли задача с конкретным улучшением
      if (task.metadata?.improvementId) {
        const improvementId = task.metadata.improvementId
        console.log(`Processing improvement with ID: ${improvementId}`)

        // Тут должна быть обработка конкретного улучшения
        // В функциональном стиле мы бы вызывали функцию, но тут мы в контексте обработчика
        return {
          message: `Self-improvement task processed for improvement ID: ${improvementId}`,
          timestamp: new Date(),
        }
      }

      // Стандартная обработка запроса на самосовершенствование
      const prompt = `
Self-improvement task: ${task.description}

You are an autonomous agent with the ability to improve your own codebase.
Please analyze this improvement request and provide:
1. Files that need to be created or modified
2. Detailed implementation steps
3. How this improvement enhances your capabilities
      `

      try {
        const result = await processMcpRequest(mcpService, prompt)

        return {
          improvementPlan: result,
          timestamp: new Date(),
        }
      } catch (error) {
        console.error('Error in self-improvement handler:', error)
        throw error
      }
    },
  }
}

/**
 * Создание функционального агента
 */
export function createAgent(config: AgentConfig): Agent {
  // Создаем внутреннее состояние
  const agentState = createAgentInternalState(config)

  // Возвращаем функциональный API агента
  return {
    initialize: () => initializeAgent(agentState),
    shutdown: () => shutdownAgent(agentState),
    addTask: (type, description, options) =>
      addTask(agentState, type, description, options),
    getAllTasks: () => getAllTasks(agentState),
    startBackgroundImprovement: (description, userId) =>
      startBackgroundImprovement(agentState, description, userId),
    getBackgroundImprovementStatus: taskId =>
      getBackgroundImprovementStatus(agentState, taskId),
    scanForImprovements: (directory, options) =>
      scanForImprovements(agentState, directory, options),
    scanMultipleRepositories: (repositories, options) =>
      scanMultipleRepositories(agentState, repositories, options),
    getImprovementSuggestions: filter =>
      getImprovementSuggestions(agentState, filter),
    getImprovementDetails: improvementId =>
      getImprovementDetails(agentState, improvementId),
    applyImprovement: (improvementId, options) =>
      applyImprovement(agentState, improvementId, options),
    rateImprovement: (improvementId, score, feedback) =>
      rateImprovement(agentState, improvementId, score, feedback),
    generateImprovementReport: () => generateImprovementReport(agentState),
    startPeriodicScanning: intervalMinutes =>
      startPeriodicScanning(agentState, intervalMinutes),
    stopPeriodicScanning: () => stopPeriodicScanning(agentState),
    getLastScanResults: () => getLastScanResults(agentState),
    notifyAdmins: message => notifyAdmins(agentState, message),
    on: (event, listener) => agentState.eventEmitter.on(event, listener),
    emit: (event, ...args) => agentState.eventEmitter.emit(event, ...args),
  }
}

/**
 * Функция для логирования результатов самосовершенствования
 */
async function logSelfImprovement(
  description: string,
  result: any
): Promise<void> {
  console.log(`Logging self-improvement: ${description}`)
  await logSelfImprovementToFile(description, result)
}

/**
 * Сканирование кодовой базы на наличие потенциальных улучшений
 */
async function scanForImprovements(
  agentState: AgentInternalState,
  directory: string = 'src',
  options: {
    ignore?: string[]
    extensions?: string[]
    limit?: number
    saveResults?: boolean
  } = {}
): Promise<CodebaseAnalysisResult> {
  if (!agentState.initialized) {
    throw new Error('Agent not initialized')
  }

  console.log(`Scanning codebase for improvements in ${directory}...`)

  // Параметры по умолчанию
  const defaultOptions = {
    ignore: ['node_modules', 'dist', 'build'],
    extensions: ['.ts', '.js', '.tsx', '.jsx', '.json'],
    limit: 20,
    saveResults: true,
  }

  // Объединяем параметры по умолчанию с переданными параметрами
  const mergedOptions = { ...defaultOptions, ...options }

  // Анализируем кодовую базу
  const result = await analyzeCodebase(
    agentState.mcpService,
    directory,
    mergedOptions
  )

  // Сохраняем результаты анализа
  if (mergedOptions.saveResults) {
    await saveImprovementSuggestions(result.suggestions)
  }

  // Сохраняем результаты последнего сканирования
  agentState.lastScanResults = result

  console.log(
    `Scan completed. Found ${result.suggestions.length} improvement suggestions.`
  )

  return result
}

/**
 * Сканирование нескольких репозиториев
 */
async function scanMultipleRepositories(
  agentState: AgentInternalState,
  repositories: { path: string; name: string }[],
  options: {
    limit?: number
    aspectTypes?: ('code_quality' | 'performance' | 'security')[]
    ignore?: string[]
    extensions?: string[]
  } = {}
): Promise<CodebaseAnalysisResult> {
  if (!agentState.initialized) {
    throw new Error('Agent not initialized')
  }

  console.log(
    `Scanning multiple repositories: ${repositories.map(r => r.name).join(', ')}...`
  )

  const result = await analyzeMultipleRepositories(
    agentState.mcpService,
    repositories,
    options
  )

  // Сохраняем результаты анализа
  await saveImprovementSuggestions(result.suggestions)

  // Сохраняем результаты последнего сканирования
  agentState.lastScanResults = result

  console.log(
    `Multi-repo scan completed. Found ${result.suggestions.length} improvement suggestions.`
  )

  return result
}

/**
 * Получение предложений по улучшению кода
 */
async function getImprovementSuggestions(
  agentState: AgentInternalState,
  filter?: {
    type?: ImprovementType
    minPriority?: number
    maxPriority?: number
    implemented?: boolean
    repository?: string
  }
): Promise<ImprovementSuggestion[]> {
  // Загружаем все предложения
  const allSuggestions = await loadImprovementSuggestions()

  if (!filter) {
    return allSuggestions
  }

  // Фильтруем предложения
  return allSuggestions.filter(suggestion => {
    // Фильтр по типу
    if (filter.type && suggestion.type !== filter.type) {
      return false
    }

    // Фильтр по минимальному приоритету
    if (
      filter.minPriority !== undefined &&
      suggestion.priority < filter.minPriority
    ) {
      return false
    }

    // Фильтр по максимальному приоритету
    if (
      filter.maxPriority !== undefined &&
      suggestion.priority > filter.maxPriority
    ) {
      return false
    }

    // Фильтр по статусу реализации
    if (
      filter.implemented !== undefined &&
      suggestion.is_implemented !== filter.implemented
    ) {
      return false
    }

    // Фильтр по репозиторию
    if (filter.repository && suggestion.repository !== filter.repository) {
      return false
    }

    return true
  })
}

/**
 * Получение детальной информации о конкретном предложении по улучшению
 */
async function getImprovementDetails(
  agentState: AgentInternalState,
  improvementId: string
): Promise<ImprovementSuggestion | null> {
  const allSuggestions = await loadImprovementSuggestions()
  return allSuggestions.find(s => s.id === improvementId) || null
}

/**
 * Запуск периодического сканирования кодовой базы
 */
function startPeriodicScanning(
  agentState: AgentInternalState,
  intervalMinutes: number = 60
): void {
  // Останавливаем существующее сканирование, если оно запущено
  stopPeriodicScanning(agentState)

  console.log(
    `Starting periodic code scanning with interval of ${intervalMinutes} minutes`
  )

  // Запускаем периодическое сканирование
  const interval = intervalMinutes * 60 * 1000 // Конвертируем в миллисекунды
  agentState.periodicScannerInterval = setInterval(() => {
    runPeriodicScan(agentState)
  }, interval)

  // Запускаем первое сканирование сразу
  runPeriodicScan(agentState)
}

/**
 * Остановка периодического сканирования
 */
function stopPeriodicScanning(agentState: AgentInternalState): void {
  if (agentState.periodicScannerInterval) {
    clearInterval(agentState.periodicScannerInterval)
    agentState.periodicScannerInterval = null
    console.log('🛑 Periodic code scanning stopped')
  }
}

/**
 * Выполнение периодического сканирования
 */
async function runPeriodicScan(agentState: AgentInternalState): Promise<void> {
  try {
    console.log('📊 Running periodic code scan...')

    // Получаем текущую директорию
    const scanDir = process.env.SCAN_DIRECTORY || 'src'

    // Выполняем сканирование
    const scanResult = await scanForImprovements(agentState, scanDir, {
      limit: Number(process.env.SCAN_LIMIT) || 10,
      saveResults: true,
    })

    console.log(
      `📊 Periodic scan completed. Found ${scanResult.suggestions.length} suggestions.`
    )

    // Если есть высокоприоритетные предложения, отправляем уведомление
    const highPriorityItems = scanResult.suggestions.filter(
      s => s.priority >= 8
    )

    if (highPriorityItems.length > 0) {
      // Формируем сообщение с высокоприоритетными предложениями
      let notificationMessage = `🚨 Found ${highPriorityItems.length} high-priority improvement suggestions:\n\n`

      highPriorityItems.forEach((item, index) => {
        notificationMessage +=
          `${index + 1}. [${item.id}] ${item.title}\n` +
          `   Priority: ${item.priority}/10\n` +
          `   Type: ${item.type}\n\n`
      })

      // Отправляем уведомление администраторам
      await notifyAdmins(agentState, notificationMessage)
    }
  } catch (error) {
    console.error('Error during periodic code scan:', error)
  }
}

/**
 * Получение результатов последнего сканирования
 */
function getLastScanResults(
  agentState: AgentInternalState
): CodebaseAnalysisResult | null {
  return agentState.lastScanResults
}

/**
 * Получение всех задач из состояния
 */
function getAllTasks(agentState: AgentInternalState): Task[] {
  return getAllTasksFromState(agentState.state)
}

/**
 * Запуск задачи самосовершенствования в фоновом режиме
 */
async function startBackgroundImprovement(
  agentState: AgentInternalState,
  description: string,
  userId: string
): Promise<{ taskId: string }> {
  console.log(`Starting background improvement: ${description}`)

  // Создаем задачу с типом BACKGROUND_IMPROVEMENT
  const task = await addTask(
    agentState,
    TaskType.BACKGROUND_IMPROVEMENT,
    description,
    {
      priority: 5, // Высокий приоритет для задач улучшения
      metadata: {
        userId,
        startedAt: new Date(),
        isBackground: true,
      },
    }
  )

  // Запускаем самосовершенствование асинхронно без блокировки основного потока
  setTimeout(async () => {
    try {
      // Логика выполнения самосовершенствования
      const result = await performSelfImprovement(agentState, description)

      // Обновление статуса задачи
      await updateTaskStatus(agentState.state, task.id, TaskStatus.COMPLETED, {
        success: true,
        message: `Self-improvement completed: ${description}`,
        createdFiles: result.createdFiles || [],
        updatedFiles: result.updatedFiles || [],
      })

      // Логируем результат в CG Log
      await logSelfImprovement(description, result)

      // Отправляем уведомление администраторам
      await notifyAdmins(
        agentState,
        `✅ Фоновое улучшение завершено: ${description}\n\nРезультаты:\n${JSON.stringify(result, null, 2)}`
      )
    } catch (error) {
      console.error('Error during background improvement:', error)

      await updateTaskStatus(agentState.state, task.id, TaskStatus.FAILED, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      })

      await notifyAdmins(
        agentState,
        `❌ Ошибка фонового улучшения: ${description}\n\nОшибка: ${error instanceof Error ? error.message : String(error)}`
      )
    }
  }, 0)

  return { taskId: task.id }
}

/**
 * Получение статуса фоновой задачи самосовершенствования
 */
async function getBackgroundImprovementStatus(
  agentState: AgentInternalState,
  taskId: string
): Promise<{
  status: TaskStatus
  result?: any
}> {
  const task = agentState.state.tasks.get(taskId)

  if (!task) {
    throw new Error(`Task with id ${taskId} not found`)
  }

  if (task.type !== TaskType.BACKGROUND_IMPROVEMENT) {
    throw new Error(
      `Task with id ${taskId} is not a background improvement task`
    )
  }

  return Promise.resolve({
    status: task.status,
    result: task.result,
  })
}

/**
 * Выполнение задачи самосовершенствования
 */
async function performSelfImprovement(
  agentState: AgentInternalState,
  description: string
): Promise<ImprovementResult> {
  console.log(`Performing self-improvement: ${description}`)

  // Анализируем запрос на улучшение
  const improvementRequest = await analyzeImprovementRequest(
    agentState.mcpService,
    description
  )

  if (!improvementRequest.isValid) {
    console.log(`Invalid improvement request: ${improvementRequest.reason}`)
    return {
      success: false,
      message: improvementRequest.reason || 'Invalid improvement request',
      createdFiles: [],
      updatedFiles: [],
    }
  }

  // Результаты выполнения
  const results: ImprovementResult = {
    success: true,
    message: `Self-improvement completed: ${description}`,
    createdFiles: [],
    updatedFiles: [],
  }

  // Если есть файлы для модификации, обрабатываем их
  if (improvementRequest.files && improvementRequest.files.length > 0) {
    for (const file of improvementRequest.files) {
      try {
        const fileExists = await fileUtils.exists(file)

        if (fileExists) {
          // Файл существует - модифицируем его
          const currentContent = await fileUtils.readFile(file)

          // Формируем промпт для обновления файла
          const updatePrompt = `
You are an autonomous agent tasked with improving an existing file:
${file}

Current content:
\`\`\`
${currentContent}
\`\`\`

Improvement request: "${description}"

Please provide the updated content for this file.
Return ONLY the complete updated file content without any explanations.
          `

          // @ts-ignore
          const updatedContent =
            await agentState.mcpService.processTask(updatePrompt)

          // Сохраняем изменения только если содержимое действительно изменилось
          if (updatedContent !== currentContent) {
            await fileUtils.writeFile(file, updatedContent)
            results.updatedFiles.push(file)
          }
        } else {
          // Файл не существует - создаем новый
          const createPrompt = `
You are an autonomous agent tasked with creating a new file:
${file}

Context: This file is part of a Node.js/TypeScript project for an autonomous agent with Telegram integration.
The agent can execute various tasks and has self-improvement capabilities.

Improvement request: "${description}"

Please provide the complete content for this new file.
Return ONLY the file content without any explanations.
          `

          // @ts-ignore
          const newFileContent =
            await agentState.mcpService.processTask(createPrompt)

          // Создаем директории, если они не существуют
          await fileUtils.ensureDirectoryExists(path.dirname(file))

          // Записываем новый файл
          await fileUtils.writeFile(file, newFileContent)
          results.createdFiles.push(file)
        }
      } catch (error) {
        console.error(`Error processing file ${file}:`, error)
      }
    }
  }

  // Оцениваем результаты улучшения
  const evaluation = await evaluateImprovement(
    agentState.mcpService,
    description,
    results
  )

  // Добавляем результаты оценки
  results.evaluation = evaluation

  return results
}

/**
 * Обновление статуса задачи
 */
async function updateTaskStatus(
  state: AgentState,
  taskId: string,
  status: TaskStatus,
  result?: any
): Promise<void> {
  updateTaskStatusInState(state, taskId, status, result)
}

/**
 * Отправка уведомлений администраторам
 */
async function notifyAdmins(
  agentState: AgentInternalState,
  message: string
): Promise<void> {
  if (
    !process.env.ADMIN_NOTIFICATION_ENABLED ||
    process.env.ADMIN_NOTIFICATION_ENABLED !== 'true'
  ) {
    console.log('Admin notifications are disabled')
    return
  }

  if (!process.env.ADMIN_USERS) {
    console.log('No admin users configured')
    return
  }

  try {
    // Эмитим событие для обработки внешними слушателями
    agentState.eventEmitter.emit('admin_notification', {
      message,
      adminUsers: process.env.ADMIN_USERS.split(','),
    })

    console.log(`Admin notification sent: ${message.substring(0, 50)}...`)
  } catch (error) {
    console.error('Error sending admin notification:', error)
  }
}

/**
 * Оценка улучшения для системы обучения
 */
async function rateImprovement(
  agentState: AgentInternalState,
  improvementId: string,
  score: number,
  feedback?: string
): Promise<void> {
  if (score < 1 || score > 5) {
    throw new Error('Score must be between 1 and 5')
  }

  // Получаем информацию об улучшении
  const improvement = await getImprovementDetails(agentState, improvementId)

  if (!improvement) {
    throw new Error(`Improvement with id ${improvementId} not found`)
  }

  console.log(`Rating improvement ${improvementId} with score ${score}`)

  // Сохраняем оценку улучшения
  if (!improvement.ratings) {
    improvement.ratings = []
  }

  improvement.ratings.push({
    score,
    feedback: feedback || '',
    timestamp: new Date(),
  })

  // Рассчитываем среднюю оценку
  const totalScore = improvement.ratings.reduce(
    (sum, rating) => sum + rating.score,
    0
  )
  improvement.average_rating = totalScore / improvement.ratings.length

  // Сохраняем обновленное улучшение
  await saveImprovementSuggestions([improvement])

  // Обновляем данные для обучения системы
  await updateImprovementLearningData(agentState, improvement, score, feedback)

  console.log(`Improvement ${improvementId} rated with score ${score}`)
}

/**
 * Обновление данных для обучения системы улучшений
 */
async function updateImprovementLearningData(
  agentState: AgentInternalState,
  improvement: ImprovementSuggestion,
  score: number,
  feedback?: string
): Promise<void> {
  try {
    // Путь к файлу данных для обучения
    const __dirname = path.dirname(fileURLToPath(import.meta.url))
    const learningDataPath = path.join(
      __dirname,
      '../../data/improvement-feedback.json'
    )

    // Создаем директорию data, если она не существует
    const dataDir = path.join(__dirname, '../../data')
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true })
    }

    // Загружаем существующие данные или создаем новый объект
    let learningData = {
      version: 1,
      feedback: [] as Array<{
        improvementId: string
        type: string
        priority: number
        score: number
        feedback?: string
        timestamp: string
      }>,
    }

    // Проверяем существование файла данных
    if (fs.existsSync(learningDataPath)) {
      const fileContent = fs.readFileSync(learningDataPath, 'utf-8')
      try {
        learningData = JSON.parse(fileContent)
      } catch (parseError) {
        console.error('Error parsing learning data:', parseError)
      }
    }

    // Добавляем новую запись обратной связи
    learningData.feedback.push({
      improvementId: improvement.id,
      type: improvement.type,
      priority: improvement.priority,
      score,
      feedback,
      timestamp: new Date().toISOString(),
    })

    // Сохраняем обновленные данные
    fs.writeFileSync(learningDataPath, JSON.stringify(learningData, null, 2))

    console.log(`Learning data updated for improvement ${improvement.id}`)
  } catch (error) {
    console.error('Error updating learning data:', error)
  }
}

/**
 * Генерация отчета по улучшениям
 */
async function generateImprovementReport(
  agentState: AgentInternalState
): Promise<{ summary: string; fullReportPath?: string }> {
  console.log('Generating improvement report...')

  // Загружаем все предложения по улучшению
  const suggestions = await getImprovementSuggestions(agentState)

  if (suggestions.length === 0) {
    return {
      summary: 'No improvement suggestions found.',
    }
  }

  // Загружаем данные о рейтингах
  const __dirname = path.dirname(fileURLToPath(import.meta.url))
  const learningDataPath = path.join(
    __dirname,
    '../../data/improvement-feedback.json'
  )
  let ratings: { improvementId: string; score: number }[] = []

  if (fs.existsSync(learningDataPath)) {
    try {
      const learningData = JSON.parse(
        fs.readFileSync(learningDataPath, 'utf-8')
      )
      ratings = learningData.feedback.map((item: any) => ({
        improvementId: item.improvementId,
        score: item.score,
      }))
    } catch (error) {
      console.error('Error loading rating data:', error)
    }
  }

  // Путь для сохранения полного отчета
  const reportsDir = path.join(__dirname, '../../reports')
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true })
  }

  const fullReportPath = path.join(
    reportsDir,
    `improvement-report-${Date.now()}.md`
  )

  // Генерируем сводку
  const summary = await generateImprovementReport(suggestions, ratings)

  // Генерируем и сохраняем полный отчет
  const fullReport = await generateFullImprovementReport(
    agentState,
    suggestions,
    ratings
  )
  fs.writeFileSync(fullReportPath, fullReport)

  return { summary, fullReportPath }
}

/**
 * Генерация полного отчета по улучшениям
 */
async function generateFullImprovementReport(
  agentState: AgentInternalState,
  suggestions: ImprovementSuggestion[],
  ratings: { improvementId: string; score: number }[]
): Promise<string> {
  // Начинаем отчет
  let report = `# Полный отчет по улучшениям\n\n`
  report += `Дата создания: ${new Date().toLocaleString()}\n\n`

  // Общая статистика
  report += `## Статистика\n\n`
  report += `* Всего предложений: ${suggestions.length}\n`
  report += `* Реализованных предложений: ${suggestions.filter(s => s.is_implemented).length}\n`
  report += `* Ожидающих реализации: ${suggestions.filter(s => !s.is_implemented).length}\n\n`

  // Распределение по типам
  report += `### Распределение по типам\n\n`
  const typeMap = new Map<string, number>()
  suggestions.forEach(s => {
    const count = typeMap.get(s.type) || 0
    typeMap.set(s.type, count + 1)
  })

  for (const [type, count] of typeMap.entries()) {
    report += `* ${type}: ${count}\n`
  }
  report += '\n'

  // Распределение по приоритетам
  report += `### Распределение по приоритетам\n\n`
  const priorityMap = new Map<number, number>()
  suggestions.forEach(s => {
    const count = priorityMap.get(s.priority) || 0
    priorityMap.set(s.priority, count + 1)
  })

  const sortedPriorities = Array.from(priorityMap.keys()).sort((a, b) => b - a)
  for (const priority of sortedPriorities) {
    report += `* Приоритет ${priority}: ${priorityMap.get(priority)}\n`
  }
  report += '\n'

  // Детали предложений
  report += `## Детали предложений\n\n`

  // Группируем предложения по типу
  const groupedByType = new Map<string, ImprovementSuggestion[]>()
  suggestions.forEach(s => {
    if (!groupedByType.has(s.type)) {
      groupedByType.set(s.type, [])
    }
    groupedByType.get(s.type)!.push(s)
  })

  // Для каждого типа выводим предложения, отсортированные по приоритету
  for (const [type, typeItems] of groupedByType.entries()) {
    report += `### ${type}\n\n`

    // Сортируем по приоритету
    typeItems.sort((a, b) => b.priority - a.priority)

    for (const item of typeItems) {
      const rating = ratings.find(r => r.improvementId === item.id)
      const ratingText = rating ? `⭐ ${rating.score}/5` : ''

      report += `#### ${item.title} ${ratingText}\n\n`
      report += `* ID: ${item.id}\n`
      report += `* Приоритет: ${item.priority}/10\n`
      report += `* Статус: ${item.is_implemented ? '✅ Реализовано' : '⏳ Ожидает реализации'}\n`
      if (item.affected_files.length > 0) {
        report += `* Затронутые файлы: ${item.affected_files.join(', ')}\n`
      }
      report += `\n${item.description}\n\n`

      if (item.suggested_action) {
        report += `**Рекомендуемое действие:**\n\n${item.suggested_action}\n\n`
      }

      report += `---\n\n`
    }
  }

  return report
}

/**
 * Применение предложенного улучшения
 */
async function applyImprovement(
  agentState: AgentInternalState,
  improvementId: string,
  options: {
    feedbackRequired?: boolean
    notifyOnCompletion?: boolean
  } = {}
): Promise<string> {
  if (!agentState.initialized) {
    throw new Error('Agent is not initialized')
  }

  // Получаем информацию об улучшении
  const improvement = await getImprovementDetails(agentState, improvementId)

  if (!improvement) {
    throw new Error(`Improvement with id ${improvementId} not found`)
  }

  console.log(`Applying improvement ${improvementId}: ${improvement.title}`)

  // Создаем задачу для применения улучшения
  const task = await addTask(
    agentState,
    TaskType.SELF_IMPROVEMENT,
    `Apply improvement: ${improvement.title}`,
    {
      priority: 5,
      metadata: {
        improvementId,
        options,
        startedAt: new Date(),
      },
    }
  )

  // Запускаем применение улучшения асинхронно
  setTimeout(async () => {
    try {
      // Выполняем самосовершенствование
      const result = await performSelfImprovement(
        agentState,
        improvement.suggested_action
      )

      // Обновляем статус улучшения
      const updatedImprovement = {
        ...improvement,
        is_implemented: true,
        implemented_at: new Date(),
      }
      await saveImprovementSuggestions([updatedImprovement])

      // Обновляем статус задачи
      await updateTaskStatus(agentState.state, task.id, TaskStatus.COMPLETED, {
        success: true,
        message: `Improvement applied: ${improvement.title}`,
        createdFiles: result.createdFiles,
        updatedFiles: result.updatedFiles,
        improvement: updatedImprovement,
      })

      // Логируем результат в CG Log
      await logSelfImprovement(improvement.suggested_action, result)

      // Отправляем уведомление, если требуется
      if (options.notifyOnCompletion) {
        const message =
          `✅ Improvement applied: ${improvement.title}\n\n` +
          `Files created: ${result.createdFiles.length}\n` +
          `Files updated: ${result.updatedFiles.length}\n\n` +
          `See details with command: /improvement_details ${improvementId}`

        await notifyAdmins(agentState, message)
      }
    } catch (error) {
      console.error(`Error applying improvement ${improvementId}:`, error)

      await updateTaskStatus(agentState.state, task.id, TaskStatus.FAILED, {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        improvementId,
      })

      if (options.notifyOnCompletion) {
        await notifyAdmins(
          agentState,
          `❌ Failed to apply improvement ${improvementId}: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    }
  }, 0)

  return task.id
}

/**
 * Общий метод для обработки запросов через MCP
 */
async function processMcpRequest(
  mcpService: Service,
  prompt: string
): Promise<string> {
  try {
    const result = await mcpService.processTask(prompt)
    return result.toString()
  } catch (error) {
    console.error('Error processing MCP request:', error)
    throw error
  }
}
