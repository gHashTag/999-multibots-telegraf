import { Task, TaskType } from '../types'
import { NetworkAgent } from './network-agent'
import { logger } from '../../../logger'

export abstract class BaseAgent implements NetworkAgent {
  protected lastActive: Date = new Date()
  protected errors: string[] = []
  
  constructor(
    public id: string,
    public name: string,
    public capabilities: TaskType[]
  ) {}

  abstract processTask(task: Task): Promise<any>

  async getStatus() {
    return {
      healthy: this.errors.length === 0,
      lastActive: this.lastActive,
      errors: this.errors
    }
  }

  protected logError(error: Error) {
    const errorMessage = error.message || 'Unknown error'
    this.errors.push(errorMessage)
    logger.error(`[${this.name}] ${errorMessage}`)
  }

  protected clearErrors() {
    this.errors = []
  }

  protected updateLastActive() {
    this.lastActive = new Date()
  }
} 