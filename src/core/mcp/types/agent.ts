import { Task } from './base';
import { AgentState } from './state';

export enum AgentStatus {
  IDLE = 'IDLE',
  BUSY = 'BUSY',
  ERROR = 'ERROR',
  OFFLINE = 'OFFLINE',
  INITIALIZING = 'INITIALIZING',
  SHUTTING_DOWN = 'SHUTTING_DOWN'
}

export enum AgentType {
  ROUTER = 'ROUTER',
  EXECUTOR = 'EXECUTOR',
  MONITOR = 'MONITOR',
  SANDBOX = 'SANDBOX'
}

export interface AgentConfig {
  id: string;
  type: AgentType;
  maxTasks: number;
  timeoutMs: number;
  retryAttempts: number;
}

export interface Agent {
  id: string;
  type: AgentType;
  status: AgentStatus;
  state: AgentState;
  
  init(): Promise<void>;
  shutdown(): Promise<void>;
  
  processTask(task: Task): Promise<void>;
  getStatus(): AgentStatus;
  getState(): AgentState;
  
  reset(): Promise<void>;
  pause(): Promise<void>;
  resume(): Promise<void>;
}

export interface NetworkAgent {
  id: string;
  name: string;
  type: AgentType;
  status: AgentStatus;
  capabilities: string[];
  
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  processTask(task: Task): Promise<any>;
  getStatus(): Promise<{healthy: boolean}>;
  
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  ping(): Promise<boolean>;
  
  onMessage(handler: (message: any) => void): void;
  sendMessage(message: any): Promise<void>;
  
  clearErrors(): void;
  isAvailable(): boolean;
}

export interface MonitorAgent extends Agent {
  startMonitoring(): Promise<void>;
  stopMonitoring(): Promise<void>;
  
  getMetrics(): Promise<any>;
  checkHealth(): Promise<boolean>;
  
  setAlertThreshold(metric: string, value: number): void;
  onAlert(handler: (alert: any) => void): void;
}

export interface ExecutorAgent extends Agent {
  execute(code: string, context?: any): Promise<any>;
  abort(): Promise<void>;
  
  getResult(): Promise<any>;
  getError(): Error | null;
  
  cleanup(): Promise<void>;
} 