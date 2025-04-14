import { Task, AgentStatus } from './base';
import { AgentConfig } from './config';

export interface NetworkAgent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  config: AgentConfig;
  tasks: Task[];
  metrics: {
    totalTasks: number;
    completedTasks: number;
    failedTasks: number;
    averageTaskDuration: number;
    cpuUsage: number;
    memoryUsage: number;
    lastError?: Error;
    lastHealthCheck: Date;
  };
  
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  processTask(task: Task): Promise<void>;
  getStatus(): AgentStatus;
  
  startHealthCheck(): void;
  stopHealthCheck(): void;
  
  resetAgent(): Promise<void>;
  
  onError(error: Error): void;
  onTaskComplete(task: Task): void;
  
  updateMetrics(): void;
  getMetrics(): NetworkAgent['metrics'];
} 