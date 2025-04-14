export interface SystemMetrics {
  totalTasks: number
  successfulTasks: number
  failedTasks: number
  averageExecutionTime: number
  uptime: number
}

export enum TaskType {
  SELF_IMPROVEMENT = 'SELF_IMPROVEMENT',
  CODE_GENERATION = 'CODE_GENERATION',
  CODE_ANALYSIS = 'CODE_ANALYSIS',
  CODE_REFACTORING = 'CODE_REFACTORING',
  TESTING = 'TESTING'
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export interface Task {
  id: string
  type: TaskType
  description: string
  status: TaskStatus
  priority: number
  created: Date
  updated: Date
  dependencies?: string[]
  metadata?: Record<string, any>
} 