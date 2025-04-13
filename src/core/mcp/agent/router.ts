/**
 * Маршрутизатор агентов для автономной системы
 * Отвечает за выбор подходящего агента в зависимости от задачи
 */

import { AgentState, Task, TaskType, TaskStatus, getNextTask } from './state'
import { Service } from '../types/index'
import { EventEmitter } from 'events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { logger } from '@/utils/logger'
// Интерфейс для конфигурации маршрутизатора
export interface RouterConfig {
  defaultAgentId?: string
  mcpService: Service
}

// Интерфейс для агента в сети
export interface NetworkAgent {
  id: string
  name: string
  description: string
  capabilities: string[]
  canHandle: (task: Task) => Promise<boolean>
  handle: (task: Task, state: AgentState) => Promise<any>
}

// Интерфейс маршрутизатора
export interface Router {
  registerAgent: (agent: NetworkAgent) => void
  routeTask: (task: Task, state: AgentState) => Promise<NetworkAgent | null>
  getAgents: () => NetworkAgent[]
  getAgentById: (id: string) => NetworkAgent | undefined
  on: (event: string, listener: (...args: any[]) => void) => void
  getNextTaskToProcess: (state: AgentState) => Promise<Task | null>
}

/**
 * Тип состояния роутера
 */
export type RouterState = {
  agents: Map<string, NetworkAgent>
  mcpService: Service
  defaultAgentId?: string
  eventEmitter: EventEmitter
}

/**
 * Создает начальное состояние роутера
 */
const createRouterState = (config: RouterConfig): RouterState => ({
  agents: new Map<string, NetworkAgent>(),
  mcpService: config.mcpService,
  defaultAgentId: config.defaultAgentId,
  eventEmitter: new EventEmitter(),
})

/**
 * Регистрирует агента в роутере
 */
const registerAgent = (state: RouterState, agent: NetworkAgent): void => {
  state.agents.set(agent.id, agent)
  console.log(`🤖 Зарегистрирован агент: ${agent.name} (${agent.id})`)
}

/**
 * Возвращает список всех зарегистрированных агентов
 */
const getAgents = (state: RouterState): NetworkAgent[] => {
  return Array.from(state.agents.values())
}

/**
 * Возвращает агента по его ID
 */
const getAgentById = (
  state: RouterState,
  id: string
): NetworkAgent | undefined => {
  return state.agents.get(id)
}

/**
 * Подписывается на события роутера
 */
const on = (
  state: RouterState,
  event: string,
  listener: (...args: any[]) => void
): void => {
  state.eventEmitter.on(event, listener)
}

/**
 * Выбирает лучшего агента для задачи из списка кандидатов
 */
const selectBestAgent = async (
  state: RouterState,
  task: Task,
  candidates: NetworkAgent[]
): Promise<NetworkAgent> => {
  const prompt = `
You are an expert agent router that needs to select the best agent to handle a specific task.

TASK:
- ID: ${task.id}
- Type: ${task.type}
- Description: ${task.description}
- Priority: ${task.priority}

Available agents:
${candidates
  .map(
    (agent, index) => `
${index + 1}. ${agent.name} (${agent.id})
   Description: ${agent.description}
   Capabilities: ${agent.capabilities.join(', ')}
`
  )
  .join('\n')}

Please analyze the task and the available agents. Select the most appropriate agent for this task.
Respond with only the agent ID of your selected agent.
`

  try {
    const result = await state.mcpService.processTask(prompt)
    const agentId = result.trim()

    // Проверяем, что выбранный агент из списка кандидатов
    const selectedAgent = candidates.find(agent => agent.id === agentId)

    if (selectedAgent) {
      logger.info(
        `🎯 Выбран агент: ${selectedAgent.name} (${selectedAgent.id})`
      )
      state.eventEmitter.emit('agent_selected', { task, agent: selectedAgent })
      return selectedAgent
    }

    // Если MCP вернул неверный ID, берем первого кандидата
    logger.warn(
      `⚠️ MCP вернул некорректный ID агента: ${agentId}, используем первого кандидата`
    )
    return candidates[0]
  } catch (error) {
    logger.error('❌ Ошибка при выборе лучшего агента:', error)
    // В случае ошибки выбираем первого кандидата
    return candidates[0]
  }
}

/**
 * Маршрутизирует задачу к наиболее подходящему агенту
 */
const routeTask = async (
  state: RouterState,
  task: Task,
  // AgentState не используется в этой функции, но необходим для соответствия интерфейсу
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _agentState: AgentState
): Promise<NetworkAgent | null> => {
  logger.info(`🚀 Маршрутизация задачи: ${task.id} (${task.type})`)

  // Если агентов нет, возвращаем null
  if (state.agents.size === 0) {
    logger.warn('⚠️ Нет зарегистрированных агентов')
    return null
  }

  // Проверяем, может ли каждый агент обработать задачу
  const capableAgents: NetworkAgent[] = []
  for (const agent of state.agents.values()) {
    try {
      const canHandle = await agent.canHandle(task)
      if (canHandle) {
        capableAgents.push(agent)
      }
    } catch (error) {
      logger.error(
        `❌ Ошибка при проверке, может ли агент ${agent.id} обработать задачу:`,
        error
      )
    }
  }

  // Если есть подходящие агенты, выбираем лучшего с помощью MCP
  if (capableAgents.length > 0) {
    if (capableAgents.length === 1) {
      return capableAgents[0]
    }

    // Если агентов несколько, используем MCP для выбора лучшего
    return await selectBestAgent(state, task, capableAgents)
  }

  // Если нет подходящих агентов, пробуем использовать агент по умолчанию
  if (state.defaultAgentId) {
    const defaultAgent = state.agents.get(state.defaultAgentId)
    if (defaultAgent) {
      logger.info(`ℹ️ Используем агент по умолчанию: ${defaultAgent.name}`)
      return defaultAgent
    }
  }

  logger.warn(`⚠️ Не найден подходящий агент для задачи ${task.id}`)
  return null
}

/**
 * Возвращает следующую задачу с наивысшим приоритетом для обработки
 */
const getNextTaskToProcess = async (
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _state: RouterState,
  agentState: AgentState
): Promise<Task | null> => {
  console.log('🔍 Поиск следующей задачи для обработки...')
  const nextTask = getNextTask(agentState)

  if (nextTask) {
    logger.info(
      `✅ Найдена задача: ${nextTask.id} (приоритет: ${nextTask.priority})`
    )
  } else {
    logger.warn('⚠️ Нет доступных задач для обработки')
  }

  return nextTask
}

/**
 * Создает экземпляр роутера в функциональном стиле
 */
export function createAgentRouter(config: RouterConfig): Router {
  const state = createRouterState(config)

  return {
    registerAgent: agent => registerAgent(state, agent),
    routeTask: (task, agentState) => routeTask(state, task, agentState),
    getAgents: () => getAgents(state),
    getAgentById: id => getAgentById(state, id),
    on: (event, listener) => on(state, event, listener),
    getNextTaskToProcess: agentState => getNextTaskToProcess(state, agentState),
  }
}

// Пример использования функционального подхода для тестирования
if (process.env.NODE_ENV === 'test') {
  // Простой тест, который можно запустить непосредственно
  ;(async () => {
    if (require.main !== module) return

    logger.info('🧪 Запуск простого теста роутера агентов')

    // Создаем тестовый сервис
    const testService: Service = {
      processTask: async (prompt: string) => {
        logger.info(`📝 Получен запрос: ${prompt.substring(0, 50)}...`)
        return 'agent-1'
      },
      initialize: async () => {
        logger.info('🚀 Инициализация тестового сервиса')
      },
      close: async () => {
        logger.info('🔒 Закрытие тестового сервиса')
      },
      getClient: () => {
        logger.info('🔌 Получение клиента тестового сервиса')
        return {} as Client // Моковый клиент
      },
    }

    // Создаем роутер
    const router = createAgentRouter({
      mcpService: testService,
    })

    // Создаем тестовых агентов
    const agent1 = {
      id: 'agent-1',
      name: 'Agent 1',
      description: 'Test agent 1',
      capabilities: [TaskType.CODE_GENERATION, TaskType.CODE_ANALYSIS],
      canHandle: async (task: Task) => {
        logger.info(`👀 Агент 1 проверяет задачу: ${task.id}`)
        return true
      },
      handle: async (task: Task) => {
        logger.info(`🔨 Агент 1 обрабатывает задачу: ${task.id}`)
        return { success: true, result: 'Done by Agent 1' }
      },
    }

    const agent2 = {
      id: 'agent-2',
      name: 'Agent 2',
      description: 'Test agent 2',
      capabilities: [TaskType.CODE_ANALYSIS, TaskType.DOCUMENTATION],
      canHandle: async (task: Task) => {
        logger.info(`👀 Агент 2 проверяет задачу: ${task.id}`)
        return task.type === TaskType.DOCUMENTATION
      },
      handle: async (task: Task) => {
        logger.info(`🔨 Агент 2 обрабатывает задачу: ${task.id}`)
        return { success: true, result: 'Done by Agent 2' }
      },
    }

    // Регистрируем агентов
    router.registerAgent(agent1)
    router.registerAgent(agent2)

    // Обрабатываем события
    router.on('agent_selected', data => {
      logger.info(
        `🎯 Выбран агент: ${data.agent.name} для задачи ${data.task.id}`
      )
    })

    // Создаем тестовую задачу
    const task: Task = {
      id: 'task-1',
      type: TaskType.DOCUMENTATION,
      description: 'Test task',
      priority: 1,
      status: TaskStatus.PENDING,
      created: new Date(),
      updated: new Date(),
      dependencies: [],
      metadata: {},
    }

    // Выполняем маршрутизацию
    logger.info('🚀 Маршрутизация задачи...')
    const agentState: AgentState = {
      id: 'test',
      tasks: new Map(),
      context: new Map<string, any>(),
      history: [],
    }

    const selectedAgent = await router.routeTask(task, agentState)
    logger.info(`✅ Выбран агент: ${selectedAgent?.name || 'null'}`)

    // Завершаем тест
    logger.info('🏁 Тест завершен')
  })()
}
