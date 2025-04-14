/**
 * Инициализация автономной системы агентов
 * Экспортирует функцию для создания и настройки системы
 */

import {
  createAutonomousSystem,
  AutonomousSystem,
} from './autonomous-system.js'
import { createMcpService } from '../services/mcp.js'
import { createCodeGeneratorAgent } from './specialized/code-generator.js'
import { createMessageAgent } from './specialized/message-agent.js'
import { v4 as uuidv4 } from 'uuid'

/**
 * Конфигурация для инициализации системы
 */
export interface SystemInitConfig {
  systemId?: string
  mcpConfig: {
    serverUrl: string
    apiKey: string
  }
  enableScheduler?: boolean
  schedulerInterval?: number
}

/**
 * Инициализирует автономную систему с настройками по умолчанию
 */
export async function initializeAutonomousSystem(
  config: SystemInitConfig
): Promise<AutonomousSystem> {
  console.log('🚀 Initializing autonomous system...')

  // Создаем сервис MCP
  const mcpService = createMcpService(config.mcpConfig)

  // Создаем автономную систему с базовыми компонентами
  const system = createAutonomousSystem({
    id: config.systemId || `autonomous-system-${uuidv4()}`,
    mcpService,
    enableScheduler: config.enableScheduler !== false, // по умолчанию включен
    schedulerIntervalMinutes: config.schedulerInterval || 60,
  })

  // Добавляем специализированных агентов
  system.addAgent(createCodeGeneratorAgent(mcpService))

  // Добавляем агента для обработки сообщений
  system.addAgent(createMessageAgent())

  // Инициализируем систему
  await system.initialize()

  console.log('✅ Autonomous system initialized successfully')

  return system
}

/**
 * Создает и настраивает автономную систему с минимальной конфигурацией
 */
export function quickStartAutonomousSystem(): Promise<AutonomousSystem> {
  // Проверяем наличие переменных окружения
  const serverUrl = process.env.MCP_SERVER_URL
  const apiKey = process.env.MCP_API_KEY

  if (!serverUrl || !apiKey) {
    throw new Error(
      'MCP_SERVER_URL and MCP_API_KEY environment variables must be set'
    )
  }

  // Инициализируем с настройками из переменных окружения
  return initializeAutonomousSystem({
    mcpConfig: {
      serverUrl,
      apiKey,
    },
    enableScheduler: process.env.ENABLE_SCHEDULER !== 'false',
  })
}
