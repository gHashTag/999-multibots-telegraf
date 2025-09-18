/**
 * Agent Connection Manager
 *
 * Manages connections to Claude Flow agents, handles retries,
 * validates agent types, and provides health checks.
 */

import { logger } from './logger'
import { validateAgentTypeWithLogging, createAgentTypeErrorMessage, getValidAgentType } from './agentTypeValidator'

export interface AgentConnectionConfig {
  maxRetries: number
  retryDelayMs: number
  connectionTimeoutMs: number
  healthCheckIntervalMs: number
  enableHealthChecks: boolean
}

export interface AgentSpawnOptions {
  agentType: string
  description: string
  timeout?: number
  retries?: number
  onError?: (error: Error) => void
  onSuccess?: (result: any) => void
}

export interface AgentConnectionStatus {
  agentType: string
  isConnected: boolean
  lastConnectionAttempt: Date
  connectionAttempts: number
  lastError?: string
  responseTime?: number
}

/**
 * Default configuration for agent connections
 */
export const DEFAULT_AGENT_CONFIG: AgentConnectionConfig = {
  maxRetries: 3,
  retryDelayMs: 1000,
  connectionTimeoutMs: 30000,
  healthCheckIntervalMs: 60000, // 1 minute
  enableHealthChecks: true
}

/**
 * Agent Connection Manager Class
 */
export class AgentConnectionManager {
  private config: AgentConnectionConfig
  private connectionStatuses: Map<string, AgentConnectionStatus> = new Map()
  private healthCheckInterval?: NodeJS.Timeout

  constructor(config: Partial<AgentConnectionConfig> = {}) {
    this.config = { ...DEFAULT_AGENT_CONFIG, ...config }

    if (this.config.enableHealthChecks) {
      this.startHealthChecks()
    }

    logger.info('[AgentConnectionManager] Initialized', {
      config: this.config,
      healthChecksEnabled: this.config.enableHealthChecks
    })
  }

  /**
   * Spawns an agent with validation, retry logic, and error handling
   */
  async spawnAgentWithValidation(options: AgentSpawnOptions): Promise<any> {
    const startTime = Date.now()

    try {
      // Validate and map agent type
      const validatedType = validateAgentTypeWithLogging(options.agentType)

      if (validatedType !== options.agentType) {
        logger.warn('[AgentConnectionManager] Agent type mapped', {
          originalType: options.agentType,
          mappedType: validatedType
        })
      }

      // Update connection status
      this.updateConnectionStatus(validatedType, {
        lastConnectionAttempt: new Date(),
        connectionAttempts: (this.getConnectionStatus(validatedType)?.connectionAttempts || 0) + 1
      })

      // Attempt to spawn agent with retries
      const result = await this.spawnWithRetries({
        ...options,
        agentType: validatedType
      })

      // Update success status
      const responseTime = Date.now() - startTime
      this.updateConnectionStatus(validatedType, {
        isConnected: true,
        responseTime,
        lastError: undefined
      })

      logger.info('[AgentConnectionManager] Agent spawned successfully', {
        agentType: validatedType,
        originalType: options.agentType,
        responseTime,
        description: options.description
      })

      if (options.onSuccess) {
        options.onSuccess(result)
      }

      return result

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)

      // Update error status
      this.updateConnectionStatus(getValidAgentType(options.agentType), {
        isConnected: false,
        lastError: errorMessage
      })

      logger.error('[AgentConnectionManager] Agent spawn failed', {
        agentType: options.agentType,
        error: errorMessage,
        description: options.description,
        duration: Date.now() - startTime
      })

      if (options.onError) {
        options.onError(error instanceof Error ? error : new Error(errorMessage))
      }

      throw error
    }
  }

  /**
   * Spawns agent with retry logic
   */
  private async spawnWithRetries(options: AgentSpawnOptions): Promise<any> {
    const maxRetries = options.retries ?? this.config.maxRetries
    let lastError: Error

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug('[AgentConnectionManager] Spawning agent', {
          agentType: options.agentType,
          attempt,
          maxRetries,
          description: options.description
        })

        // This is where the actual agent spawning would happen
        // For now, we'll simulate it with a timeout and validation
        const result = await this.simulateAgentSpawn(options)

        logger.info('[AgentConnectionManager] Agent spawn attempt successful', {
          agentType: options.agentType,
          attempt,
          description: options.description
        })

        return result

      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))

        logger.warn('[AgentConnectionManager] Agent spawn attempt failed', {
          agentType: options.agentType,
          attempt,
          maxRetries,
          error: lastError.message,
          willRetry: attempt < maxRetries
        })

        if (attempt < maxRetries) {
          await this.delay(this.config.retryDelayMs * attempt) // Exponential backoff
        }
      }
    }

    throw new Error(`Failed to spawn agent '${options.agentType}' after ${maxRetries} attempts. Last error: ${lastError!.message}`)
  }

  /**
   * Simulates agent spawning (replace with actual implementation)
   */
  private async simulateAgentSpawn(options: AgentSpawnOptions): Promise<any> {
    // Simulate connection timeout
    const timeout = options.timeout ?? this.config.connectionTimeoutMs

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Agent spawn timeout after ${timeout}ms`))
      }, timeout)

      // Simulate successful spawn after a short delay
      setTimeout(() => {
        clearTimeout(timer)
        resolve({
          agentType: options.agentType,
          description: options.description,
          spawnedAt: new Date().toISOString(),
          status: 'active'
        })
      }, Math.random() * 1000 + 500) // Random delay 500-1500ms
    })
  }

  /**
   * Gets connection status for an agent type
   */
  getConnectionStatus(agentType: string): AgentConnectionStatus | undefined {
    return this.connectionStatuses.get(agentType)
  }

  /**
   * Gets all connection statuses
   */
  getAllConnectionStatuses(): Record<string, AgentConnectionStatus> {
    const statuses: Record<string, AgentConnectionStatus> = {}
    for (const [type, status] of this.connectionStatuses.entries()) {
      statuses[type] = status
    }
    return statuses
  }

  /**
   * Updates connection status for an agent type
   */
  private updateConnectionStatus(agentType: string, updates: Partial<AgentConnectionStatus>): void {
    const current = this.connectionStatuses.get(agentType) || {
      agentType,
      isConnected: false,
      lastConnectionAttempt: new Date(),
      connectionAttempts: 0
    }

    this.connectionStatuses.set(agentType, { ...current, ...updates })
  }

  /**
   * Performs health check on all connected agents
   */
  async performHealthCheck(): Promise<{
    healthy: string[]
    unhealthy: string[]
    total: number
    healthScore: number
  }> {
    const statuses = Array.from(this.connectionStatuses.values())
    const healthy = statuses.filter(status => status.isConnected && !status.lastError)
    const unhealthy = statuses.filter(status => !status.isConnected || status.lastError)

    const healthScore = statuses.length > 0 ? (healthy.length / statuses.length) * 100 : 100

    logger.info('[AgentConnectionManager] Health check completed', {
      total: statuses.length,
      healthy: healthy.length,
      unhealthy: unhealthy.length,
      healthScore: Math.round(healthScore)
    })

    return {
      healthy: healthy.map(s => s.agentType),
      unhealthy: unhealthy.map(s => s.agentType),
      total: statuses.length,
      healthScore
    }
  }

  /**
   * Starts periodic health checks
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        const healthCheck = await this.performHealthCheck()

        if (healthCheck.healthScore < 70) {
          logger.warn('[AgentConnectionManager] Low health score detected', {
            healthScore: healthCheck.healthScore,
            unhealthyAgents: healthCheck.unhealthy
          })
        }

        // Store health metrics for monitoring
        await this.storeHealthMetrics(healthCheck)

      } catch (error) {
        logger.error('[AgentConnectionManager] Health check failed', {
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }, this.config.healthCheckIntervalMs)

    logger.info('[AgentConnectionManager] Health checks started', {
      intervalMs: this.config.healthCheckIntervalMs
    })
  }

  /**
   * Stores health metrics for monitoring and coordination
   */
  private async storeHealthMetrics(healthCheck: any): Promise<void> {
    try {
      // This could integrate with claude-flow memory system
      // For now, just log the metrics
      logger.debug('[AgentConnectionManager] Health metrics', {
        timestamp: new Date().toISOString(),
        ...healthCheck
      })

      // TODO: Store in claude-flow memory for other agents to access
      // await claudeFlow.memory.store('agent-health', healthCheck)

    } catch (error) {
      logger.error('[AgentConnectionManager] Failed to store health metrics', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  /**
   * Utility function for delays
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }

  /**
   * Stops health checks and cleans up
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval)
      this.healthCheckInterval = undefined
    }

    this.connectionStatuses.clear()

    logger.info('[AgentConnectionManager] Destroyed')
  }

  /**
   * Creates a human-readable status report
   */
  getStatusReport(): string {
    const statuses = Array.from(this.connectionStatuses.values())

    if (statuses.length === 0) {
      return '📊 Agent Connection Status: No agents connected'
    }

    const connected = statuses.filter(s => s.isConnected).length
    const total = statuses.length
    const healthScore = (connected / total) * 100

    let report = `📊 Agent Connection Status\n`
    report += `═══════════════════════════\n`
    report += `🟢 Connected: ${connected}/${total} (${Math.round(healthScore)}%)\n\n`

    // Group by status
    const connectedAgents = statuses.filter(s => s.isConnected)
    const disconnectedAgents = statuses.filter(s => !s.isConnected)

    if (connectedAgents.length > 0) {
      report += `✅ Connected Agents:\n`
      connectedAgents.forEach(status => {
        report += `  • ${status.agentType} (${status.responseTime}ms)\n`
      })
      report += `\n`
    }

    if (disconnectedAgents.length > 0) {
      report += `❌ Disconnected Agents:\n`
      disconnectedAgents.forEach(status => {
        const error = status.lastError ? ` - ${status.lastError}` : ''
        report += `  • ${status.agentType}${error}\n`
      })
    }

    return report
  }
}

/**
 * Global instance of the agent connection manager
 */
export const agentConnectionManager = new AgentConnectionManager()

/**
 * Convenience function to spawn an agent with validation
 */
export async function spawnValidatedAgent(
  agentType: string,
  description: string,
  options: Partial<AgentSpawnOptions> = {}
): Promise<any> {
  return agentConnectionManager.spawnAgentWithValidation({
    agentType,
    description,
    ...options
  })
}

/**
 * Convenience function to check if agent type is valid before spawning
 */
export function preValidateAgentType(agentType: string): {
  isValid: boolean
  errorMessage?: string
  validatedType: string
} {
  try {
    const validatedType = getValidAgentType(agentType)

    if (validatedType === agentType) {
      return { isValid: true, validatedType }
    } else {
      return {
        isValid: true,
        validatedType,
        errorMessage: `Agent type '${agentType}' mapped to '${validatedType}'`
      }
    }
  } catch (error) {
    return {
      isValid: false,
      validatedType: 'coder', // fallback
      errorMessage: createAgentTypeErrorMessage(agentType)
    }
  }
}