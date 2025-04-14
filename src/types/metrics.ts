import { Service } from './service';
import { Task, TaskType } from './base';

export interface SystemMetrics {
  uptime: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  errorRate: number;
  successRate: number;
  taskTypeDistribution: Record<TaskType, number>;
  lastError?: Error;
  lastErrorTimestamp?: number;
}

export interface ResourceMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  diskUsage: number;
  timestamp: Date;
}

export interface PerformanceMetrics {
  timestamp: number;
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  activeConnections: number;
  pendingTasks: number;
  queueLength: number;
}

export interface HealthCheck {
  healthy: boolean;
  message?: string;
  timestamp: Date;
  metrics: SystemMetrics;
}

export interface AgentMetrics {
  totalTasksProcessed: number;
  successfulTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  currentLoad: number;
  peakLoad: number;
  errorRate: number;
  successRate: number;
  lastError?: Error;
  lastErrorTimestamp?: number;
}

export interface NetworkMetrics {
  totalAgents: number;
  activeAgents: number;
  totalTasks: number;
  averageNetworkLatency: number;
  messagesSent: number;
  messagesReceived: number;
  errorRate: number;
  lastError?: Error;
  lastErrorTimestamp?: number;
}

export interface TaskMetrics {
  taskId: string;
  taskType: TaskType;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: string;
  error?: Error;
  retryCount: number;
  agentId: string;
}

export { Service } from './service'; 