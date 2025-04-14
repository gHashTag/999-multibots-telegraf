import { EventEmitter } from 'events'
import { BaseNetworkAgent } from './network-agent'
import { Task, TaskType, TaskStatus, AgentStatus } from '../types/base'
import { NetworkMetrics, AgentMetrics } from '../types/metrics'
import { NetworkState } from '../types/state'
import { NetworkConfig } from '../types/config'
import { logger } from '../../../logger'

export interface NetworkAgent {
  id: string;
  name: string;
  type: string;
  status: AgentStatus;
  processTask(task: Task): Promise<any>;
  isAvailable(): boolean;
  getMetrics(): AgentMetrics;
  reset(): Promise<void>;
  shutdown(): Promise<void>;
}

export interface AgentNetwork {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  addAgent(agent: NetworkAgent): void;
  removeAgent(id: string): void;
  routeTask(task: Task): Promise<void>;
  processTask(task: Task): Promise<any>;
  getActiveAgents(): NetworkAgent[];
  getPendingTasks(): Task[];
  checkHealth(): Promise<{status: string}>;
  getFailedAgents(): Promise<NetworkAgent[]>;
  restartAgent(id: string): Promise<void>;
  cleanupStaleTasks(): Promise<void>;
  ping(): Promise<void>;
  getAgents(): NetworkAgent[];
}

export class BaseAgentNetwork extends EventEmitter implements AgentNetwork {
  private agentsMap: Map<string, NetworkAgent>;
  private pendingTasks: Task[];
  private config: NetworkConfig;
  private state: NetworkState;
  private metrics: NetworkMetrics;
  private healthCheckInterval: NodeJS.Timeout | null;

  constructor(config: NetworkConfig) {
    super();
    this.agentsMap = new Map();
    this.pendingTasks = [];
    this.config = config;
    this.healthCheckInterval = null;
    
    this.state = {
      status: 'HEALTHY',
      metrics: {
        totalAgents: 0,
        activeAgents: 0,
        idleAgents: 0,
        errorAgents: 0,
        averageResponseTime: 0,
        totalTasksProcessed: 0,
        taskSuccessRate: 0,
        networkLatency: 0,
        lastUpdate: Date.now()
      },
      agents: new Map(),
      lastUpdate: Date.now(),
      errors: []
    };

    this.metrics = {
      totalAgents: 0,
      activeAgents: 0,
      idleAgents: 0,
      errorAgents: 0,
      averageResponseTime: 0,
      totalTasksProcessed: 0,
      taskSuccessRate: 0,
      networkLatency: 0,
      lastUpdate: Date.now()
    };
  }

  public getAgents(): NetworkAgent[] {
    return Array.from(this.agentsMap.values());
  }

  async initialize(): Promise<void> {
    logger.info('🚀 Initializing agent network...');
    this.startHealthCheck();
  }

  async shutdown(): Promise<void> {
    logger.info('🛑 Shutting down agent network...');
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    
    for (const agent of this.agentsMap.values()) {
      await agent.shutdown();
    }
    
    this.agentsMap.clear();
    this.pendingTasks = [];
  }

  addAgent(agent: NetworkAgent): void {
    this.agentsMap.set(agent.id, agent);
    this.state.agents.set(agent.id, {
      id: agent.id,
      status: 'IDLE',
      metrics: agent.getMetrics(),
      lastHeartbeat: Date.now(),
      recoveryAttempts: 0
    });
    this.metrics.totalAgents = this.agentsMap.size;
    this.emit('agentAdded', agent);
  }

  removeAgent(id: string): void {
    this.agentsMap.delete(id);
    this.state.agents.delete(id);
    this.metrics.totalAgents = this.agentsMap.size;
    this.emit('agentRemoved', id);
  }

  async routeTask(task: Task): Promise<void> {
    this.pendingTasks.push(task);
    this.metrics.totalTasksProcessed++;
    this.emit('taskRouted', task);
  }

  async processTask(task: Task): Promise<any> {
    const agent = this.selectAgentForTask(task);
    if (!agent) {
      throw new Error('No available agent for task');
    }
    return agent.processTask(task);
  }

  getActiveAgents(): NetworkAgent[] {
    return this.getAgents().filter(agent => agent.isAvailable());
  }

  getPendingTasks(): Task[] {
    return [...this.pendingTasks];
  }

  async checkHealth(): Promise<{status: string}> {
    const activeAgents = this.getActiveAgents().length;
    this.metrics.activeAgents = activeAgents;
    
    return {
      status: activeAgents > 0 ? 'healthy' : 'degraded'
    };
  }

  async getFailedAgents(): Promise<NetworkAgent[]> {
    return this.getAgents().filter(agent => agent.status === AgentStatus.ERROR);
  }

  async restartAgent(id: string): Promise<void> {
    const agent = this.agentsMap.get(id);
    if (agent) {
      await agent.reset();
    }
  }

  async cleanupStaleTasks(): Promise<void> {
    this.pendingTasks = this.pendingTasks.filter(task => 
      task.status !== TaskStatus.COMPLETED && 
      task.status !== TaskStatus.FAILED
    );
  }

  async ping(): Promise<void> {
    this.emit('ping');
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      return;
    }
    
    this.healthCheckInterval = setInterval(async () => {
      await this.checkHealth();
    }, this.config.healthCheckIntervalMs);
  }

  private selectAgentForTask(task: Task): NetworkAgent | undefined {
    return this.getActiveAgents().find(agent => agent.isAvailable());
  }
}

export function createAgentNetwork(config: NetworkConfig): AgentNetwork {
  return new BaseAgentNetwork(config);
} 