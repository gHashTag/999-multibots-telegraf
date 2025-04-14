/// <reference path="./mcp.d.ts" />
import { Client } from '@modelcontextprotocol/sdk'
import { EventEmitter } from 'events'
import { SystemMetrics } from './metrics'
import { SystemState } from './state'

export interface BotConfig {
  token: string
  mcpServerUrl: string
  mcpApiKey: string
  debug?: boolean
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
  MESSAGE_OWNER = 'MESSAGE_OWNER'
}

export interface Task {
  id: string
  type: string
  data: any
  status: TaskStatus
  assignedAgent?: string
  result?: any
  error?: Error
  startTime?: Date
  endTime?: Date
  attempts: number
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED'
}

export enum AgentStatus {
  IDLE = 'IDLE',
  BUSY = 'BUSY',
  ERROR = 'ERROR',
  OFFLINE = 'OFFLINE'
}

export interface Service extends EventEmitter {
  start(): Promise<void>
  stop(): Promise<void>
  getStatus(): ServiceStatus
  call(method: string, params: any): Promise<any>
}

export interface MCPService extends Service {
  sendMessage(message: any): Promise<void>
  processMessage(message: any): Promise<void>
  getMetrics(): any
}

export interface MCPResponse {
  content: string
  role: string
}

export interface Context {
  message: string
  reply(text: string): Promise<void>
}

export type Handler = (ctx: Context) => Promise<any>

export interface NetworkAgent {
  id: string
  name: string
  type: string
  status: AgentStatus
  metrics: AgentMetrics
  initialize(): Promise<void>
  shutdown(): Promise<void>
  processTask(task: Task): Promise<void>
  getStatus(): AgentStatus
  isAvailable(): boolean
  getMetrics(): AgentMetrics
  on(event: string, listener: (...args: any[]) => void): void
  emit(event: string, ...args: any[]): void
}

export interface CodebaseAnalysisResult {
  components: string[]
  dependencies: string[]
  issues: string[]
  suggestions: string[]
  metrics: {
    complexity: number
    coverage: number
    duplication: number
  }
}

export enum ImprovementType {
  CODE_QUALITY = 'CODE_QUALITY',
  PERFORMANCE = 'PERFORMANCE',
  SECURITY = 'SECURITY',
  DOCUMENTATION = 'DOCUMENTATION',
  TESTING = 'TESTING',
  ARCHITECTURE = 'ARCHITECTURE'
}

export interface ImprovementSuggestion {
  type: ImprovementType
  component: string
  description: string
  priority: number
  effort: number
  impact: number
  code?: string
}

export interface Router {
  agents: Map<string, NetworkAgent>
  tasks: Map<string, Task>
  config: RouterConfig
  
  registerAgent(agent: NetworkAgent): void
  removeAgent(agentId: string): void
  routeTask(task: Task): Promise<void>
  getAgents(): NetworkAgent[]
  getAgentById(id: string): NetworkAgent | undefined
  startHealthCheck(): void
  stopHealthCheck(): void
  getMetrics(): RouterMetrics
  processTask(task: Task): Promise<void>
}

export interface RouterConfig {
  maxRetries: number
  retryDelayMs: number
  loadBalancingStrategy: 'round-robin' | 'least-loaded' | 'random'
  healthCheckIntervalMs: number
}

export interface RouterMetrics {
  totalTasks: number
  completedTasks: number
  failedTasks: number
  averageProcessingTime: number
  activeAgents: number
  taskDistribution: Record<string, number>
}

export enum ServiceStatus {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  ERROR = 'ERROR'
}

export interface AgentMetrics {
  tasksProcessed: number
  successRate: number
  averageProcessingTime: number
  errorRate: number
  lastError?: Error
  status: AgentStatus
}
