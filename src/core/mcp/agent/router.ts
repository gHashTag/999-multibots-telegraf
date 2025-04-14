/**
 * Маршрутизатор агентов для автономной системы
 * Отвечает за выбор подходящего агента в зависимости от задачи
 */

import { Task, TaskStatus, NetworkAgent, AgentStatus, RouterConfig, RouterMetrics } from '../types'
import { EventEmitter } from 'events'
import { logger } from '@/utils/logger'

export interface IRouter extends EventEmitter {
  registerAgent(agent: NetworkAgent): void
  routeTask(task: Task): Promise<void>
  getAgents(): NetworkAgent[]
  getAgentById(id: string): NetworkAgent | undefined
  selectAgent(task: Task): NetworkAgent | undefined
  getNextTask(): Task | undefined
  getNextTaskToProcess(): Task | undefined
}

export class Router extends EventEmitter implements IRouter {
  private agents: Map<string, NetworkAgent>
  private tasks: Map<string, Task>
  private config: RouterConfig
  private roundRobinIndex: number = 0

  constructor(config: RouterConfig) {
    super()
    this.agents = new Map()
    this.tasks = new Map()
    this.config = config
  }

  registerAgent(agent: NetworkAgent): void {
    this.agents.set(agent.id, agent)
    this.emit('agentRegistered', agent)
  }

  removeAgent(agentId: string): void {
    this.agents.delete(agentId)
    this.emit('agentRemoved', agentId)
  }

  async routeTask(task: Task): Promise<void> {
    const agent = this.selectAgent(task)
    if (!agent) {
      this.tasks.set(task.id, task)
      return
    }

    try {
      agent.status = AgentStatus.BUSY
      task.status = TaskStatus.IN_PROGRESS
      task.assignedAgent = agent.id
      task.startTime = new Date()
      
      this.emit('taskAssigned', { task, agent })
      
      await agent.processTask(task)
      
      agent.status = AgentStatus.IDLE
      task.status = TaskStatus.COMPLETED
      task.endTime = new Date()
      
      this.emit('taskCompleted', { task, agent })
      
    } catch (error) {
      agent.status = AgentStatus.ERROR
      task.status = TaskStatus.FAILED
      task.error = error as Error
      task.endTime = new Date()
      
      this.emit('taskFailed', { task, agent, error })
      
      if (this.shouldRetryTask(task)) {
        this.tasks.set(task.id, task)
      }
    }
  }

  getAgents(): NetworkAgent[] {
    return Array.from(this.agents.values())
  }

  getAgentById(id: string): NetworkAgent | undefined {
    return this.agents.get(id)
  }

  selectAgent(task: Task): NetworkAgent | undefined {
    const availableAgents = this.getAgents().filter(
      agent => agent.isAvailable()
    )

    if (availableAgents.length === 0) {
      return undefined
    }

    switch (this.config.loadBalancingStrategy) {
      case 'round-robin':
        return this.selectAgentRoundRobin(availableAgents)
      case 'least-loaded':
        return this.selectAgentLeastLoaded(availableAgents)
      case 'random':
      default:
        return this.selectAgentRandom(availableAgents)
    }
  }

  getNextTask(): Task | undefined {
    return Array.from(this.tasks.values())[0]
  }

  getNextTaskToProcess(): Task | undefined {
    const pendingTasks = Array.from(this.tasks.values()).filter(
      task => task.status === TaskStatus.PENDING
    )
    return pendingTasks[0]
  }

  startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return
    }
    this.healthCheckInterval = setInterval(
      () => this.checkAgentsHealth(),
      this.config.healthCheckIntervalMs
    )
  }

  stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }
  }

  getMetrics(): RouterMetrics {
    const metrics: RouterMetrics = {
      totalTasks: this.tasks.size,
      completedTasks: Array.from(this.tasks.values()).filter(
        t => t.status === TaskStatus.COMPLETED
      ).length,
      failedTasks: Array.from(this.tasks.values()).filter(
        t => t.status === TaskStatus.FAILED
      ).length,
      averageProcessingTime: this.calculateAverageProcessingTime(),
      activeAgents: this.getAgents().filter(a => a.isAvailable()).length,
      taskDistribution: this.calculateTaskDistribution()
    }
    return metrics
  }

  private shouldRetryTask(task: Task): boolean {
    return task.attempts < this.config.maxRetries
  }

  private selectAgentRoundRobin(agents: NetworkAgent[]): NetworkAgent {
    const index = this.roundRobinIndex % agents.length
    this.roundRobinIndex++
    return agents[index]
  }

  private selectAgentLeastLoaded(agents: NetworkAgent[]): NetworkAgent {
    return agents.reduce((prev, curr) => {
      const prevMetrics = prev.getMetrics()
      const currMetrics = curr.getMetrics()
      return prevMetrics.tasksProcessed < currMetrics.tasksProcessed ? prev : curr
    })
  }

  private selectAgentRandom(agents: NetworkAgent[]): NetworkAgent {
    const index = Math.floor(Math.random() * agents.length)
    return agents[index]
  }

  private async checkAgentsHealth(): Promise<void> {
    for (const agent of this.getAgents()) {
      try {
        const status = await agent.getStatus()
        if (status === AgentStatus.ERROR) {
          this.emit('agentError', { 
            agent,
            error: 'Agent health check failed'
          })
        }
      } catch (error) {
        logger.error(`Health check failed for agent ${agent.id}:`, error)
      }
    }
  }

  private calculateAverageProcessingTime(): number {
    const completedTasks = Array.from(this.tasks.values()).filter(
      t => t.status === TaskStatus.COMPLETED && t.startTime && t.endTime
    )
    
    if (completedTasks.length === 0) return 0
    
    const totalTime = completedTasks.reduce((sum, task) => {
      return sum + (task.endTime!.getTime() - task.startTime!.getTime())
    }, 0)
    
    return totalTime / completedTasks.length
  }

  private calculateTaskDistribution(): Record<string, number> {
    const distribution: Record<string, number> = {}
    
    for (const task of this.tasks.values()) {
      distribution[task.type] = (distribution[task.type] || 0) + 1
    }
    
    return distribution
  }

  private healthCheckInterval: NodeJS.Timeout | null = null
}

export function createRouter(config: RouterConfig): Router {
  return new Router(config)
}
