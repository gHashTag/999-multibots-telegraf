import { NetworkAgent } from '../router'
import { Task, TaskType, AgentState } from '../state'
import { Service } from '../../types'
import { createSelfImprovementSystem } from '../self-improvement'

export function createSelfImprovementAgent(mcpService: Service): NetworkAgent {
  const system = createSelfImprovementSystem(mcpService)

  return {
    id: 'self-improvement',
    name: 'Self Improvement Agent',
    description: 'Агент для самосовершенствования системы',
    capabilities: ['self_improvement', 'system_analysis'],
    
    canHandle: async (task: Task): Promise<boolean> => {
      return task.type === TaskType.SELF_IMPROVEMENT
    },

    handle: async (task: Task, state: AgentState): Promise<any> => {
      console.log(`🤖 Self Improvement Agent обрабатывает задачу: ${task.id}`)
      
      try {
        const result = await system.improve(task)
        return result
      } catch (error) {
        console.error('❌ Ошибка при выполнении самосовершенствования:', error)
        throw error
      }
    }
  }
} 