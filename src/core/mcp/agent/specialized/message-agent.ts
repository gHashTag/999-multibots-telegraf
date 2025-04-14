import { createAgent } from '@inngest/agent-kit'
import { NetworkAgent } from '../router'
import { Task, TaskType } from '../state'

// TODO: Implement full message processing agent logic
export function createMessageAgent(): NetworkAgent {
  const agent = createAgent({
    name: 'messageAgent',
    description:
      'Processes incoming messages, understands intent, and interacts with users.',
    system: 'You are a helpful assistant managing user communication.',
    tools: [], // Add tools for communication (e.g., sending messages, handling replies)
  })

  // Explicitly cast and add missing properties to satisfy NetworkAgent
  const networkAgent: NetworkAgent = {
    ...agent,
    id: 'message-agent',
    capabilities: ['NaturalLanguageProcessing', 'UserInteraction'], // Use string array
    canHandle: async (task: Task): Promise<boolean> => {
      // Basic check, refine later
      return task.type === TaskType.MESSAGE_OWNER
    },
    handle: async (task: Task): Promise<any> => {
      // Basic handler, refine later
      console.log(`MessageAgent handling task: ${task.id}`)
      try {
        const result = await agent.run(task.description, {
          // Add context like user ID, chat history
        })
        return result // Or format response
      } catch (error) {
        console.error(`Error handling task ${task.id} in MessageAgent:`, error)
        throw error
      }
    },
  }

  return networkAgent
}
