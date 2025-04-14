/**
 * Автономная система агентов
 * Объединяет все компоненты и обеспечивает интеграцию
 */

import { Task, TaskType, TaskStatus, AgentType, AgentStatus, SystemStatus } from '../types/base'
import { SystemMetrics, AgentMetrics, NetworkMetrics, ResourceMetrics, PerformanceMetrics } from '../types/metrics'
import { EventEmitter } from 'events'
import { createAgentNetwork } from './network'
import { createAutonomousRouterAgent } from './router-agent'
import { v4 as uuidv4 } from 'uuid'
import { MCPService } from '../mcp-service'
import { logger } from '../../../logger'
import { closeSandbox } from './tools/e2b-tools'
import { Agent } from '@inngest/agent-kit'
import { createSandboxExecutorAgent } from './specialized/sandbox-executor-agent'
import { NetworkConfig, RouterConfig, SystemConfig } from '../types/config'
import { Router } from './router'
import { AgentNetwork } from './agent-network'
import { Service } from '../types/service'

// Базовые интерфейсы для метрик
export interface BaseMetrics {
  uptime: number
  totalTasks: number
  successfulTasks: number
  failedTasks: number
  errorRate: number
}

export interface ResourceUsage {
  cpuUsage: number
  memoryUsage: number
  diskSpace: {
    total: number
    used: number
    free: number
  }
  networkBandwidth: {
    incoming: number
    outgoing: number
  }
  loadAverage: number[]
}

export interface Performance {
  cpuUsage: number
  memoryUsage: number
  loadAverage: number[]
  responseTime: number
  throughput: number
  concurrentTasks: number
}

export interface SystemMetricsBase extends BaseMetrics {
  taskTypeDistribution: Record<TaskType, number>
  averageProcessingTime: number
  resourceUsage: ResourceUsage
  performance: Performance
}

// Расширенный интерфейс задачи
export interface ExtendedTask extends Task {
  description?: string
  priority?: number
  updated?: Date
}

// Интерфейс для сетевого агента
export interface NetworkAgent extends Service {
  id: string
  type: AgentType
  status: AgentStatus
  name: string
  capabilities: string[]
  lastError?: Error
  lastHealthCheck?: Date
  metrics?: {
    tasksProcessed: number
    successRate: number
    averageProcessingTime: number
    errors: number
  }
  initialize(): Promise<void>
  shutdown(): Promise<void>
  processTask(task: Task): Promise<any>
  getAgentStatus(): Promise<{ status: AgentStatus; healthy: boolean }>
  getMetrics(): Promise<any>
  clearErrors(): void
  isAvailable(): boolean
  getStatus(): AgentStatus
}

// Интерфейс для маршрутизатора
export interface AgentRouter extends Service {
  registerAgent(agent: NetworkAgent): void
  unregisterAgent(agentId: string): void
  routeTask(task: Task): Promise<void>
  startHealthCheck(): void
  stopHealthCheck(): void
  getMetrics(): any
  getAgents(): NetworkAgent[]
}

// Базовый интерфейс для автономной системы
export interface AutonomousSystem extends Service {
  id: string
  mcpService: MCPService
  agents: NetworkAgent[]
  maxConcurrentTasks?: number
  taskTimeout?: number
  metrics: SystemMetricsBase
  router: AgentRouter
  
  initialize(): Promise<void>
  shutdown(): Promise<void>
  addAgent(agent: NetworkAgent): void
  routeTask(task: Task): Promise<void>
  processTask(task: Task): Promise<any>
  getActiveAgents(): NetworkAgent[]
  getPendingTasks(): Task[]
  checkHealth(): Promise<{status: string}>
  getFailedAgents(): Promise<NetworkAgent[]>
  restartAgent(id: string): Promise<void>
  cleanupStaleTasks(): Promise<void>
  ping(): Promise<void>
  getAgents(): NetworkAgent[]
  replaceAgent(id: string, newAgent: NetworkAgent): void
}

// Обновляем SystemMetrics
export interface SystemMetrics {
  uptime: number
  totalTasks: number
  successfulTasks: number
  failedTasks: number
  taskTypeDistribution: Record<TaskType, number>
  averageProcessingTime: number
  errorRate: number
  resourceUsage: {
    cpuUsage: number
    memoryUsage: number
    diskSpace: {
      total: number
      used: number
      free: number
    }
    networkBandwidth: {
      incoming: number
      outgoing: number
    }
    loadAverage: number[]
  }
  performance: {
    cpuUsage: number
    memoryUsage: number
    loadAverage: number[]
    responseTime: number
    throughput: number
    concurrentTasks: number
  }
}

// Обновляем интерфейс NetworkAgent
export interface ExtendedNetworkAgent extends INetworkAgent {
  name: string
  processTask(task: Task): Promise<TaskStatus>
  isAvailable(): boolean
  getStatus(): Promise<{ healthy: boolean }>
  clearErrors(): void
}

// Обновляем Router
export interface Router extends IRouter {
  registerAgent(agent: NetworkAgent): void
  routeTask(task: Task): Promise<void>
  getAgents(): NetworkAgent[]
  getAgentById(id: string): NetworkAgent | undefined
  selectAgent(task: Task): NetworkAgent | undefined
  getNextTask(): Task | undefined
  getNextTaskToProcess(): Task | undefined
  agents: Map<string, NetworkAgent>
  tasks: Map<string, Task>
  config: RouterConfig
  roundRobinIndex: number
}

// Переименовываем интерфейсы чтобы избежать конфликтов
export interface IExtendedNetworkAgent extends ExtendedNetworkAgent {
  name: string;
  processTask(task: Task): Promise<TaskStatus>;
  isAvailable(): boolean;
  getStatus(): Promise<{ healthy: boolean }>;
  clearErrors(): void;
}

export interface IRouter extends Router {
  registerAgent(agent: ExtendedNetworkAgent): void;
  routeTask(task: Task): Promise<void>;
  getAgents(): ExtendedNetworkAgent[];
  getAgentById(id: string): ExtendedNetworkAgent | undefined;
  selectAgent(task: Task): ExtendedNetworkAgent | undefined;
  getNextTask(): Task | undefined;
  getNextTaskToProcess(): Task | undefined;
  agents: Map<string, ExtendedNetworkAgent>;
  tasks: Map<string, Task>;
  config: RouterConfig;
  roundRobinIndex: number;
}

export interface IAgentNetwork {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  addAgent(agent: ExtendedNetworkAgent): void;
  removeAgent(id: string): void;
  routeTask(task: Task): Promise<void>;
  processTask(task: Task): Promise<any>;
  getActiveAgents(): ExtendedNetworkAgent[];
  getPendingTasks(): Task[];
  checkHealth(): Promise<{status: string}>;
  getFailedAgents(): Promise<ExtendedNetworkAgent[]>;
  restartAgent(id: string): Promise<void>;
  cleanupStaleTasks(): Promise<void>;
  ping(): Promise<void>;
  getAgents(): ExtendedNetworkAgent[];
  replaceAgent(id: string, newAgent: ExtendedNetworkAgent): void;
}

// Интерфейс метрик системы
export interface SystemState {
  health: {
    status: 'healthy' | 'degraded' | 'failed'
    lastCheck: Date
    issues: string[]
  }
  performance: {
    taskSuccessRate: number
    averageResponseTime: number
    activeAgents: number
    pendingTasks: number
  }
  resources: {
    cpuUsage: number
    memoryUsage: number
    networkLatency: number
  }
}

// Конфигурация автономной системы
export interface AutonomousSystemConfig {
  id: string
  mcpService: MCPService
  agents?: ExtendedNetworkAgent[]
  maxConcurrentTasks?: number
  taskTimeout?: number
  retryAttempts?: number
  enableScheduler?: boolean
  schedulerIntervalMinutes?: number
  maxIterations?: number
  healthCheckInterval?: number
  autoRecoveryEnabled?: boolean
  resourceThresholds: {
    cpu: number
    memory: number
  }
}

// Интерфейс автономной системы
export interface AutonomousSystem extends EventEmitter {
  router: IRouter;
  agentNetwork: IAgentNetwork;
  services: Map<string, Service>;
  
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  
  addService(name: string, service: Service): void;
  removeService(name: string): void;
  getService(name: string): Service | undefined;
  
  addAgent(agent: IExtendedNetworkAgent): void;
  removeAgent(agentId: string): void;
  getAgent(agentId: string): IExtendedNetworkAgent | undefined;
  
  submitTask(task: Task): Promise<TaskStatus>;
  processTask(task: Task): Promise<TaskStatus>;
  
  getMetrics(): SystemMetrics;
  getAgentMetrics(agentId: string): AgentMetrics;
  getNetworkMetrics(): NetworkMetrics;
}

export interface AgentNetwork {
  initialize(): Promise<void>
  shutdown(): Promise<void>
  addAgent(agent: ExtendedNetworkAgent): void
  routeTask(task: Task): Promise<void>
  processTask(task: Task): Promise<any>
  getActiveAgents(): ExtendedNetworkAgent[]
  getPendingTasks(): Task[]
  checkHealth(): Promise<{status: string}>
  getFailedAgents(): Promise<ExtendedNetworkAgent[]>
  restartAgent(id: string): Promise<void>
  cleanupStaleTasks(): Promise<void>
  ping(): Promise<void>
  getAgents(): ExtendedNetworkAgent[]
  replaceAgent(id: string, newAgent: ExtendedNetworkAgent): void
}

// Обновляем интерфейс метрик системы
export interface ISystemMetrics extends SystemMetrics {
  taskTypeDistribution: Record<TaskType, number>;
  resourceUsage: ResourceMetrics;
  performance: PerformanceMetrics;
}

export class AutonomousSystemImpl extends EventEmitter implements AutonomousSystem {
  private router: IRouter
  private config: Required<AutonomousSystemConfig>
  private isInitialized = false
  private network: IAgentNetwork
  private systemState: SystemState
  private healthCheckInterval: NodeJS.Timeout | null = null
  private metrics: ISystemMetrics = {
    uptime: 0,
    totalTasks: 0,
    successfulTasks: 0,
    failedTasks: 0,
    averageProcessingTime: 0,
    errorRate: 0,
    taskTypeDistribution: Object.values(TaskType).reduce((acc, type) => {
      acc[type] = 0;
      return acc;
    }, {} as Record<TaskType, number>),
    resourceUsage: {
      cpuUsage: 0,
      memoryUsage: 0,
      diskSpace: { total: 0, used: 0, free: 0 },
      networkBandwidth: { incoming: 0, outgoing: 0 },
      loadAverage: []
    },
    performance: {
      cpuUsage: 0,
      memoryUsage: 0,
      loadAverage: [],
      responseTime: 0,
      throughput: 0,
      concurrentTasks: 0
    }
  }
  private tasks: Map<string, Task> = new Map()
  private isRunning = false
  private processingInterval: NodeJS.Timeout | null = null
  private schedulerInterval: NodeJS.Timeout | null = null
  private startTime: Date
  private resourceCheckInterval: NodeJS.Timeout | null
  private readonly services: Map<string, Service>

  constructor(config: Partial<AutonomousSystemConfig> = {}) {
    super()
    
    if (!config.id || !config.mcpService || !config.resourceThresholds) {
      throw new Error('Required configuration parameters missing');
    }

    this.config = {
      id: config.id || `autonomous-system-${uuidv4()}`,
      agents: config.agents || [],
      maxConcurrentTasks: config.maxConcurrentTasks || 5,
      taskTimeout: config.taskTimeout || 300000,
      retryAttempts: config.retryAttempts || 3,
      enableScheduler: config.enableScheduler || true,
      schedulerIntervalMinutes: config.schedulerIntervalMinutes || 5,
      maxIterations: config.maxIterations || 15,
      healthCheckInterval: config.healthCheckInterval || 30000,
      autoRecoveryEnabled: config.autoRecoveryEnabled || true,
      mcpService: config.mcpService,
      resourceThresholds: {
        cpu: config.resourceThresholds?.cpu || 80,
        memory: config.resourceThresholds?.memory || 80
      }
    }

    this.systemState = {
      health: {
        status: 'healthy',
        lastCheck: new Date(),
        issues: []
      },
      performance: {
        taskSuccessRate: 100,
        averageResponseTime: 0,
        activeAgents: 0,
        pendingTasks: 0
      },
      resources: {
        cpuUsage: 0,
        memoryUsage: 0,
        networkLatency: 0
      }
    }

    this.router = createAutonomousRouterAgent()

    // Создаем сеть агентов, передавая routerAgent
    // Создаем объект конфигурации с расширенными свойствами
    const networkConfig: NetworkConfig = {
      id: config.id || `autonomous-system-${uuidv4()}`,
      mcpService: config.mcpService,
      router: this.router,
      maxIterations: config.maxIterations || 15,
    }
    
    // Используем созданную конфигурацию
    this.network = createAgentNetwork(networkConfig)

    // Добавляем базовые агенты В СЕТЬ (не в систему напрямую)
    this.addAgentsToNetwork(config.mcpService);

    // Добавляем агентов из конфигурации, если они есть
    if (this.config.agents.length > 0) {
      console.warn(
        'Warning: Adding agents in constructor may conflict with agents added during initialization'
      )
      this.config.agents.forEach(agent => this.addAgent(agent))
    }

    // Добавляем обработчик для закрытия песочницы при завершении сети
    this.network.on('network_end', async (context: any) => {
      console.log('Network processing finished, attempting to close sandbox...')
      await closeSandbox(context)
    })
    this.network.on('network_error', async (error: Error, context: any) => {
      console.error('Network processing error, attempting to close sandbox...', error)
      await closeSandbox(context)
    })

    // Добавляем обработчики для сбора метрик
    this.on('taskCompleted', (task: Task) => {
      this.metrics.totalTasks++
      if (task.status === TaskStatus.COMPLETED) {
        this.metrics.successfulTasks++
      } else {
        this.metrics.failedTasks++
      }
    })

    this.startTime = new Date()
    this.resourceCheckInterval = null
    this.services = new Map()
  }

  // Вспомогательный метод для добавления стандартных агентов
  private addAgentsToNetwork(mcpService: Service): void {
    try {
      // Добавляем агента самосовершенствования первым
      this.network.addAgent(createSelfImprovementAgent(mcpService))
      
      // Добавляем E2B агента
      this.network.addAgent(createE2BCodingAgent())
      
      // Адаптируем существующие агенты
      this.network.addAgent(
        adaptInngestAgent(
          createCodeGeneratorAgent(mcpService),
          'code-generator',
          [TaskType.CODE_GENERATION, TaskType.CODE_REFACTORING],
          async (task: Task) => task.type === TaskType.CODE_GENERATION
        )
      )
      this.network.addAgent(createMessageAgent())
      this.network.addAgent(createCodeAnalysisAgent())
    } catch (error) {
      console.error('Error adding agents to network:', error)
    }
  }

  // Новый метод для самодиагностики
  private async performHealthCheck(): Promise<void> {
    try {
      const startTime = Date.now()
      
      // Проверяем состояние сети агентов
      const networkHealth = await this.network.checkHealth()
      
      // Проверяем доступность ресурсов
      const resources = await this.checkResources()
      
      // Обновляем состояние системы
      this.systemState.health.lastCheck = new Date()
      this.systemState.resources = resources
      
      // Анализируем метрики
      this.updatePerformanceMetrics()
      
      // Проверяем необходимость восстановления
      if (this.config.autoRecoveryEnabled) {
        await this.attemptRecovery()
      }
      
      const checkDuration = Date.now() - startTime
      logger.debug(`Health check completed in ${checkDuration}ms`)
    } catch (error) {
      logger.error('Health check failed:', error)
      this.systemState.health.status = 'degraded'
      this.systemState.health.issues.push(error.message)
    }
  }

  // Метод для проверки ресурсов
  private async checkResources(): Promise<SystemState['resources']> {
    const resources = await this.getSystemResources()
    
    if (resources.cpuUsage > this.config.resourceThresholds.cpu) {
      logger.warn(`⚠️ High CPU usage: ${resources.cpuUsage}%`)
      await this.optimizeResources()
    }
    
    if (resources.memoryUsage > this.config.resourceThresholds.memory) {
      logger.warn(`⚠️ High memory usage: ${resources.memoryUsage}%`)
      await this.optimizeResources()
    }
    
    // Обновляем состояние системы
    this.systemState.resources = resources
    
    // Обновляем метрики
    this.metrics.cpuUsage = resources.cpuUsage
    this.metrics.memoryUsage = resources.memoryUsage
    
    return resources
  }

  private async getSystemResources(): Promise<SystemState['resources']> {
    const cpuUsage = process.cpuUsage().user / 1000000;
    const memoryUsage = process.memoryUsage().heapUsed / process.memoryUsage().heapTotal * 100;
    const networkLatency = await this.measureNetworkLatency();
    
    return {
      cpuUsage,
      memoryUsage,
      networkLatency
    };
  }

  private async measureNetworkLatency(): Promise<number> {
    try {
      const start = Date.now();
      await this.network.ping();
      return Date.now() - start;
    } catch (error) {
      logger.error('Failed to measure network latency');
      return 0;
    }
  }

  private async optimizeResources(): Promise<void> {
    logger.info('🔄 Optimizing system resources...')
    
    // Очистка неиспользуемых ресурсов
    global.gc && global.gc()
    
    // Перезапуск агентов с высоким потреблением ресурсов
    const agents = this.network.getAgents()
    for (const agent of agents) {
      if (agent.isAvailable()) {
        await this.attemptAgentRecovery(agent)
      }
    }
  }

  private async attemptAgentRecovery(agent: ExtendedNetworkAgent): Promise<void> {
    logger.info(`🔄 Attempting to recover agent ${agent.name}...`)
    
    try {
      // Очистка ошибок
      agent.clearErrors()
      
      // Перезапуск агента если это специализированный агент
      if (agent instanceof NetworkAgentBase) {
        const newAgent = await this.createSpecializedAgent(agent.type)
        if (newAgent) {
          this.network.replaceAgent(agent.id, newAgent)
          logger.info(`✅ Successfully recovered agent ${agent.name}`)
        }
      }
    } catch (err) {
      logger.error(`❌ Failed to recover agent ${agent.name}: ${err}`)
    }
  }

  private async createSpecializedAgent(type: string): Promise<ExtendedNetworkAgent | null> {
    switch (type) {
      case 'sandbox':
        return await createSandboxExecutorAgent()
      // Добавить другие типы агентов
      default:
        return null
    }
  }

  // Метод для обновления метрик производительности
  private updatePerformanceMetrics(): void {
    const totalTasks = this.metrics.totalTasks
    if (totalTasks > 0) {
      this.systemState.performance.taskSuccessRate = 
        (this.metrics.successfulTasks / totalTasks) * 100
    }
    
    this.systemState.performance.activeAgents = this.network.getActiveAgents().length
    this.systemState.performance.pendingTasks = this.network.getPendingTasks().length
  }

  // Метод для автоматического восстановления
  private async attemptRecovery(): Promise<void> {
    if (this.systemState.health.status !== 'healthy') {
      logger.info('Attempting system recovery...')
      
      // Перезапускаем проблемных агентов
      const failedAgents = await this.network.getFailedAgents()
      for (const agent of failedAgents) {
        try {
          await this.network.restartAgent(agent.id)
          logger.info(`Successfully restarted agent ${agent.id}`)
        } catch (error) {
          logger.error(`Failed to restart agent ${agent.id}:`, error)
        }
      }
      
      // Очищаем зависшие задачи
      await this.network.cleanupStaleTasks()
      
      // Проверяем состояние после восстановления
      const healthCheck = await this.network.checkHealth()
      if (healthCheck.status === 'healthy') {
        this.systemState.health.status = 'healthy'
        this.systemState.health.issues = []
        logger.info('System successfully recovered')
      }
    }
  }

  async init(): Promise<void> {
    if (this.isInitialized) {
      return
    }

    // Initialize network
    await this.network.initialize()

    // Запускаем регулярные проверки здоровья
    if (this.config.healthCheckInterval > 0) {
      this.healthCheckInterval = setInterval(
        () => this.performHealthCheck(),
        this.config.healthCheckInterval
      )
    }

    // Add default agents
    const defaultAgents = [
      adaptInngestAgent({
        id: 'default',
        name: 'Default Agent',
        capabilities: ['CODE_GENERATION', 'CODE_ANALYSIS']
      })
    ]

    defaultAgents.forEach(agent => this.addAgent(agent))

    this.startResourceMonitoring()

    this.isInitialized = true
    this.emit('initialized')
  }

  async shutdown(): Promise<void> {
    if (!this.isInitialized) {
      return
    }

    logger.info('🛑 Shutting down autonomous system...')
    
    // Останавливаем проверки здоровья
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = null
    }

    try {
      // Выполняем финальную проверку здоровья
      await this.performHealthCheck()
      
      // Сохраняем метрики перед выключением
      await this.saveMetrics()
      
      logger.info('Final system state:', this.systemState)
    } catch (e) {
      logger.error('Error during shutdown health check:', e)
    }

    await this.network.shutdown()
    this.removeAllListeners()
    this.isInitialized = false
    logger.info('Autonomous system shut down successfully')
  }

  // Метод для сохранения метрик
  private async saveMetrics(): Promise<void> {
    try {
      const metricsData: ISystemMetrics = {
        ...this.metrics,
        uptime: Date.now() - this.startTime.getTime(),
      }
      
      await this.config.mcpService.saveMetrics(metricsData)
      logger.info('System metrics saved successfully')
    } catch (error) {
      logger.error('Failed to save system metrics:', error)
    }
  }

  addAgent(agent: ExtendedNetworkAgent): void {
    if (!this.isInitialized) {
      throw new Error('System not initialized')
    }

    this.network.addAgent(agent)
    this.emit('agentAdded', agent)
  }

  async createTask(
    type: TaskType,
    description: string,
    priority = 1
  ): Promise<ExtendedTask> {
    if (!this.isInitialized) {
      throw new Error('System not initialized')
    }

    const task: ExtendedTask = {
      id: uuidv4(),
      type,
      data: { description },
      status: 'PENDING' as TaskStatus,
      priority,
      created: new Date(),
      updated: new Date(),
      retries: 0
    }

    await this.network.routeTask(task)
    this.emit('taskCreated', task)

    return task
  }

  on(event: string, listener: (...args: any[]) => void): void {
    this.on(event, listener)
  }

  getNetwork(): IAgentNetwork {
    return this.network;
  }

  async processTask(task: Task): Promise<any> {
    console.log(`🚀 Processing task ${task.id}...`)
    
    // Нельзя использовать getState и run, используем processTask
    // который является частью интерфейса
    try {
      console.log(`📋 Начинаем обработку задачи ${task.id}`)
      const result = await this.network.processTask(task)
      console.log(`✅ Task ${task.id} processed. Result:`, result)
      return result
    } catch (error) {
      console.error(`❌ Error processing task ${task.id}:`, error)
      throw error
    }
  }

  private startScheduler(intervalMinutes: number): void {
    if (this.schedulerInterval) {
      return
    }
    const intervalMs = intervalMinutes * 60 * 1000
    console.log(`🕒 Starting scheduler with interval: ${intervalMinutes} minutes`)
    this.schedulerInterval = setInterval(() => {
      console.log('🕰️ Scheduler triggered.')
      this.runScheduledTasks().catch((error) => {
        console.error('❌ Error running scheduled tasks:', error)
      })
    }, intervalMs)
  }

  private stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval)
      this.schedulerInterval = null
      console.log('🛑 Scheduler stopped')
    }
  }

  private async runScheduledTasks(): Promise<void> {
    console.log('⚙️ Running scheduled tasks...')
    try {
      const task = await this.createTask(
        TaskType.SELF_IMPROVEMENT,
        'Perform scheduled system optimization and maintenance.',
        {
          priority: 5,
          scheduledRun: true,
        }
      )
      await this.processTask(task)
    } catch (error) {
      console.error('❌ Error in scheduled task execution:', error)
    }
  }

  /**
   * Запускает автономную работу системы
   */
  public start(): void {
    if (this.isRunning) {
      return
    }

    this.isRunning = true
    logger.info('🚀 Запуск автономной системы')

    this.processingInterval = setInterval(() => {
      this.processPendingTasks()
    }, 5000) // Проверяем задачи каждые 5 секунд
  }

  /**
   * Останавливает автономную работу
   */
  public stop(): void {
    if (!this.isRunning) {
      return  
    }

    this.isRunning = false
    if (this.processingInterval) {
      clearInterval(this.processingInterval)
      this.processingInterval = null
    }

    logger.info('🛑 Остановка автономной системы')
  }

  /**
   * Обрабатывает ожидающие задачи
   */
  private async processPendingTasks(): Promise<void> {
    const pendingTasks = Array.from(this.tasks.values())
      .filter(task => task.status === TaskStatus.PENDING)
      .sort((a, b) => b.priority - a.priority)

    for (const task of pendingTasks) {
      try {
        task.status = TaskStatus.IN_PROGRESS
        task.updated = new Date()
        
        logger.info('⚡ Начало выполнения задачи:', { taskId: task.id, type: task.type })
        
        // Выполняем задачу в зависимости от типа
        switch (task.type) {
          case TaskType.SELF_IMPROVEMENT:
            await this.handleSelfImprovement(task)
            break
            
          case TaskType.CODE_GENERATION:
            await this.handleCodeGeneration(task)
            break
            
          case TaskType.CODE_ANALYSIS:
            await this.handleCodeAnalysis(task)
            break
            
          case TaskType.CODE_REFACTORING:
            await this.handleCodeRefactoring(task)
            break
            
          case TaskType.TESTING:
            await this.handleTesting(task)
            break
        }

        task.status = TaskStatus.COMPLETED
        task.updated = new Date()
        
        logger.info('✅ Задача выполнена успешно:', { taskId: task.id })
        this.emit('taskCompleted', task)
        
      } catch (error) {
        task.status = TaskStatus.FAILED
        task.updated = new Date()
        
        logger.error('❌ Ошибка при выполнении задачи:', {
          taskId: task.id,
          error: error instanceof Error ? error.message : String(error)
        })
        
        this.emit('taskFailed', task, error)
      }
    }
  }

  /**
   * Обработчики для разных типов задач
   */
  private async handleSelfImprovement(task: Task): Promise<void> {
    // TODO: Реализовать логику самоулучшения
    logger.info('🔄 Выполняется задача самоулучшения:', { taskId: task.id })
  }

  private async handleCodeGeneration(task: Task): Promise<void> {
    // TODO: Реализовать логику генерации кода
    logger.info('💻 Выполняется задача генерации кода:', { taskId: task.id })
  }

  private async handleCodeAnalysis(task: Task): Promise<void> {
    // TODO: Реализовать логику анализа кода
    logger.info('🔍 Выполняется задача анализа кода:', { taskId: task.id })
  }

  private async handleCodeRefactoring(task: Task): Promise<void> {
    // TODO: Реализовать логику рефакторинга
    logger.info('🔧 Выполняется задача рефакторинга:', { taskId: task.id })
  }

  private async handleTesting(task: Task): Promise<void> {
    // TODO: Реализовать логику тестирования
    logger.info('🧪 Выполняется задача тестирования:', { taskId: task.id })
  }

  /**
   * Получает все задачи
   */
  public getTasks(): Task[] {
    return Array.from(this.tasks.values())
  }

  /**
   * Получает задачу по ID
   */
  public getTaskById(id: string): Task | undefined {
    return this.tasks.get(id)
  }

  /**
   * Удаляет задачу по ID
   */
  public deleteTask(id: string): boolean {
    return this.tasks.delete(id)
  }

  /**
   * Очищает все задачи
   */
  public clearTasks(): void {
    this.tasks.clear()
  }

  private startResourceMonitoring(): void {
    if (this.resourceCheckInterval) {
      clearInterval(this.resourceCheckInterval)
    }
    
    this.resourceCheckInterval = setInterval(async () => {
      await this.checkResources()
    }, 5000) // Каждые 5 секунд
  }

  getMetrics(): SystemMetrics {
    return { ...this.metrics }
  }

  private async handleError(error: unknown): Promise<void> {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(errorMessage);
    this.systemState.health.issues.push(errorMessage);
  }

  private async logWithContext(level: keyof typeof logger, message: string, context?: Record<string, unknown>): Promise<void> {
    if (context) {
      this.logger[level](message, JSON.stringify(context))
    } else {
      this.logger[level](message)
    }
  }
}

// Функция для создания и настройки автономной системы
export function createAutonomousSystem(
  config: AutonomousSystemConfig
): AutonomousSystem {
  console.log('🔧 Creating Autonomous System...')
  const system = new AutonomousSystemImpl(config)
  console.log('✅ Autonomous System created.')
  return system
}

function generateTaskId(): string {
  return Math.random().toString(36).substring(7);
}

function createRouter(): IRouter {
  // Implement router creation
  return {} as IRouter; // TODO: implement actual router creation
}

// Re-export types
export { Task, TaskType, TaskStatus };
export type { IExtendedNetworkAgent as NetworkAgent };
