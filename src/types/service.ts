import { SystemMetrics } from './base';

export interface Service {
  name: string;
  initialize(): Promise<void>;
  close(): Promise<void>;
  call(method: string, params: any): Promise<any>;
  saveMetrics(metrics: SystemMetrics): Promise<void>;
}

export interface ServiceConfig {
  name: string;
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
  maxConcurrentCalls?: number;
}

export interface ServiceMetrics {
  totalCalls: number;
  successfulCalls: number;
  failedCalls: number;
  averageResponseTime: number;
  lastError?: Error;
  uptime: number;
}

export interface ServiceStatus {
  healthy: boolean;
  message?: string;
  lastCheck: Date;
  metrics: ServiceMetrics;
} 