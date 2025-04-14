import { NetworkAgent } from '../../types/agent'
import { Task, TaskType } from '../../types'
import { Agent } from '@inngest/agent-kit'

export function adaptInngestAgent(
  agent: Agent,
  name: string,
  capabilities: TaskType[],
  canHandle: (task: Task) => Promise<boolean>
): NetworkAgent {
  return {
    id: agent.id || `inngest-${name}`,
    name,
    type: 'inngest',
    capabilities,
    status: 'idle',
    
    async processTask(task: Task) {
      if (await canHandle(task)) {
        return agent.process(task)
      }
      throw new Error('Task type not supported')
    },

    async getStatus() {
      return {
        healthy: true,
        lastActive: new Date(),
        errors: []
      }
    },

    isAvailable() {
      return true
    },

    getErrors() {
      return []
    },

    clearErrors() {
      // No-op
    },

    reset() {
      // No-op
    },

    async measureLatency() {
      return 0
    }
  }
} 