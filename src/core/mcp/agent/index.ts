/**
 * Автономный агент-разработчик
 * Интегрирует все компоненты системы
 * Реализован в функциональном стиле без использования классов
 */

import { 
  Task, 
  TaskType, 
  TaskStatus, 
  NetworkAgent,
  CodebaseAnalysisResult,
  ImprovementType,
  ImprovementSuggestion
} from '../types'
import { createRouter } from './router'

// Экспортируем базовые компоненты
export {
  AgentState,
  Task,
  TaskType,
  TaskStatus,
  createAgentState,
  addTask as addTaskToState,
  updateTaskStatus as updateTaskStatusInState,
  getAllTasks as getAllTasksFromState,
} from './state.js'

export { TaskScheduler, TaskHandler, createTaskScheduler } from './scheduler.js'

// Экспортируем новые компоненты автономной системы
export { Router, NetworkAgent, createRouter } from './router.js'

export { AgentNetwork, NetworkConfig, createAgentNetwork } from './network.js'

export {
  AutonomousSystem,
  AutonomousSystemConfig,
  createAutonomousSystem,
} from './autonomous-system.js'

// Экспортируем специализированных агентов
export { createCodeGeneratorAgent } from './specialized/code-generator.js'

// Экспортируем утилиты и сервисы
export {
  analyzeImprovementRequest,
  evaluateImprovement,
  logSelfImprovement as logSelfImprovementToFile,
  ImprovementResult,
  ImprovementType,
} from './self-improvement.js'

export {
  analyzeCodebase,
  saveImprovementSuggestions,
  loadImprovementSuggestions,
  generateImprovementReport,
  ImprovementSuggestion,
  CodebaseAnalysisResult,
  analyzeMultipleRepositories,
} from './improvement-detector.js'

import { createMcpService } from '../services/mcp.js'
import { Service } from '../types/index.js'
import {
  createAutonomousSystem,
  AutonomousSystem,
} from './autonomous-system.js'
import { createCodeGeneratorAgent } from './specialized/code-generator.js'

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

  // Новый метод для доступа к автономной системе
  getAutonomousSystem: () => AutonomousSystem
}

/**
 * Создает автономного агента разработчика с новой архитектурой на основе сети агентов
 */
export function createAgent(config: AgentConfig): Agent {
  const mcpService = createMcpService(config.mcpConfig)

  // Создаем автономную систему с базовыми агентами
  const autonomousSystem = createAutonomousSystem({
    id: config.id,
    mcpService,
    enableScheduler: true,
    schedulerIntervalMinutes: 60,
  })

  // Инициализируем агента на основе существующего функционала
  // для обратной совместимости
  const agent = {
    // [Реализация всех методов из интерфейса Agent]
    // Здесь имплементируем все существующие методы с использованием новой архитектуры

    // Метод для доступа к автономной системе
    getAutonomousSystem: () => autonomousSystem,
  } as Agent

  // Инициализируем автономную систему при запуске
  const originalInitialize = agent.initialize
  agent.initialize = async () => {
    await autonomousSystem.initialize()
    return originalInitialize()
  }

  // Останавливаем автономную систему при выключении
  const originalShutdown = agent.shutdown
  agent.shutdown = async () => {
    await autonomousSystem.shutdown()
    return originalShutdown()
  }

  return agent
}

// Экспортируем функцию для быстрого создания автономной системы
export function createAutonomousAgentSystem(config: {
  id?: string
  mcpConfig: {
    serverUrl: string
    apiKey: string
  }
}): AutonomousSystem {
  const mcpService = createMcpService(config.mcpConfig)

  return createAutonomousSystem({
    id: config.id || 'autonomous-agent-system',
    mcpService,
    enableScheduler: true,
  })
}
