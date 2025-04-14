import { LoadBalancingStrategy } from './base'

export interface NetworkConfig {
  id: string
  healthCheckIntervalMs: number
  metricsIntervalMs: number
  maxRetries: number
  timeoutMs: number
  maxConcurrentTasks: number
  resourceThresholds: {
    cpu: number
    memory: number
    network: number
  }
  maxAgents: number
  recoveryTimeoutMs: number
}

export interface AgentConfig {
  id: string
  name: string
  type: string
  maxTasks: number
  timeoutMs: number
  retryAttempts: number
  healthCheckIntervalMs: number
  metricsIntervalMs: number
}

export interface SystemConfig {
  id: string
  logLevel: 'debug' | 'info' | 'warn' | 'error'
  enableMetrics: boolean
  enableHealthCheck: boolean
  enableAutoRecovery: boolean
  maxConcurrentTasks: number
  taskTimeout: number
  retryAttempts: number
  healthCheckInterval: number
  metricsInterval: number
  maxRetries: number
  timeoutMs: number
  maxMemoryUsage: number
  maxCpuUsage: number
}

export interface RouterConfig {
  maxRetries: number
  retryDelayMs: number
  loadBalancingStrategy: LoadBalancingStrategy
  healthCheckIntervalMs: number
  maxConcurrentTasks: number
  taskTimeout: number
}

export interface AutonomousSystemConfig {
  system: SystemConfig
  agent: AgentConfig
  network: NetworkConfig
  router: RouterConfig
}

export interface GlobalConfig {
  system: SystemConfig
  network: NetworkConfig
  agents: AgentConfig[]
}
