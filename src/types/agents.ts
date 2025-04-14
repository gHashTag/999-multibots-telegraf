import { Task } from './base'
import { AgentMetrics } from './metrics'

export type AgentType = 
  | 'EXECUTOR'
  | 'ROUTER'
  | 'MONITOR'
  | 'RECOVERY'
  | 'SANDBOX'
  | 'NETWORK'

export interface AgentState {
  id: string
  type: AgentType
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR'
  currentTask?: Task
  metrics: AgentMetrics
  lastError?: Error
  recoveryAttempts: number
}

export interface NetworkAgent {
  id: string
  type: AgentType
  state: AgentState
  processTask(task: Task): Promise<void>
  getMetrics(): AgentMetrics
  reset(): Promise<void>
  shutdown(): Promise<void>
}

export interface AgentFactory {
  createAgent(type: AgentType, id?: string): Promise<NetworkAgent>
}

export interface AgentManager {
  agents: Map<string, NetworkAgent>
  addAgent(agent: NetworkAgent): void
  removeAgent(id: string): void
  getAgent(id: string): NetworkAgent | undefined
  getAgentsByType(type: AgentType): NetworkAgent[]
} 