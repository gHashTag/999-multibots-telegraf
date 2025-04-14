/// <reference types="node" />

import { Sandbox } from '@e2b/sdk'
import { logger } from '../../../logger'
import { EventEmitter } from 'events'
import { performance } from 'perf_hooks'

interface SandboxMetrics {
  totalTasks: number
  successfulTasks: number
  failedTasks: number
  averageExecutionTime: number
  lastError?: Error
  cpuUsage: number
  memoryUsage: number
  activeProcesses: number
}

interface SandboxState {
  isHealthy: boolean
  lastHealthCheck: number
  recoveryAttempts: number
}

class SandboxManager extends EventEmitter {
  private static instance: SandboxManager
  private sandbox?: Sandbox
  private metrics: SandboxMetrics
  private state: SandboxState
  private healthCheckInterval?: NodeJS.Timeout
  private metricsInterval?: NodeJS.Timeout

  private constructor() {
    super()
    this.metrics = {
      totalTasks: 0,
      successfulTasks: 0,
      failedTasks: 0,
      averageExecutionTime: 0,
      cpuUsage: 0,
      memoryUsage: 0,
      activeProcesses: 0,
    }
    this.state = {
      isHealthy: false,
      lastHealthCheck: 0,
      recoveryAttempts: 0,
    }
  }

  public static getInstance(): SandboxManager {
    if (!SandboxManager.instance) {
      SandboxManager.instance = new SandboxManager()
    }
    return SandboxManager.instance
  }

  public async initialize(apiKey: string): Promise<void> {
    try {
      if (!apiKey) {
        throw new Error('API key is required')
      }

      this.sandbox = await Sandbox.create({ apiKey })
      this.state.isHealthy = true
      this.startHealthCheck()
      this.startMetricsCollection()

      logger.info('🚀 Sandbox initialized successfully')
    } catch (error) {
      logger.error('❌ Failed to initialize sandbox:', error)
      throw error
    }
  }

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }

    this.healthCheckInterval = setInterval(async () => {
      try {
        await this.checkHealth()
      } catch (error) {
        logger.error('❌ Health check failed:', error)
      }
    }, 30000) // Check every 30 seconds
  }

  private startMetricsCollection(): void {
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
    }

    this.metricsInterval = setInterval(async () => {
      try {
        await this.collectMetrics()
      } catch (error) {
        logger.error('❌ Metrics collection failed:', error)
      }
    }, 5000) // Collect every 5 seconds
  }

  private async checkHealth(): Promise<void> {
    if (!this.sandbox) {
      this.state.isHealthy = false
      return
    }

    try {
      // Perform a simple command to check sandbox health
      await this.sandbox.run('echo "health check"')
      this.state.isHealthy = true
      this.state.lastHealthCheck = Date.now()
      this.state.recoveryAttempts = 0
    } catch (error) {
      this.state.isHealthy = false
      logger.error('❌ Sandbox health check failed:', error)
      await this.attemptRecovery()
    }
  }

  private async collectMetrics(): Promise<void> {
    if (!this.sandbox) return

    try {
      const processes = await this.sandbox.run('ps aux | wc -l')
      const memory = await this.sandbox.run(
        "free -m | grep Mem | awk '{print $3/$2 * 100}'"
      )
      const cpu = await this.sandbox.run(
        'top -bn1 | grep "Cpu(s)" | awk \'{print $2}\''
      )

      this.metrics.activeProcesses = parseInt(processes.stdout) - 1
      this.metrics.memoryUsage = parseFloat(memory.stdout)
      this.metrics.cpuUsage = parseFloat(cpu.stdout)

      if (this.metrics.memoryUsage > 80 || this.metrics.cpuUsage > 80) {
        logger.warn('⚠️ High resource usage detected')
        await this.optimizeResources()
      }
    } catch (error) {
      logger.error('❌ Failed to collect metrics:', error)
    }
  }

  private async optimizeResources(): Promise<void> {
    if (!this.sandbox) return

    try {
      // Clean up temporary files
      await this.sandbox.run('rm -rf /tmp/*')

      // Kill any hung processes
      await this.sandbox.run('killall -9 node || true')

      logger.info('✨ Resources optimized')
    } catch (error) {
      logger.error('❌ Failed to optimize resources:', error)
    }
  }

  private async attemptRecovery(): Promise<void> {
    this.state.recoveryAttempts++

    if (this.state.recoveryAttempts > 3) {
      logger.error('❌ Maximum recovery attempts reached')
      this.emit('maxRecoveryAttemptsReached')
      return
    }

    try {
      await this.sandbox?.close()
      this.sandbox = await Sandbox.create({
        apiKey: process.env.E2B_API_KEY || '',
      })
      this.state.isHealthy = true
      logger.info('✅ Sandbox recovered successfully')
    } catch (error) {
      logger.error('❌ Recovery attempt failed:', error)
      this.emit('recoveryFailed', error)
    }
  }

  public async executeCommand(
    command: string
  ): Promise<{ stdout: string; stderr: string }> {
    if (!this.sandbox || !this.state.isHealthy) {
      throw new Error('Sandbox is not initialized or unhealthy')
    }

    const startTime = performance.now()
    this.metrics.totalTasks++

    try {
      const result = await this.sandbox.run(command)
      this.metrics.successfulTasks++

      const executionTime = performance.now() - startTime
      this.metrics.averageExecutionTime =
        (this.metrics.averageExecutionTime *
          (this.metrics.successfulTasks - 1) +
          executionTime) /
        this.metrics.successfulTasks

      return result
    } catch (error) {
      this.metrics.failedTasks++
      this.metrics.lastError = error as Error
      throw error
    }
  }

  public async cleanup(): Promise<void> {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
    }
    if (this.metricsInterval) {
      clearInterval(this.metricsInterval)
    }

    try {
      await this.sandbox?.close()
      logger.info('✨ Sandbox cleaned up successfully')
    } catch (error) {
      logger.error('❌ Failed to cleanup sandbox:', error)
      throw error
    }
  }

  public getMetrics(): SandboxMetrics {
    return { ...this.metrics }
  }

  public getState(): SandboxState {
    return { ...this.state }
  }
}

export { SandboxManager, SandboxMetrics, SandboxState }

export const e2bCodingAgent = {
  description: 'Expert coding agent capable of writing and executing code.',
  capabilities: ['code_generation', 'code_refactoring'] as const,
  tools: {
    terminal: {
      description: 'Execute terminal commands in the sandbox',
      handler: async ({ command }: { command: string }) => {
        const startTime = Date.now()
        try {
          const sandbox = await SandboxManager.getInstance().getSandbox()
          const process = await sandbox.process.start({
            cmd: command,
          })
          const output = await process.wait()

          SandboxManager.getInstance().updateMetrics(
            Date.now() - startTime,
            true
          )

          return {
            success: true,
            output:
              output.stdout +
              (output.stderr ? `\nError: ${output.stderr}` : ''),
          }
        } catch (err) {
          const error = err as Error
          log.error('Failed to execute terminal command:', error)

          SandboxManager.getInstance().updateMetrics(
            Date.now() - startTime,
            false
          )

          return { success: false, error: error.message }
        }
      },
    },
    createOrUpdateFiles: {
      description: 'Create or update files in the sandbox',
      handler: async ({
        files,
      }: {
        files: { path: string; content: string }[]
      }) => {
        const startTime = Date.now()
        try {
          const sandbox = await SandboxManager.getInstance().getSandbox()
          for (const file of files) {
            await sandbox.filesystem.write(file.path, file.content)
          }

          SandboxManager.getInstance().updateMetrics(
            Date.now() - startTime,
            true
          )

          return { success: true }
        } catch (err) {
          const error = err as Error
          log.error('Failed to create/update files:', error)

          SandboxManager.getInstance().updateMetrics(
            Date.now() - startTime,
            false
          )

          return { success: false, error: error.message }
        }
      },
    },
    readFile: {
      description: 'Read file content from the sandbox',
      handler: async ({ path }: { path: string }) => {
        const startTime = Date.now()
        try {
          const sandbox = await SandboxManager.getInstance().getSandbox()
          const content = await sandbox.filesystem.read(path)

          SandboxManager.getInstance().updateMetrics(
            Date.now() - startTime,
            true
          )

          return { success: true, content }
        } catch (err) {
          const error = err as Error
          log.error('Failed to read file:', error)

          SandboxManager.getInstance().updateMetrics(
            Date.now() - startTime,
            false
          )

          return { success: false, error: error.message }
        }
      },
    },
    getMetrics: {
      description: 'Get sandbox performance metrics',
      handler: async () => {
        return {
          success: true,
          metrics: SandboxManager.getInstance().getMetrics(),
        }
      },
    },
  },
}

export const createE2BCodingAgent = async () => {
  const sandboxManager = SandboxManager.getInstance()

  // Подписываемся на события песочницы
  sandboxManager.on('sandbox:created', () => {
    log.info('New sandbox instance created')
  })

  sandboxManager.on('sandbox:destroyed', () => {
    log.info('Sandbox instance destroyed')
  })

  sandboxManager.on('sandbox:recovered', () => {
    log.info('Sandbox instance recovered after failure')
  })

  return {
    processTask: async (task: Task) => {
      const startTime = Date.now()

      try {
        log.info('Processing task:', task)
        const sandbox = await sandboxManager.getSandbox()

        // Выполняем код задачи в песочнице
        const process = await sandbox.process.start({
          cmd: `python3 -c "${task.description.replace(/"/g, '\\"')}"`,
        })

        const result = await process.wait()
        log.info('Task execution result:', result)

        sandboxManager.updateMetrics(Date.now() - startTime, true)

        return {
          status: 'completed' as const,
          result: result.stdout || 'Task completed successfully',
        }
      } catch (err) {
        const error = err as Error
        log.error('Failed to process task:', error)

        sandboxManager.updateMetrics(Date.now() - startTime, false)

        // При ошибке уничтожаем песочницу для очистки
        await sandboxManager.cleanup()

        return {
          status: 'failed' as const,
          error: error.message,
        }
      }
    },
    capabilities: e2bCodingAgent.capabilities,
    cleanup: () => {
      sandboxManager.cleanup()
    },
  }
}
