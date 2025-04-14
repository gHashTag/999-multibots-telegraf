/**
 * Автономная система агентов
 * Объединяет все компоненты и обеспечивает интеграцию
 */

import { Task, TaskType, TaskStatus } from './state.js'
import { createAgentNetwork, AgentNetwork } from './network.js'
import { NetworkAgent } from './router.js'
import { createCodeGeneratorAgent } from './specialized/code-generator.js'
import { createMessageAgent } from './specialized/message-agent.js'
import { createCodeAnalysisAgent } from './specialized/code-analysis-agent.js'
import { Service } from '../types/index.js'
import { v4 as uuidv4 } from 'uuid'

// Конфигурация автономной системы
export interface AutonomousSystemConfig {
  id?: string
  mcpService: Service
  agents?: NetworkAgent[]
  enableScheduler?: boolean
  schedulerIntervalMinutes?: number
}

// Интерфейс автономной системы
export interface AutonomousSystem {
  initialize(): Promise<void>
  shutdown(): Promise<void>
  addAgent(agent: NetworkAgent): void
  createTask(
    type: TaskType,
    description: string,
    metadata?: Record<string, any>
  ): Promise<Task>
  processTask(task: Task): Promise<any>
  on(event: string, listener: (...args: any[]) => void): void
}

// Реализация автономной системы
export class AutonomousSystemImpl implements AutonomousSystem {
  private network: AgentNetwork
  private mcpService: Service
  private schedulerInterval: NodeJS.Timeout | null = null

  constructor(config: AutonomousSystemConfig) {
    this.mcpService = config.mcpService

    // Создаем сеть агентов
    this.network = createAgentNetwork({
      id: config.id || `autonomous-system-${uuidv4()}`,
      mcpService: config.mcpService,
    })

    // Добавляем предоставленных агентов
    if (config.agents && Array.isArray(config.agents)) {
      for (const agent of config.agents) {
        this.network.addAgent(agent)
      }
    }

    // Запускаем планировщик, если включен
    if (config.enableScheduler) {
      this.startScheduler(config.schedulerIntervalMinutes || 60)
    }
  }

  async initialize(): Promise<void> {
    // Инициализируем сеть агентов
    await this.network.initialize()
    console.log('Autonomous system initialized')
  }

  async shutdown(): Promise<void> {
    // Останавливаем планировщик
    this.stopScheduler()

    // Завершаем работу сети агентов
    await this.network.shutdown()
    console.log('Autonomous system shut down')
  }

  addAgent(agent: NetworkAgent): void {
    this.network.addAgent(agent)
  }

  async createTask(
    type: TaskType,
    description: string,
    metadata: Record<string, any> = {}
  ): Promise<Task> {
    // Создаем новую задачу
    const task: Task = {
      id: uuidv4(),
      type,
      description,
      status: TaskStatus.PENDING,
      priority: metadata.priority || 1,
      created: new Date(),
      updated: new Date(),
      dependencies: metadata.dependencies || [],
      metadata,
    }

    console.log(`Created task ${task.id} of type ${type}: ${description}`)
    return task
  }

  async processTask(task: Task): Promise<any> {
    return this.network.processTask(task)
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.network.on(event, listener)
  }

  private startScheduler(intervalMinutes: number): void {
    if (this.schedulerInterval) {
      return
    }

    const intervalMs = intervalMinutes * 60 * 1000

    this.schedulerInterval = setInterval(() => {
      this.runScheduledTasks().catch(error => {
        console.error('Error running scheduled tasks:', error)
      })
    }, intervalMs)

    console.log(`Scheduler started with interval of ${intervalMinutes} minutes`)
  }

  private stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval)
      this.schedulerInterval = null
      console.log('Scheduler stopped')
    }
  }

  private async runScheduledTasks(): Promise<void> {
    console.log('Running scheduled tasks')

    try {
      // Создаем задачу самосовершенствования
      const task = await this.createTask(
        TaskType.SELF_IMPROVEMENT,
        'Scheduled code quality improvement',
        {
          priority: 3,
          targetComponent: null,
          applyChanges: true,
          scheduledRun: true,
        }
      )

      // Выполняем задачу
      await this.processTask(task)
    } catch (error) {
      console.error('Error in scheduled task:', error)
    }
  }
}

// Функция для создания и настройки автономной системы
export function createAutonomousSystem(
  config: AutonomousSystemConfig
): AutonomousSystem {
  const system = new AutonomousSystemImpl(config)

  // Добавляем базовые специализированные агенты
  system.addAgent(createCodeGeneratorAgent(config.mcpService))

  // Добавляем агента для обработки сообщений
  system.addAgent(createMessageAgent())

  // Добавляем агента для статического анализа кода
  system.addAgent(createCodeAnalysisAgent())

  return system
}
