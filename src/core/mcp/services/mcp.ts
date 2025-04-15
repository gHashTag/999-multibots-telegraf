import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { WebSocketClientTransport } from '@modelcontextprotocol/sdk/client/websocket.js'
import type { Service } from '../types'

interface McpConfig {
  serverUrl: string
  apiKey: string
}

// Создаем клиента MCP
const createMcpClient = () => {
  console.log('🚀 Initializing MCP service...')
  return new Client({
    name: 'NeuroBlogger',
    version: '1.0.0',
  })
}

// Инициализация соединения с сервером
const initializeConnection = async (
  client: Client,
  config: McpConfig
): Promise<void> => {
  const { serverUrl, apiKey } = config

  if (!serverUrl || !apiKey) {
    throw new Error('🚫 MCP server URL or API key not set')
  }

  try {
    console.log('🚀 Connecting to MCP server...')

    const url = new URL(serverUrl)
    url.searchParams.set('token', apiKey)

    const transport = new WebSocketClientTransport(url)
    await client.connect(transport)

    console.log('✅ Connected to MCP server')
  } catch (error) {
    console.error('❌ Failed to connect to MCP server:', error)
    throw error
  }
}

// Закрытие соединения
const closeConnection = async (client: Client): Promise<void> => {
  try {
    await client.close()
    console.log('✅ Closed MCP connection')
  } catch (error) {
    console.error('❌ Failed to close MCP connection:', error)
    throw error
  }
}

// Обработка задачи
const processTask = async (client: Client, prompt: string) => {
  try {
    console.log('🎯 Processing task with prompt:', prompt)

    const result = await client.complete({
      ref: {
        type: 'ref/prompt',
        name: 'default',
      },
      argument: {
        name: 'prompt',
        value: prompt,
      },
    })

    console.log('✅ Task processed successfully')
    return result
  } catch (error) {
    console.error('❌ Failed to process task:', error)
    throw error
  }
}

// Создание сервиса MCP
export const createMcpService = (
  config: McpConfig = {
    serverUrl: process.env.MCP_SERVER_URL || '',
    apiKey: process.env.MCP_API_KEY || '',
  }
): Service => {
  const client = createMcpClient()

  return {
    initialize: () => initializeConnection(client, config),
    close: () => closeConnection(client),
    processTask: (prompt: string) => processTask(client, prompt),
    getClient: () => client,
  }
}
