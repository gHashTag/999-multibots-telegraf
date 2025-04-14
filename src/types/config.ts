import { Service } from './service';
import { LogLevel } from './base';

export interface SystemConfig {
  healthCheckInterval: number;
  metricsInterval: number;
  maxRetries: number;
  timeoutMs: number;
  maxConcurrentTasks: number;
  maxMemoryUsage: number;
  maxCpuUsage: number;
  logLevel: LogLevel;
}

export interface AgentConfig {
  id: string;
  name: string;
  type: string;
  maxTasks: number;
  timeoutMs: number;
  retryAttempts: number;
  healthCheckInterval?: number;
  metricsInterval?: number;
}

export interface NetworkConfig {
  maxAgents: number;
  healthCheckIntervalMs: number;
  metricsIntervalMs: number;
  recoveryTimeoutMs: number;
  maxReconnectAttempts?: number;
  reconnectDelayMs?: number;
}

export interface AutonomousSystemConfig {
  system: SystemConfig;
  agent: AgentConfig;
  network: NetworkConfig;
  enableMetrics?: boolean;
  enableHealthCheck?: boolean;
  enableAutoRecovery?: boolean;
  debugMode?: boolean;
  enableAutoScaling: boolean;
  enableMetricsCollection: boolean;
  mcpService: Service;
  resourceThresholds: {
    cpu: number;
    memory: number;
  };
} 