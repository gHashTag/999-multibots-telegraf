export interface SystemMetrics {
  totalTasks: number
  successfulTasks: number
  failedTasks: number
  averageExecutionTime: number
  uptime: number
  cpuUsage: number
  memoryUsage: number
  networkLatency: number
  errorRate: number
  successRate: number
  lastError?: Error
  lastErrorTime?: Date
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

export enum AgentStatus {
  IDLE = 'IDLE',
  BUSY = 'BUSY',
  ERROR = 'ERROR',
  OFFLINE = 'OFFLINE'
}

export interface NetworkAgent {
  id: string
  name: string
  type: string
  status: AgentStatus
  capabilities: TaskType[]
  lastActive: Date
  errors: Error[]
  
  processTask(task: Task): Promise<any>
  getStatus(): Promise<{
    healthy: boolean
    lastActive: Date
    errors: string[]
  }>
  isAvailable(): boolean
  getErrors(): Error[]
  clearErrors(): void
}

export interface AgentNetwork {
  agents: NetworkAgent[]
  addAgent(agent: NetworkAgent): void
  removeAgent(agentId: string): void
  getAgent(agentId: string): NetworkAgent | undefined
  broadcastTask(task: Task): Promise<any[]>
  initialize(): Promise<void>
  shutdown(): Promise<void>
  routeTask(task: Task): Promise<void>
  processTask(task: Task): Promise<any>
  getActiveAgents(): NetworkAgent[]
  getPendingTasks(): Task[]
  checkHealth(): Promise<{status: string}>
  getFailedAgents(): Promise<NetworkAgent[]>
  restartAgent(id: string): Promise<void>
  cleanupStaleTasks(): Promise<void>
  ping(): Promise<void>
}

export interface AutonomousSystemConfig {
  id: string
  mcpService: any
  agents?: NetworkAgent[]
  maxConcurrentTasks?: number
  taskTimeout?: number
  retryAttempts?: number
  enableScheduler?: boolean
  schedulerIntervalMinutes?: number
  maxIterations?: number
  healthCheckInterval?: number
  autoRecoveryEnabled?: boolean
  resourceThresholds?: {
    cpu: number
    memory: number
    errorRate: number
  }
} 