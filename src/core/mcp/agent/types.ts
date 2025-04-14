import { Task } from '../types'

/**
 * Интерфейс сетевого агента
 */
export interface NetworkAgent {
  id: string
  name: string
  description: string
  capabilities: string[]
  canHandle: (task: Task) => Promise<boolean>
  handle: (task: Task) => Promise<any>
  cleanup?: () => Promise<void>
} 