import { Context } from 'telegraf'
import { MyContext } from '@/interfaces'

export interface TestResult {
  name: string
  success: boolean
  message: string
  details?: any
  error?: string
  duration?: number
  context?: MyContext
}

