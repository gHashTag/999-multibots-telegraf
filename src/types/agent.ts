import { Task, TaskType } from './base';

export enum AgentStatus {
  IDLE = 'idle',
  BUSY = 'busy',
  ERROR = 'error',
  INITIALIZING = 'initializing',
  TERMINATED = 'terminated',
  OFFLINE = 'offline'
}

export interface NetworkAgent {
  id: string;
  name: string;
  type?: string;
  capabilities: string[];
  processTask(task: Task): Promise<any>;
  getStatus(): Promise<{healthy: boolean}>;
  isAvailable(): boolean;
  getErrors?(): Error[];
  clearErrors?(): void;
  reset?(): void;
  measureLatency?(): Promise<number>;
}

export interface AgentNetwork {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  addAgent(agent: NetworkAgent): void;
  routeTask(task: Task): Promise<void>;
  processTask(task: Task): Promise<any>;
  getActiveAgents(): NetworkAgent[];
  getPendingTasks(): Task[];
  checkHealth(): Promise<{status: string}>;
  getFailedAgents(): Promise<NetworkAgent[]>;
  restartAgent(id: string): Promise<void>;
  cleanupStaleTasks(): Promise<void>;
  ping(): Promise<void>;
  startHealthCheck(): void;
  stopHealthCheck(): void;
  getNetworkStatus(): { total: number; healthy: number; error: number };
}

export interface Task {
  id: string;
  type: TaskType;
  data: any;
  priority?: number;
  deadline?: Date;
}

export enum TaskType {
  PROCESS = 'process',
  ANALYZE = 'analyze',
  GENERATE = 'generate',
  TRANSFORM = 'transform'
}

export interface Agent<T = any> {
  process(data: T): Promise<void>;
  getState(): any;
} 