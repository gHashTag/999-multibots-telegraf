import axios from 'axios'
import { logger } from '@/utils/logger'

// Базовый URL для Glama MCP API
const GLAMA_MCP_API_URL = 'https://glama.ai/api/mcp/v1'

/**
 * Интерфейс сервера Glama MCP на основе реального ответа API
 */
interface McpServer {
  id: string
  name: string
  description: string
  repository?: {
    url: string
  }
  url: string
  tools: any[]
  attributes: any[]
  environmentVariablesJsonSchema?: {
    properties: Record<string, any>
    type: string
    required: string[]
  }
  spdxLicense?: {
    name: string
    url: string
  } | null
}

/**
 * Интерфейс ответа API со списком серверов
 */
interface McpServersResponse {
  servers: McpServer[]
  pageInfo: {
    endCursor: string
    hasNextPage: boolean
    hasPreviousPage: boolean
    startCursor: string
  }
}

/**
 * Сервис для работы с Glama MCP API
 */
export class GlamaMcpService {
  private readonly apiClient = axios.create({
    baseURL: GLAMA_MCP_API_URL,
    headers: {
      Authorization: `Bearer ${process.env.GLAMA_API_KEY}`,
      'Content-Type': 'application/json',
    },
  })

  /**
   * Получить список всех доступных MCP серверов
   */
  async getServers(): Promise<McpServer[]> {
    try {
      logger.info({
        message: '🔍 Запрос списка серверов Glama MCP',
      })

      const response = await this.apiClient.get<McpServersResponse>('/servers')

      logger.info({
        message: '✅ Получен список серверов Glama MCP',
        count: response.data.servers?.length || 0,
      })

      return response.data.servers || []
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при получении списка серверов Glama MCP',
        error: error.message,
        url: `${GLAMA_MCP_API_URL}/servers`,
        status: error.response?.status,
        responseData: error.response?.data,
      })
      throw new Error(
        `Ошибка при получении списка серверов Glama MCP: ${error.message}`
      )
    }
  }

  /**
   * Получить информацию о конкретном сервере по ID
   */
  async getServerById(serverId: string): Promise<McpServer> {
    try {
      logger.info({
        message: '🔍 Запрос информации о сервере Glama MCP',
        serverId,
      })

      const response = await this.apiClient.get<McpServer>(
        `/servers/${serverId}`
      )

      logger.info({
        message: '✅ Получена информация о сервере Glama MCP',
        serverId,
        serverName: response.data.name,
      })

      return response.data
    } catch (error) {
      logger.error({
        message: '❌ Ошибка при получении информации о сервере Glama MCP',
        serverId,
        error: error.message,
        url: `${GLAMA_MCP_API_URL}/servers/${serverId}`,
        status: error.response?.status,
        responseData: error.response?.data,
      })
      throw new Error(
        `Ошибка при получении информации о сервере Glama MCP: ${error.message}`
      )
    }
  }
}

// Экспортируем экземпляр сервиса для использования в других частях приложения
export const glamaMcpService = new GlamaMcpService()
