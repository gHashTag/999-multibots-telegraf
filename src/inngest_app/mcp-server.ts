#!/usr/bin/env node
/**
 * Inngest MCP Server
 * Provides Model Context Protocol interface for testing Inngest functions
 */

import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import axios from 'axios'

const INNGEST_DEV_URL = process.env.INNGEST_DEV_URL || 'http://127.0.0.1:8288'

interface InngestEvent {
  name: string
  data: Record<string, any>
  user?: Record<string, any>
  ts?: number
}

interface InngestRunStatus {
  id: string
  function_id: string
  status: string
  output?: any
  error?: any
}

class InngestMCPServer {
  private server: Server

  constructor() {
    this.server = new Server(
      {
        name: 'inngest-mcp-server',
        version: '1.0.0',
      },
      {
        capabilities: {
          tools: {},
        },
      }
    )

    this.setupHandlers()
  }

  private setupHandlers() {
    // List available tools
    this.server.setRequestHandler(ListToolsRequestSchema, async () => ({
      tools: [
        {
          name: 'send_event',
          description: 'Send an event to trigger Inngest functions',
          inputSchema: {
            type: 'object',
            properties: {
              name: {
                type: 'string',
                description: 'Event name',
              },
              data: {
                type: 'object',
                description: 'Event data payload',
              },
              user: {
                type: 'object',
                description: 'Optional user context',
              },
            },
            required: ['name', 'data'],
          },
        },
        {
          name: 'list_functions',
          description: 'List all registered Inngest functions',
          inputSchema: {
            type: 'object',
            properties: {},
          },
        },
        {
          name: 'get_run_status',
          description: 'Get the status of a function run',
          inputSchema: {
            type: 'object',
            properties: {
              run_id: {
                type: 'string',
                description: 'Run ID to check',
              },
            },
            required: ['run_id'],
          },
        },
        {
          name: 'poll_run_status',
          description: 'Poll run status until completion',
          inputSchema: {
            type: 'object',
            properties: {
              run_id: {
                type: 'string',
                description: 'Run ID to poll',
              },
              timeout: {
                type: 'number',
                description: 'Timeout in milliseconds (default: 30000)',
              },
            },
            required: ['run_id'],
          },
        },
        {
          name: 'invoke_function',
          description: 'Directly invoke an Inngest function',
          inputSchema: {
            type: 'object',
            properties: {
              function_id: {
                type: 'string',
                description: 'Function ID to invoke',
              },
              data: {
                type: 'object',
                description: 'Input data for the function',
              },
            },
            required: ['function_id', 'data'],
          },
        },
        {
          name: 'get_function_runs',
          description: 'Get recent runs for a specific function',
          inputSchema: {
            type: 'object',
            properties: {
              function_id: {
                type: 'string',
                description: 'Function ID',
              },
              limit: {
                type: 'number',
                description: 'Number of runs to return (default: 10)',
              },
            },
            required: ['function_id'],
          },
        },
      ],
    }))

    // Handle tool calls
    this.server.setRequestHandler(CallToolRequestSchema, async request => {
      const { name, arguments: args } = request.params

      try {
        switch (name) {
          case 'send_event':
            return await this.sendEvent(args as unknown as InngestEvent)

          case 'list_functions':
            return await this.listFunctions()

          case 'get_run_status':
            return await this.getRunStatus(args.run_id as string)

          case 'poll_run_status':
            return await this.pollRunStatus(
              args.run_id as string,
              args.timeout as number
            )

          case 'invoke_function':
            return await this.invokeFunction(
              args.function_id as string,
              args.data as Record<string, any>
            )

          case 'get_function_runs':
            return await this.getFunctionRuns(
              args.function_id as string,
              args.limit as number
            )

          default:
            throw new Error(`Unknown tool: ${name}`)
        }
      } catch (error: any) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                error: error.message,
                stack: error.stack,
              }),
            },
          ],
        }
      }
    })
  }

  private async sendEvent(event: InngestEvent) {
    const response = await axios.post(`${INNGEST_DEV_URL}/e/local`, {
      name: event.name,
      data: event.data,
      user: event.user,
      ts: event.ts || Date.now(),
    })

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            event_id: response.data.ids?.[0],
            status: response.data.status,
          }),
        },
      ],
    }
  }

  private async listFunctions() {
    const response = await axios.get(`${INNGEST_DEV_URL}/v1/functions`)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            functions: response.data.data || response.data,
            count: response.data.data?.length || response.data.length,
          }),
        },
      ],
    }
  }

  private async getRunStatus(runId: string) {
    const response = await axios.get(`${INNGEST_DEV_URL}/v1/runs/${runId}`)

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response.data),
        },
      ],
    }
  }

  private async pollRunStatus(runId: string, timeout: number = 30000) {
    const startTime = Date.now()
    const pollInterval = 1000

    while (Date.now() - startTime < timeout) {
      const response = await axios.get(`${INNGEST_DEV_URL}/v1/runs/${runId}`)
      const status = response.data.status

      if (
        status === 'Completed' ||
        status === 'Failed' ||
        status === 'Cancelled'
      ) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(response.data),
            },
          ],
        }
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval))
    }

    throw new Error(`Timeout waiting for run ${runId} to complete`)
  }

  private async invokeFunction(functionId: string, data: Record<string, any>) {
    // Send event that triggers the function
    const eventName = this.getFunctionEventName(functionId)
    return await this.sendEvent({
      name: eventName,
      data,
    })
  }

  private async getFunctionRuns(functionId: string, limit: number = 10) {
    const response = await axios.get(
      `${INNGEST_DEV_URL}/v1/functions/${functionId}/runs?limit=${limit}`
    )

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            runs: response.data.data || response.data,
            count: response.data.data?.length || response.data.length,
          }),
        },
      ],
    }
  }

  /**
   * Имена событий, на которые функции ДЕЙСТВИТЕЛЬНО подписаны.
   *
   * До правки здесь были неверны ВСЕ ДЕВЯТЬ строк: карта сочиняла красивые
   * имена вида 'render/riddle', 'training/morph', 'payment/process', а функции
   * объявлены через `{ event: 'render-riddle' }`, `'morph/images.requested'`,
   * `'payment/process-ai-server'`. Отправка при этом не давала ошибки —
   * Inngest принимает любое событие и просто не находит подписчика. То есть
   * MCP-сервер не мог запустить ни одну функцию из тех, что перечисляет, и
   * сообщал об успехе.
   *
   * Значения сверены с литералами в `createFunction`. Регрессия закрыта
   * тестом src/__tests__/inngest/event-seams.test.ts: он проверяет, что каждое
   * значение этой карты совпадает с именем, на которое кто-то подписан.
   */
  private getFunctionEventName(functionId: string): string {
    const eventMap: Record<string, string> = {
      // canonical function id -> canonical event (legacy names still listened)
      'reels-ai-callback': 'reels/ai.callback',
      'reels-ai-generate': 'reels/ai.generate',
      'reels-loop-generate': 'reels/loop.generate',
      'render-job-run': 'render/job.run',
      'render-avatar-video-run': 'render/avatar-video.run',
      'render-riddle-run': 'render/riddle.run',
      'training-model-start': 'training/model.start',
      'training-model-v2-start': 'training/model-v2.start',
      'training-model-complete': 'training/model.complete',
      'morph-images-generate': 'morph/images.generate',
      'neuro-image-generate': 'neuro/image.generate',
      'payment-ai-server-process': 'payment/ai-server.process',
      'broadcast-message-send': 'broadcast/message.send',
      'monitoring-error-report': 'monitoring/error.report',
      'monitoring-logs-trigger': 'monitoring/logs.trigger',
      'webhook-generation-validate': 'webhook/generation.validate',
      'welcome-avatar-generate': 'welcome/avatar.generate',
      // legacy aliases (camelCase keys used by older MCP clients)
      'ai-reels-callback': 'reels/ai.callback',
      render: 'render/job.run',
      renderAvatarVideo: 'render/avatar-video.run',
      renderRiddle: 'render/riddle.run',
      modelTrainingV2: 'training/model-v2.start',
      morphImages: 'morph/images.generate',
      neuroImageGeneration: 'neuro/image.generate',
      paymentProcessing: 'payment/ai-server.process',
      broadcastMessage: 'broadcast/message.send',
    }

    return eventMap[functionId] || functionId
  }

  async start() {
    const transport = new StdioServerTransport()
    await this.server.connect(transport)
    console.error('Inngest MCP Server started')
  }
}

// Start the server
const server = new InngestMCPServer()
server.start().catch(error => {
  console.error('Failed to start server:', error)
  process.exit(1)
})
