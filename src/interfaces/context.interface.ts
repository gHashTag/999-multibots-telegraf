import { Context } from 'telegraf'

export interface MyContext extends Context {
  session?: {
    mode?: string
    step?: number
    data?: Record<string, any>
  }
}
