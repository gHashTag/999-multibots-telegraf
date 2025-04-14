import { Agent } from '@inngest/agent-kit'
import { Task } from '../../../types'
import { NetworkAgent } from '../types'

/**
 * Адаптирует агент Inngest к интерфейсу NetworkAgent
 */
export function adaptInngestAgent(agent: Agent<any>): NetworkAgent {
  return {
    id: agent.id,
    name: agent.name,
    description: agent.description,
    capabilities: agent.capabilities,
    
    async canHandle(task: Task): Promise<boolean> {
      return true // По умолчанию агент может обрабатывать любую задачу
    },

    async handle(task: Task) {
      return agent.run(task.description)
    }
  }
} 