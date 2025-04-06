import { Context } from 'telegraf'

export interface TestResult {
  name: string
  success: boolean
  message: string
  details?: any
  error?: string
  duration?: number
}

export interface MockContext extends Partial<Context> {
  from?: {
    id: number
  }
  botInfo?: {
    username: string
  }
  reply: (message: string, extra?: any) => Promise<any>
}
