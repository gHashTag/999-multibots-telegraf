// Base types for autonomous system
export type TaskStatus = 'PENDING' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

export type TaskType = 
  | 'CODE_ANALYSIS'
  | 'CODE_GENERATION' 
  | 'CODE_REVIEW'
  | 'DEBUGGING'
  | 'TESTING'
  | 'DOCUMENTATION'
  | 'OPTIMIZATION'
  | 'REFACTORING'

export type TaskPriority = 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL'

export interface Task {
  id: string;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  error?: Error;
  retryCount: number;
  maxRetries: number;
  timeoutMs: number;
  data: any;
  result?: any;
}

export interface TaskResult {
  taskId: string;
  success: boolean;
  data?: any;
  error?: Error;
  duration: number;
}

export interface SystemEvent {
  type: string;
  timestamp: Date;
  data: any;
  source: string;
}

export interface Service {
  name: string;
  initialize(): Promise<void>;
  close(): Promise<void>;
  call(method: string, params: any): Promise<any>;
  saveMetrics(metrics: any): Promise<void>;
}

export interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: number;
  networkLatency: number;
  activeAgents: number;
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  averageTaskDuration: number;
  errorRate: number;
  successRate: number;
  lastError?: Error;
  lastHealthCheck: Date;
}

export enum AgentStatus {
  INITIALIZING = 'INITIALIZING',
  READY = 'READY',
  BUSY = 'BUSY',
  ERROR = 'ERROR',
  SHUTDOWN = 'SHUTDOWN'
}

export interface Logger {
  info(message: string, ...args: any[]): void;
  warn(message: string, ...args: any[]): void;
  error(message: string, error?: Error, ...args: any[]): void;
  debug(message: string, ...args: any[]): void;
}

export interface BaseConfig {
  id: string;
  name: string;
  version: string;
  logLevel: string;
}

export interface ResourceThresholds {
  maxCpuUsage: number;
  maxMemoryUsage: number;
  maxNetworkLatency: number;
}

export interface StateData {
  tasks: Task[];
  metrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageExecutionTime: number;
  };
}

export interface AgentCapability {
  taskType: TaskType;
  priority: TaskPriority;
  maxConcurrentTasks: number;
  timeoutMs: number;
  retryAttempts: number;
}

export interface Agent {
  id: string;
  name: string;
  capabilities: AgentCapability[];
  maxTasks: number;
  currentTasks: number;
}

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';

export interface LogEntry {
  timestamp: number;
  level: LogLevel;
  message: string;
  data?: any;
} 