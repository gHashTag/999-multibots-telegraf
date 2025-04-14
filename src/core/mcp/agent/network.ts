/**
 * Сеть агентов для автономной системы
 * Обеспечивает координацию между агентами и обработку задач
 */

import { EventEmitter } from 'events'
import { Task, TaskStatus, AgentState } from './state'
import { NetworkAgent, Router } from './router'
import { Service } from '../types/metrics'
import { NetworkAgent as NetworkAgentType } from '../types/agent'
import { Task as TaskType } from '../types/base'
import { logger } from '../logger'

// Конфигурация сети агентов
export interface NetworkConfig {
  id: string
  mcpService: Service
  router: Router
  maxIterations?: number
  healthCheckIntervalMs?: number
}

// Интерфейс сети агентов
export interface AgentNetwork extends EventEmitter {
  initialize(): Promise<void>
  shutdown(): Promise<void>
  addAgent(agent: NetworkAgentType): void
  routeTask(task: TaskType): Promise<void>
  processTask(task: TaskType): Promise<any>
  getActiveAgents(): NetworkAgentType[]
  getPendingTasks(): TaskType[]
  checkHealth(): Promise<{status: string}>
  getFailedAgents(): Promise<NetworkAgentType[]>
  restartAgent(id: string): Promise<void>
  cleanupStaleTasks(): Promise<void>
  ping(): Promise<void>
  getAgents(): NetworkAgentType[]
  replaceAgent(id: string, newAgent: NetworkAgentType): void
}

// Реализация сети агентов
export class AgentNetworkImpl extends EventEmitter implements Service {
  private readonly id: string
  private readonly mcpService: Service
  private readonly router: Router
  private readonly agents: Map<string, NetworkAgentType>
  private readonly eventEmitter: EventEmitter
  private readonly maxIterations: number
  private initialized: boolean = false
  private readonly tasks = new Map<string, Task>()
  private healthCheckInterval?: NodeJS.Timeout

  constructor(config: NetworkConfig) {
    super()
    this.id = config.id
    this.mcpService = config.mcpService
    this.router = config.router
    this.agents = new Map()
    this.eventEmitter = new EventEmitter()
    this.maxIterations = config.maxIterations || 10
  }

  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    logger.info('Initializing agent network')
    
    // Start health checks
    this.startHealthCheck()
    
    this.initialized = true
    logger.info('Agent network initialized')
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return
    }

    logger.info('Shutting down agent network')

    // Stop health checks
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    // Shutdown all agents
    for (const agent of this.agents.values()) {
      await agent.shutdown()
    }

    this.initialized = false
    logger.info('Agent network shut down')
  }

  addAgent(agent: NetworkAgentType): void {
    if (this.agents.has(agent.id)) {
      logger.warn(`Agent ${agent.id} already exists in network`)
      return
    }
    this.agents.set(agent.id, agent)
    logger.info(`Added agent ${agent.id} to network`)
  }

  async routeTask(task: TaskType): Promise<void> {
    if (!this.initialized) {
      throw new Error('Agent network not initialized')
    }

    const agent = await this.router.selectAgent(task, Array.from(this.agents.values()))
    if (!agent) {
      throw new Error('No available agent to process task')
    }

    this.tasks.set(task.id, task)
    await agent.processTask(task)
  }

  async processTask(task: TaskType): Promise<any> {
    const agent = await this.router.selectAgent(task, Array.from(this.agents.values()))
    if (!agent) {
      throw new Error('No available agent to process task')
    }

    return agent.processTask(task)
  }

  getAgents(): NetworkAgentType[] {
    return Array.from(this.agents.values())
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.eventEmitter.on(event, listener)
  }

  getActiveAgents(): NetworkAgentType[] {
    return Array.from(this.agents.values()).filter(
      agent => agent.status === 'ACTIVE'
    )
  }

  getPendingTasks(): TaskType[] {
    return Array.from(this.tasks.values()).filter(
      task => task.status === TaskStatus.PENDING
    )
  }

  async checkHealth(): Promise<{status: string}> {
    const activeAgents = this.getActiveAgents()
    const totalAgents = this.agents.size
    
    if (activeAgents.length === 0) {
      return { status: 'CRITICAL' }
    }
    
    if (activeAgents.length < totalAgents) {
      return { status: 'WARNING' }
    }
    
    return { status: 'HEALTHY' }
  }

  async getFailedAgents(): Promise<NetworkAgentType[]> {
    return Array.from(this.agents.values()).filter(
      agent => agent.status === 'ERROR'
    )
  }

  async restartAgent(id: string): Promise<void> {
    const agent = this.agents.get(id)
    if (!agent) {
      throw new Error(`Agent ${id} not found`)
    }

    await agent.shutdown()
    await agent.initialize()
    
    logger.info(`Restarted agent ${id}`)
  }

  async cleanupStaleTasks(): Promise<void> {
    const now = Date.now()
    const staleTimeout = 1000 * 60 * 30 // 30 minutes

    for (const [id, task] of this.tasks.entries()) {
      if (now - task.createdAt > staleTimeout) {
        this.tasks.delete(id)
        logger.info(`Cleaned up stale task ${id}`)
      }
    }
  }

  async ping(): Promise<void> {
    for (const agent of this.agents.values()) {
      try {
        await agent.ping()
      } catch (error) {
        logger.error(`Failed to ping agent ${agent.id}: ${error}`)
      }
    }
  }

  replaceAgent(id: string, newAgent: NetworkAgentType): void {
    const oldAgent = this.agents.get(id)
    if (oldAgent) {
      oldAgent.shutdown()
    }
    
    this.agents.set(id, newAgent)
    logger.info(`Replaced agent ${id}`)
  }

  private startHealthCheck(): void {
    const interval = this.config.healthCheckIntervalMs || 60000
    
    this.healthCheckInterval = setInterval(async () => {
      const health = await this.checkHealth()
      
      if (health.status !== 'HEALTHY') {
        logger.warn(`Network health check failed: ${health.status}`)
        
        const failedAgents = await this.getFailedAgents()
        for (const agent of failedAgents) {
          try {
            await this.restartAgent(agent.id)
          } catch (error) {
            logger.error(`Failed to restart agent ${agent.id}: ${error}`)
          }
        }
      }
    }, interval)
  }
}

// Функция создания сети агентов
export function createAgentNetwork(config: NetworkConfig): AgentNetwork {
  return new AgentNetworkImpl(config)
}
