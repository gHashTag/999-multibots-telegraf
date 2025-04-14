import { EventEmitter } from 'events';
import { Task, TaskType, TaskStatus, AgentType, AgentStatus } from './base';

export interface Service extends EventEmitter {
  call(prompt: string): Promise<any>;
  initialize?(): Promise<void>;
  shutdown?(): Promise<void>;
}

export interface SystemMetrics {
  uptime: number;
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  completedTasks: number;
  averageExecutionTime: number;
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  taskTypeDistribution: Record<TaskType, number>;
  resourceUsage: ResourceMetrics;
  performance: PerformanceMetrics;
}

export interface AgentMetrics {
  id: string;
  type: AgentType;
  status: AgentStatus;
  totalTasksProcessed: number;
  successfulTasks: number;
  failedTasks: number;
  averageProcessingTime: number;
  currentLoad: number;
  errorRate: number;
  lastError?: Error;
  uptime: number;
  tasksProcessed: number;
  successRate: number;
}

export interface NetworkMetrics {
  totalAgents: number;
  activeAgents: number;
  totalConnections: number;
  activeConnections: number;
  averageResponseTime: number;
  routingEfficiency: number;
}

export interface PerformanceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  loadAverage: number[];
  responseTime: number;
  throughput: number;
  concurrentTasks: number;
}

export interface ResourceMetrics {
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

export interface TaskMetrics {
  id: string;
  type: TaskType;
  status: string;
  startTime: number;
  endTime: number;
  duration: number;
  retries: number;
  assignedAgent: string;
  error?: Error;
}

export interface RouterMetrics {
  totalTasks: number;
  activeTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageProcessingTime: number;
  taskDistribution: Record<string, number>;
  agentLoad: Record<string, number>;
  routingStrategy: string;
  healthCheckStatus: Record<string, boolean>;
}

export interface RouterConfig {
  maxRetries: number;
  retryDelayMs: number;
  loadBalancingStrategy: 'round-robin' | 'least-loaded' | 'random';
  healthCheckIntervalMs: number;
} 