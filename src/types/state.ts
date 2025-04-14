import { SystemMetrics, AgentMetrics, NetworkMetrics } from './metrics'
import { Task } from './base'

export type SystemStatus = 'INITIALIZING' | 'RUNNING' | 'DEGRADED' | 'ERROR' | 'SHUTDOWN'

export interface SystemState {
  status: SystemStatus
  metrics: SystemMetrics
  lastUpdate: number
  pendingTasks: Task[]
  activeTasks: Task[]
  completedTasks: Task[]
  failedTasks: Task[]
}

export interface AgentState {
  id: string
  status: 'IDLE' | 'BUSY' | 'ERROR' | 'OFFLINE'
  metrics: AgentMetrics
  currentTask?: Task
  lastHeartbeat: number
  recoveryAttempts: number
  lastError?: Error
  lastErrorTimestamp?: number
}

export interface NetworkState {
  status: 'HEALTHY' | 'DEGRADED' | 'ERROR'
  metrics: NetworkMetrics
  agents: Map<string, AgentState>
  lastUpdate: number
  lastError?: Error
  lastErrorTimestamp?: number
}

export interface AutonomiousSystemState {
  system: SystemState
  network: NetworkState
  lastUpdate: number
  isAutoRecoveryEnabled: boolean
  isMetricsEnabled: boolean
  isHealthCheckEnabled: boolean
} 