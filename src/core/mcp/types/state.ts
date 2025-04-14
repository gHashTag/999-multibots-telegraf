import { Task, TaskStatus, AgentStatus, AgentType } from './base';
import { SystemMetrics, AgentMetrics, NetworkMetrics, ResourceMetrics } from './metrics';

export type SystemStatus = 'RUNNING' | 'STOPPED' | 'ERROR';

export interface SystemState {
  status: SystemStatus;
  uptime: number;
  lastError?: Error;
  metrics: SystemMetrics;
  resources: ResourceMetrics;
}

export interface AgentState {
  id: string;
  type: AgentType;
  status: AgentStatus;
  currentTask?: Task;
  taskHistory: Task[];
  metrics: AgentMetrics;
  lastError?: Error;
  lastHealthCheck: number;
}

export interface NetworkState {
  status: 'CONNECTED' | 'DISCONNECTED' | 'DEGRADED';
  connectedAgents: number;
  activeConnections: Map<string, boolean>;
  latencyMap: Map<string, number>;
  routingTable: Map<string, string[]>;
  metrics: NetworkMetrics;
  lastUpdate: number;
}

export interface TaskState {
  id: string;
  status: TaskStatus;
  type: string;
  assignedAgent?: string;
  attempts: number;
  startTime?: number;
  endTime?: number;
  error?: Error;
  result?: any;
}

export interface ResourceState {
  cpuUsage: number;
  memoryUsage: number;
  diskSpace: {
    total: number;
    used: number;
    free: number;
  };
  networkBandwidth: {
    incoming: number;
    outgoing: number;
  };
  loadAverage: number[];
}

export interface GlobalState {
  system: SystemState;
  agents: Map<string, AgentState>;
  network: NetworkState;
  tasks: Map<string, TaskState>;
  resources: ResourceState;
} 