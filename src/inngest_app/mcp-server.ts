#!/usr/bin/env tsx

/**
 * Inngest MCP Server
 *
 * Сервер Model Context Protocol для работы с Inngest функциями
 */

import { Inngest } from 'inngest'
import { createServer } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import * as functions from './functions/index.js'

// Инициализация Inngest клиента
const inngest = new Inngest({
  name: 'Neuro Blogger Telegram Bot',
})

// Получение всех функций
const allFunctions = functions.getAllFunctions()

// Список инструментов для MCP
const tools = [
  {
    name: 'list_functions',
    description: 'Получить список всех доступных Inngest функций',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'execute_function',
    description: 'Выполнить конкретную Inngest функцию',
    inputSchema: {
      type: 'object',
      properties: {
        function_id: {
          type: 'string',
          description: 'ID функции для выполнения',
        },
        data: {
          type: 'object',
          description: 'Данные для передачи в функцию',
        },
      },
      required: ['function_id'],
    },
  },
  {
    name: 'get_function_info',
    description: 'Получить информацию о конкретной функции',
    inputSchema: {
      type: 'object',
      properties: {
        function_id: {
          type: 'string',
          description: 'ID функции',
        },
      },
      required: ['function_id'],
    },
  },
  {
    name: 'test_function',
    description: 'Протестировать функцию с тестовыми данными',
    inputSchema: {
      type: 'object',
      properties: {
        function_id: {
          type: 'string',
          description: 'ID функции для тестирования',
        },
        test_mode: {
          type: 'string',
          enum: ['basic', 'advanced', 'error'],
          description: 'Режим тестирования',
        },
      },
      required: ['function_id'],
    },
  },
  {
    name: 'batch_execute',
    description: 'Выполнить несколько функций в batch режиме',
    inputSchema: {
      type: 'object',
      properties: {
        functions: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              function_id: { type: 'string' },
              data: { type: 'object' },
            },
          },
          description: 'Список функций для выполнения',
        },
      },
      required: ['functions'],
    },
  },
]

// Обработчики инструментов
const handlers = {
  list_functions: async () => {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              total_functions: allFunctions.length,
              categories: functions.getFunctionStats(),
              functions: allFunctions.map((f) => ({
                id: f.id,
                name: f.name,
                category: f.category || 'uncategorized',
                description: f.description || '',
              })),
            },
            null,
            2,
          ),
        },
      ],
    }
  },

  execute_function: async (args: { function_id: string; data?: any }) => {
    const func = allFunctions.find((f) => f.id === args.function_id)

    if (!func) {
      return {
        content: [
          {
            type: 'text',
            text: `Функция ${args.function_id} не найдена`,
          },
        ],
        isError: true,
      }
    }

    try {
      // Создаем mock событие
      const event = {
        name: args.function_id,
        data: args.data || {},
        id: `event_${Date.now()}`,
        timestamp: Date.now(),
      }

      // Выполняем функцию
      const result = await func.handler({
        event,
        step: {
          run: async (name: string, fn: Function) => await fn(),
        },
        logger: {
          info: console.log,
          error: console.error,
          warn: console.warn,
        },
      })

      return {
        content: [
          {
            type: 'text',
            text: `✅ Функция ${args.function_id} выполнена успешно\n\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Ошибка выполнения функции ${args.function_id}:\n\n${error.message}`,
          },
        ],
        isError: true,
      }
    }
  },

  get_function_info: async (args: { function_id: string }) => {
    const func = allFunctions.find((f) => f.id === args.function_id)

    if (!func) {
      return {
        content: [
          {
            type: 'text',
            text: `Функция ${args.function_id} не найдена`,
          },
        ],
        isError: true,
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              id: func.id,
              name: func.name,
              category: func.category || 'uncategorized',
              retries: func.retries,
              handler: typeof func.handler,
            },
            null,
            2,
          ),
        },
      ],
    }
  },

  test_function: async (args: { function_id: string; test_mode?: string }) => {
    const func = allFunctions.find((f) => f.id === args.function_id)

    if (!func) {
      return {
        content: [
          {
            type: 'text',
            text: `Функция ${args.function_id} не найдена`,
          },
        ],
        isError: true,
      }
    }

    // Тестовые данные для разных функций
    const testData: Record<string, any> = {
      'ai-reels-callback': {
        job_id: 'test_job_123',
        status: 'completed',
        metadata: { telegram_id: '123456789' },
      },
      render: {
        telegram_id: '123456789',
        template_id: 'test_template',
        data: { text: 'Test' },
      },
      'model-training-v2': {
        telegram_id: '123456789',
        model_name: 'test_model',
        images: ['https://example.com/img1.jpg', 'https://example.com/img2.jpg'],
        training_type: 'face_model',
      },
    }

    const data = testData[args.function_id] || {
      telegram_id: '123456789',
      test: true,
      mode: args.test_mode || 'basic',
    }

    try {
      const event = {
        name: args.function_id,
        data,
        id: `test_event_${Date.now()}`,
        timestamp: Date.now(),
      }

      const result = await func.handler({
        event,
        step: {
          run: async (name: string, fn: Function) => {
            console.log(`[TEST] Executing step: ${name}`)
            return await fn()
          },
        },
        logger: {
          info: (msg: string, data?: any) => console.log(`[TEST] ${msg}`, data || ''),
          error: (msg: string, data?: any) => console.error(`[TEST] ${msg}`, data || ''),
          warn: (msg: string, data?: any) => console.warn(`[TEST] ${msg}`, data || ''),
        },
      })

      return {
        content: [
          {
            type: 'text',
            text: `✅ Тест функции ${args.function_id} прошел успешно\n\nВходные данные:\n${JSON.stringify(data, null, 2)}\n\nРезультат:\n${JSON.stringify(result, null, 2)}`,
          },
        ],
      }
    } catch (error: any) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Тест функции ${args.function_id} провален:\n\n${error.message}`,
          },
        ],
        isError: true,
      }
    }
  },

  batch_execute: async (args: { functions: Array<{ function_id: string; data?: any }> }) => {
    const results = []

    for (const { function_id, data } of args.functions) {
      const func = allFunctions.find((f) => f.id === function_id)

      if (!func) {
        results.push({
          function_id,
          error: `Функция ${function_id} не найдена`,
        })
        continue
      }

      try {
        const event = {
          name: function_id,
          data: data || { telegram_id: '123456789', batch_test: true },
          id: `batch_event_${Date.now()}_${function_id}`,
          timestamp: Date.now(),
        }

        const result = await func.handler({
          event,
          step: {
            run: async (name: string, fn: Function) => await fn(),
          },
          logger: {
            info: console.log,
            error: console.error,
          },
        })

        results.push({
          function_id,
          success: true,
          result,
        })
      } catch (error: any) {
        results.push({
          function_id,
          success: false,
          error: error.message,
        })
      }
    }

    return {
      content: [
        {
          type: 'text',
          text: `🔄 Batch выполнение завершено\n\n${JSON.stringify(results, null, 2)}`,
        },
      ],
    }
  },
}

// Создаем MCP сервер
const server = createServer(
  {
    name: 'inngest-mcp-server',
    version: '1.0.0',
  },
  {
    tools: {
      listHandler: async () => ({
        tools: tools,
      }),
      callHandler: async (request) => {
        const { name, arguments: args } = request

        const handler = (handlers as any)[name]
        if (!handler) {
          return {
            content: [
              {
                type: 'text',
                text: `Unknown tool: ${name}`,
              },
            ],
            isError: true,
          }
        }

        return await handler(args || {})
      },
    },
  },
)

// Запускаем сервер
async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  console.error('Inngest MCP Server started')
}

main().catch((error) => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
