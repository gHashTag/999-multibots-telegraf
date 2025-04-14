import { NetworkAgent, AgentStatus, Task, TaskType } from '../../../types'
import { logger } from '../../../logger'

export class BaseNetworkAgent implements NetworkAgent {
  id: string
  name: string
  type: string
  status: AgentStatus
  capabilities: TaskType[]
  lastActive: Date
  errors: Error[]
  private lastError: Error | null = null

  constructor(id: string, name: string, type: string, capabilities: TaskType[]) {
    this.id = id
    this.name = name
    this.type = type
    this.status = AgentStatus.IDLE
    this.capabilities = capabilities
    this.lastActive = new Date()
    this.errors = []
  }

  async processTask(task: Task): Promise<any> {
    try {
      this.status = AgentStatus.BUSY
      this.lastActive = new Date()
      
      logger.info(`🤖 Agent ${this.name} processing task ${task.id}`)
      
      // Базовая реализация - переопределить в наследниках
      await new Promise(resolve => setTimeout(resolve, 1000))
      
      this.status = AgentStatus.IDLE
      return { success: true }
    } catch (err) {
      this.status = AgentStatus.ERROR
      this.errors.push(err as Error)
      logger.error(`❌ Error in agent ${this.name}: ${err}`)
      this.lastError = err as Error
      throw err
    }
  }

  async getStatus(): Promise<{ healthy: boolean; lastActive: Date; errors: string[] }> {
    const healthy = this.status !== AgentStatus.ERROR && this.status !== AgentStatus.OFFLINE
    return {
      healthy,
      lastActive: this.lastActive,
      errors: this.errors.map(e => e.message)
    }
  }

  isAvailable(): boolean {
    return this.status === AgentStatus.IDLE
  }

  getErrors(): Error[] {
    return this.errors
  }

  clearErrors(): void {
    this.errors = []
    if (this.status === AgentStatus.ERROR) {
      this.status = AgentStatus.IDLE
    }
  }

  getLastError(): Error | null {
    return this.lastError
  }

  reset(): void {
    this.status = AgentStatus.IDLE
    this.lastError = null
  }

  async measureLatency(endpoint: string): Promise<number> {
    try {
      const start = Date.now()
      await fetch(endpoint)
      return Date.now() - start
    } catch (error) {
      this.lastError = error as Error
      this.status = AgentStatus.ERROR
      throw error
    }
  }
} 