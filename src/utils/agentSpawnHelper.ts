/**
 * Agent Spawn Helper
 *
 * High-level helper functions for spawning agents with full validation,
 * error handling, and integration with Claude Flow hooks.
 */

import { logger } from './logger'
import { spawnValidatedAgent, agentConnectionManager } from './agentConnectionManager'
import { validateAgentTypeWithLogging, createAgentTypeErrorMessage } from './agentTypeValidator'

export interface SpawnAgentResult {
  success: boolean
  agentType: string
  originalType: string
  description: string
  result?: any
  error?: string
  duration: number
  mappingWarning?: string
}

export interface AgentSpawnConfig {
  /** Enable claude-flow hooks integration */
  enableHooks: boolean
  /** Enable detailed logging */
  enableLogging: boolean
  /** Maximum spawn time before timeout */
  maxSpawnTimeMs: number
  /** Session ID for coordination */
  sessionId?: string
  /** Memory key prefix for storing spawn results */
  memoryKeyPrefix: string
}

const DEFAULT_SPAWN_CONFIG: AgentSpawnConfig = {
  enableHooks: true,
  enableLogging: true,
  maxSpawnTimeMs: 60000, // 1 minute
  memoryKeyPrefix: 'agent-spawn'
}

/**
 * Spawns an agent with full validation, hooks, and error handling
 */
export async function spawnAgentSafely(
  agentType: string,
  description: string,
  config: Partial<AgentSpawnConfig> = {}
): Promise<SpawnAgentResult> {
  const fullConfig = { ...DEFAULT_SPAWN_CONFIG, ...config }
  const startTime = Date.now()
  const originalType = agentType

  try {
    // Step 1: Validate agent type
    const validatedType = validateAgentTypeWithLogging(agentType)
    const mappingWarning = validatedType !== agentType
      ? `Agent type '${agentType}' mapped to '${validatedType}'`
      : undefined

    if (fullConfig.enableLogging) {
      logger.info('[AgentSpawnHelper] Starting agent spawn', {
        originalType,
        validatedType,
        description,
        sessionId: fullConfig.sessionId,
        mappingWarning
      })
    }

    // Step 2: Execute pre-task hooks if enabled
    if (fullConfig.enableHooks) {
      await executePreTaskHooks(validatedType, description, fullConfig.sessionId)
    }

    // Step 3: Spawn the agent
    const result = await spawnValidatedAgent(validatedType, description, {
      timeout: fullConfig.maxSpawnTimeMs,
      onSuccess: (agentResult) => {
        if (fullConfig.enableLogging) {
          logger.info('[AgentSpawnHelper] Agent spawned successfully', {
            agentType: validatedType,
            duration: Date.now() - startTime
          })
        }
      },
      onError: (error) => {
        logger.error('[AgentSpawnHelper] Agent spawn failed', {
          agentType: validatedType,
          error: error.message,
          duration: Date.now() - startTime
        })
      }
    })

    // Step 4: Execute post-task hooks if enabled
    if (fullConfig.enableHooks) {
      await executePostTaskHooks(validatedType, description, result, fullConfig.sessionId)
    }

    // Step 5: Store result in memory if configured
    if (fullConfig.memoryKeyPrefix) {
      await storeSpawnResult(fullConfig.memoryKeyPrefix, validatedType, result)
    }

    const duration = Date.now() - startTime

    return {
      success: true,
      agentType: validatedType,
      originalType,
      description,
      result,
      duration,
      mappingWarning
    }

  } catch (error) {
    const duration = Date.now() - startTime
    const errorMessage = error instanceof Error ? error.message : String(error)

    if (fullConfig.enableLogging) {
      logger.error('[AgentSpawnHelper] Agent spawn failed completely', {
        originalType,
        description,
        error: errorMessage,
        duration
      })
    }

    return {
      success: false,
      agentType: validateAgentTypeWithLogging(agentType), // Still validate for consistency
      originalType,
      description,
      error: errorMessage,
      duration
    }
  }
}

/**
 * Batch spawn multiple agents concurrently
 */
export async function spawnAgentsBatch(
  agents: Array<{ type: string; description: string }>,
  config: Partial<AgentSpawnConfig> = {}
): Promise<SpawnAgentResult[]> {
  const fullConfig = { ...DEFAULT_SPAWN_CONFIG, ...config }

  logger.info('[AgentSpawnHelper] Starting batch agent spawn', {
    agentCount: agents.length,
    sessionId: fullConfig.sessionId
  })

  const promises = agents.map(({ type, description }) =>
    spawnAgentSafely(type, description, fullConfig)
  )

  const results = await Promise.allSettled(promises)

  const successCount = results.filter(r => r.status === 'fulfilled' && r.value.success).length
  const failureCount = results.length - successCount

  logger.info('[AgentSpawnHelper] Batch spawn completed', {
    total: agents.length,
    successful: successCount,
    failed: failureCount,
    successRate: Math.round((successCount / agents.length) * 100)
  })

  return results.map(result =>
    result.status === 'fulfilled'
      ? result.value
      : {
          success: false,
          agentType: 'unknown',
          originalType: 'unknown',
          description: 'Batch spawn failed',
          error: 'Promise rejected',
          duration: 0
        }
  )
}

/**
 * Executes pre-task hooks for coordination
 */
async function executePreTaskHooks(
  agentType: string,
  description: string,
  sessionId?: string
): Promise<void> {
  try {
    // This would integrate with claude-flow hooks
    // For now, we'll just log the hook execution

    logger.debug('[AgentSpawnHelper] Executing pre-task hooks', {
      agentType,
      description,
      sessionId
    })

    // Example hook commands that would be executed:
    // npx claude-flow@alpha hooks pre-task --description "${description}"
    // npx claude-flow@alpha hooks session-restore --session-id "${sessionId}"

  } catch (error) {
    logger.warn('[AgentSpawnHelper] Pre-task hooks failed', {
      agentType,
      error: error instanceof Error ? error.message : String(error)
    })
    // Don't throw - hooks failure shouldn't prevent agent spawning
  }
}

/**
 * Executes post-task hooks for coordination
 */
async function executePostTaskHooks(
  agentType: string,
  description: string,
  result: any,
  sessionId?: string
): Promise<void> {
  try {
    logger.debug('[AgentSpawnHelper] Executing post-task hooks', {
      agentType,
      description,
      sessionId
    })

    // Example hook commands that would be executed:
    // npx claude-flow@alpha hooks post-task --task-id "${agentType}-${Date.now()}"
    // npx claude-flow@alpha hooks notify --message "Agent ${agentType} spawned successfully"

  } catch (error) {
    logger.warn('[AgentSpawnHelper] Post-task hooks failed', {
      agentType,
      error: error instanceof Error ? error.message : String(error)
    })
    // Don't throw - hooks failure shouldn't prevent completion
  }
}

/**
 * Stores spawn result in memory for coordination
 */
async function storeSpawnResult(
  keyPrefix: string,
  agentType: string,
  result: any
): Promise<void> {
  try {
    const memoryKey = `${keyPrefix}/${agentType}/${Date.now()}`

    logger.debug('[AgentSpawnHelper] Storing spawn result in memory', {
      memoryKey,
      agentType
    })

    // This would integrate with claude-flow memory system
    // For now, we'll just log the storage

  } catch (error) {
    logger.warn('[AgentSpawnHelper] Failed to store spawn result', {
      agentType,
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * Gets spawn statistics and health metrics
 */
export async function getSpawnMetrics(): Promise<{
  totalSpawns: number
  successRate: number
  averageSpawnTime: number
  agentTypeDistribution: Record<string, number>
  connectionHealth: any
}> {
  try {
    // Get connection health from the manager
    const connectionHealth = await agentConnectionManager.performHealthCheck()
    const statuses = agentConnectionManager.getAllConnectionStatuses()

    // Calculate distribution
    const agentTypeDistribution: Record<string, number> = {}
    Object.values(statuses).forEach(status => {
      agentTypeDistribution[status.agentType] =
        (agentTypeDistribution[status.agentType] || 0) + 1
    })

    // Calculate averages
    const responseTimes = Object.values(statuses)
      .map(s => s.responseTime)
      .filter(t => t !== undefined) as number[]

    const averageSpawnTime = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0

    const totalSpawns = Object.values(statuses)
      .reduce((sum, status) => sum + status.connectionAttempts, 0)

    return {
      totalSpawns,
      successRate: connectionHealth.healthScore,
      averageSpawnTime: Math.round(averageSpawnTime),
      agentTypeDistribution,
      connectionHealth
    }

  } catch (error) {
    logger.error('[AgentSpawnHelper] Failed to get spawn metrics', {
      error: error instanceof Error ? error.message : String(error)
    })

    return {
      totalSpawns: 0,
      successRate: 0,
      averageSpawnTime: 0,
      agentTypeDistribution: {},
      connectionHealth: { healthy: [], unhealthy: [], total: 0, healthScore: 0 }
    }
  }
}

/**
 * Validates agent type before spawning without actually spawning
 */
export function validateAgentTypeForSpawn(agentType: string): {
  isValid: boolean
  validatedType: string
  errorMessage?: string
  suggestions?: string[]
} {
  try {
    const validatedType = validateAgentTypeWithLogging(agentType)

    return {
      isValid: true,
      validatedType,
      errorMessage: validatedType !== agentType
        ? `Agent type '${agentType}' will be mapped to '${validatedType}'`
        : undefined
    }
  } catch (error) {
    return {
      isValid: false,
      validatedType: 'coder', // fallback
      errorMessage: createAgentTypeErrorMessage(agentType),
      suggestions: ['Use validateAndMapAgentType() for detailed suggestions']
    }
  }
}

/**
 * Creates a spawn report for monitoring and debugging
 */
export function createSpawnReport(results: SpawnAgentResult[]): string {
  const successful = results.filter(r => r.success)
  const failed = results.filter(r => !r.success)
  const mapped = results.filter(r => r.mappingWarning)

  let report = `🤖 Agent Spawn Report\n`
  report += `═══════════════════════\n`
  report += `📊 Summary: ${successful.length}/${results.length} successful (${Math.round((successful.length/results.length)*100)}%)\n`
  report += `⏱️  Average Duration: ${Math.round(results.reduce((sum, r) => sum + r.duration, 0) / results.length)}ms\n\n`

  if (mapped.length > 0) {
    report += `🔄 Type Mappings (${mapped.length}):\n`
    mapped.forEach(r => {
      report += `  • ${r.originalType} → ${r.agentType}\n`
    })
    report += `\n`
  }

  if (successful.length > 0) {
    report += `✅ Successful Spawns (${successful.length}):\n`
    successful.forEach(r => {
      report += `  • ${r.agentType}: ${r.description} (${r.duration}ms)\n`
    })
    report += `\n`
  }

  if (failed.length > 0) {
    report += `❌ Failed Spawns (${failed.length}):\n`
    failed.forEach(r => {
      report += `  • ${r.agentType}: ${r.error}\n`
    })
  }

  return report
}