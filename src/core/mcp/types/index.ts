import { Client } from '@modelcontextprotocol/sdk/client'

export interface BotConfig {
  token: string
  mcpServerUrl: string
  mcpApiKey: string
  debug?: boolean
}

export enum TaskType {
  DEVELOPMENT = 'DEVELOPMENT',
  CODE_REVIEW = 'CODE_REVIEW',
  TESTING = 'TESTING',
  DOCUMENTATION = 'DOCUMENTATION',
  MAINTENANCE = 'MAINTENANCE',
}

export interface Task {
  id: string
  type: TaskType
  description: string
  metadata?: Record<string, any>
  createdAt: Date
  updatedAt: Date
}

export interface Service {
  initialize(): Promise<void>
  close(): Promise<void>
  processTask(prompt: string): Promise<any>
  getClient(): Client
}

export interface Context {
  message: string
  reply(text: string): Promise<void>
}

export type Handler = (ctx: Context) => Promise<any>
