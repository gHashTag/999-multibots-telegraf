import { createAgent } from '@inngest/agent-kit'
import { NetworkAgent } from '../router'
import { Task, TaskType } from '../state'
import {
  runTerminalCommandTool,
  createOrUpdateFilesTool,
  readFilesTool,
} from '../tools/e2b-tools'

// Агент для выполнения задач в песочнице E2B
export function createSandboxExecutorAgent(): NetworkAgent {
  const agent = createAgent({
    name: 'sandboxExecutorAgent',
    description:
      'Executes tasks requiring a sandboxed environment, such as running code, terminal commands, or filesystem operations.',
    system:
      'You are an agent specialized in executing tasks within a secure E2B sandbox. Use the provided tools to run commands, manage files, and report results accurately.',
    tools: [runTerminalCommandTool, createOrUpdateFilesTool, readFilesTool],
  })

  const networkAgent: NetworkAgent = {
    ...agent,
    id: 'sandbox-executor-agent',
    capabilities: ['SandboxExecution', 'Terminal', 'FileSystem'],
    canHandle: async (task: Task): Promise<boolean> => {
      // Этот агент может обрабатывать задачи, требующие песочницы
      // (Пример: можно добавить специальный TaskType или проверять metadata)
      return (
        task.type === TaskType.CODE_GENERATION || // Пример
        task.type === TaskType.TEST_GENERATION || // Пример
        task.metadata?.requiresSandbox === true
      )
    },
    handle: async (task: Task): Promise<any> => {
      console.log(`SandboxExecutorAgent handling task: ${task.id}`)
      try {
        // Основная логика - передать задачу на выполнение агенту AgentKit
        // Промпт может быть сформирован на основе task.description и metadata
        const result = await agent.run(
          `Execute the following task: ${task.description}`,
          {
            // Можно передать доп. контекст, если нужно
            // initialState: { ... } 
          }
        )
        return result
      } catch (error) { 
        console.error(
          `Error handling task ${task.id} in SandboxExecutorAgent:`,
          error
        )
        throw error
      }
    },
  }

  return networkAgent
} 