export interface SystemMetrics {
  totalTasks: number;
  successfulTasks: number;
  failedTasks: number;
  averageExecutionTime: number;
  uptime: number;
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  errorRate: number;
  successRate: number;
}

export enum AgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
  INITIALIZING = 'initializing',
  TERMINATED = 'terminated'
} 