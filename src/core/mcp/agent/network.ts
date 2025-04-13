/**
 * Сеть агентов для автономной системы
 * Обеспечивает координацию между агентами и обработку задач
 */

import { AgentState, Task, createAgentState } from './state.js'
import { Router, NetworkAgent, createAgentRouter } from './router.js'
import { Service } from '../types/index.js'
import { EventEmitter } from 'events'

// Интерфейс для конфигурации сети агентов
export interface NetworkConfig {
  id: string
  mcpService: Service
  defaultAgentId?: string
}

// Интерфейс для сети агентов
export interface AgentNetwork {
  initialize: () => Promise<void>
  shutdown: () => Promise<void>
  addAgent: (agent: NetworkAgent) => void
  processTask: (task: Task) => Promise<any>
  getAgents: () => NetworkAgent[]
  on: (event: string, listener: (...args: any[]) => void) => void
}

// Реализация сети агентов
export class AgentNetworkImpl implements AgentNetwork {
  private router: Router
  private state: AgentState
  private mcpService: Service
  private initialized: boolean = false
  private eventEmitter: EventEmitter = new EventEmitter()

  constructor(config: NetworkConfig) {
    this.state = createAgentState(config.id)
    this.mcpService = config.mcpService
    this.router = createAgentRouter({
      mcpService: config.mcpService,
      defaultAgentId: config.defaultAgentId,
    })
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // Инициализируем MCP сервис, если нужно
      await this.mcpService.initialize()

      // Подписываемся на события маршрутизатора
      this.router.on('agent_selected', data => {
        this.eventEmitter.emit('agent_selected', data)
      })

      this.initialized = true
      console.log(`Agent network ${this.state.id} initialized`)
    } catch (error) {
      console.error('Error initializing agent network:', error)
      throw error
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return
    }

    try {
      // Закрываем соединение с MCP
      await this.mcpService.close()

      this.initialized = false
      console.log(`Agent network ${this.state.id} shut down`)
    } catch (error) {
      console.error('Error shutting down agent network:', error)
      throw error
    }
  }

  addAgent(agent: NetworkAgent): void {
    this.router.registerAgent(agent)
    this.eventEmitter.emit('agent_added', agent)
  }

  async processTask(task: Task): Promise<any> {
    if (!this.initialized) {
      throw new Error('Agent network not initialized')
    }

    console.log(`Processing task ${task.id} of type ${task.type}`)

    try {
      // Находим подходящего агента через маршрутизатор
      const agent = await this.router.routeTask(task, this.state)

      if (!agent) {
        const errorMessage = `No agent available to handle task ${task.id}`
        console.error(errorMessage)
        throw new Error(errorMessage)
      }

      console.log(
        `Agent ${agent.name} (${agent.id}) selected for task ${task.id}`
      )

      // Обрабатываем задачу выбранным агентом
      const result = await agent.handle(task, this.state)

      console.log(`Task ${task.id} completed successfully`)
      this.eventEmitter.emit('task_completed', { task, result })

      return result
    } catch (error) {
      console.error(`Error processing task ${task.id}:`, error)
      this.eventEmitter.emit('task_failed', { task, error })
      throw error
    }
  }

  getAgents(): NetworkAgent[] {
    return this.router.getAgents()
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener)
  }
}

// Функция для создания сети агентов
export function createAgentNetwork(config: NetworkConfig): AgentNetwork {
  return new AgentNetworkImpl(config)
}
