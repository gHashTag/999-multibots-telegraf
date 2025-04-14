export type LoadBalancingStrategy = 'round-robin' | 'least-loaded' | 'random'

export type AgentType = 'worker' | 'coordinator' | 'router' | 'monitor'

export type AgentStatus = 'IDLE' | 'BUSY' | 'ERROR' | 'OFFLINE'

export type TaskStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'FAILED'
  | 'CANCELLED'

export type SystemStatus = 'RUNNING' | 'STOPPED' | 'ERROR'

export interface Task {
  id: string
  type: string
  data: any
  status: TaskStatus
  assignedAgent?: string
  startTime?: number
  endTime?: number
  error?: Error
  retries: number
}

export interface INetworkAgent {
  id: string
  type: AgentType
  status: AgentStatus
  maxTasks: number
  currentTasks: number
  lastError?: Error
  lastHeartbeat: number
  capabilities: string[]

  initialize(): Promise<void>
  shutdown(): Promise<void>
  processTask(task: Task): Promise<any>
  getStatus(): AgentStatus
  getMetrics(): any
}

export interface IRouter {
  registerAgent(agent: INetworkAgent): void
  unregisterAgent(agentId: string): void
  routeTask(task: Task): Promise<any>
  getAgentById(id: string): INetworkAgent | undefined
  getAgentsByType(type: AgentType): INetworkAgent[]
  getAgentsByStatus(status: AgentStatus): INetworkAgent[]
  startHealthCheck(): void
  stopHealthCheck(): void
  getMetrics(): any
}

export enum TaskType {
  PROCESS = 'PROCESS',
  ANALYZE = 'ANALYZE',
  GENERATE = 'GENERATE',
  EXECUTE = 'EXECUTE',
  CODE_GENERATION = 'CODE_GENERATION',
  CODE_REFACTORING = 'CODE_REFACTORING',
  CODE_ANALYSIS = 'CODE_ANALYSIS',
  TEST_GENERATION = 'TEST_GENERATION',
  DOCUMENTATION = 'DOCUMENTATION',
  DEPENDENCY_MANAGEMENT = 'DEPENDENCY_MANAGEMENT',
  GIT_OPERATIONS = 'GIT_OPERATIONS',
  SELF_IMPROVEMENT = 'SELF_IMPROVEMENT',
  BACKGROUND_IMPROVEMENT = 'BACKGROUND_IMPROVEMENT',
  SUBTASK = 'SUBTASK',
  BOOMERANG = 'BOOMERANG',
  MESSAGE_OWNER = 'MESSAGE_OWNER',
}

export interface Service {
  initialize(): Promise<void>
  shutdown(): Promise<void>
  call(method: string, params: any): Promise<any>
}

export interface Logger {
  info(message: string): void
  error(message: string): void
  warn(message: string): void
  debug(message: string): void
}

export interface Metrics {
  increment(metric: string, value?: number): void
  decrement(metric: string, value?: number): void
  gauge(metric: string, value: number): void
  timing(metric: string, value: number): void
}

export interface Config {
  logLevel: string
  metricsEnabled: boolean
  healthCheckInterval: number
  maxRetries: number
  timeout: number
}

export interface NetworkAgent {
  id: string
  name: string
  type: AgentType
  status: AgentStatus
  capabilities: string[]
  metrics: {
    tasksProcessed: number
    successRate: number
    errorRate: number
    lastError?: Error
  }
  processTask(task: Task): Promise<any>
  isAvailable(): boolean
  getStatus(): Promise<{ healthy: boolean }>
  connect(): Promise<void>
  disconnect(): Promise<void>
  ping(): Promise<void>
}
