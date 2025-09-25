/**
 * Centralized Agent Configuration
 *
 * This file contains all agent-related configuration settings,
 * type definitions, and validation rules.
 */

import { AGENT_TYPE_CONFIG, ValidAgentType } from '../utils/agentTypeValidator'
import { DEFAULT_AGENT_CONFIG, AgentConnectionConfig } from '../utils/agentConnectionManager'
import { logger } from '../utils/logger'

export interface GlobalAgentConfig {
  /** Agent type validation and mapping configuration */
  typeValidation: typeof AGENT_TYPE_CONFIG
  /** Connection management configuration */
  connectionManagement: AgentConnectionConfig
  /** Feature flags for agent system */
  features: {
    enableTypeValidation: boolean
    enableConnectionRetries: boolean
    enableHealthMonitoring: boolean
    enableHooksIntegration: boolean
    enableBatchSpawning: boolean
    enableMetricsCollection: boolean
  }
  /** Environment-specific settings */
  environment: {
    isDevelopment: boolean
    isProduction: boolean
    isTesting: boolean
    logLevel: 'debug' | 'info' | 'warn' | 'error'
  }
  /** Claude Flow integration settings */
  claudeFlow: {
    enableHooks: boolean
    enableMemory: boolean
    sessionTimeout: number
    defaultSessionPrefix: string
    memoryKeyPrefix: string
  }
  /** Performance settings */
  performance: {
    maxConcurrentSpawns: number
    spawnTimeoutMs: number
    healthCheckIntervalMs: number
    metricsRetentionMs: number
  }
}

/**
 * Default global agent configuration
 */
export const GLOBAL_AGENT_CONFIG: GlobalAgentConfig = {
  typeValidation: AGENT_TYPE_CONFIG,

  connectionManagement: {
    ...DEFAULT_AGENT_CONFIG,
    // Override defaults for production
    maxRetries: 3,
    retryDelayMs: 1000,
    connectionTimeoutMs: 30000,
    healthCheckIntervalMs: 60000,
    enableHealthChecks: true
  },

  features: {
    enableTypeValidation: true,
    enableConnectionRetries: true,
    enableHealthMonitoring: true,
    enableHooksIntegration: true,
    enableBatchSpawning: true,
    enableMetricsCollection: true
  },

  environment: {
    isDevelopment: process.env.NODE_ENV === 'development',
    isProduction: process.env.NODE_ENV === 'production',
    isTesting: process.env.NODE_ENV === 'test',
    logLevel: (process.env.LOG_LEVEL as any) || 'info'
  },

  claudeFlow: {
    enableHooks: true,
    enableMemory: true,
    sessionTimeout: 3600000, // 1 hour
    defaultSessionPrefix: 'agent-spawn',
    memoryKeyPrefix: 'swarm/agents'
  },

  performance: {
    maxConcurrentSpawns: 10,
    spawnTimeoutMs: 60000, // 1 minute
    healthCheckIntervalMs: 60000, // 1 minute
    metricsRetentionMs: 86400000 // 24 hours
  }
}

/**
 * Agent priority levels for spawn ordering
 */
export const AGENT_PRIORITIES: Record<ValidAgentType, number> = {
  // Core Development (High Priority)
  'coder': 10,
  'reviewer': 9,
  'tester': 9,
  'planner': 8,
  'researcher': 8,

  // System Architecture (High Priority)
  'system-architect': 10,
  'code-analyzer': 9,

  // Specialized Development (Medium-High Priority)
  'backend-dev': 7,
  'mobile-dev': 7,
  'ml-developer': 6,
  'cicd-engineer': 8,
  'api-docs': 5,
  'base-template-generator': 4,

  // SPARC Methodology (Medium Priority)
  'sparc-coord': 6,
  'sparc-coder': 6,
  'specification': 5,
  'pseudocode': 5,
  'architecture': 7,
  'refinement': 5,

  // Testing & Validation (High Priority)
  'tdd-london-swarm': 8,
  'production-validator': 9,

  // GitHub & Repository (Medium Priority)
  'github-modes': 6,
  'pr-manager': 7,
  'code-review-swarm': 7,
  'issue-tracker': 5,
  'release-manager': 8,
  'workflow-automation': 6,
  'project-board-sync': 4,
  'repo-architect': 6,
  'multi-repo-swarm': 5,

  // Swarm Coordination (Low-Medium Priority)
  'hierarchical-coordinator': 3,
  'mesh-coordinator': 3,
  'adaptive-coordinator': 3,
  'collective-intelligence-coordinator': 4,
  'swarm-memory-manager': 5,

  // Consensus & Distributed (Low Priority)
  'byzantine-coordinator': 2,
  'raft-manager': 2,
  'gossip-coordinator': 2,
  'consensus-builder': 3,
  'crdt-synchronizer': 2,
  'quorum-manager': 2,
  'security-manager': 6,

  // Performance & Optimization (Medium Priority)
  'perf-analyzer': 5,
  'performance-benchmarker': 4,
  'task-orchestrator': 5,
  'memory-coordinator': 4,
  'smart-agent': 3,

  // Telegram Bot Management (Domain Specific)
  'telegram-user-agent': 7,

  // Migration & Planning (Medium Priority)
  'migration-planner': 6,
  'swarm-init': 4
}

/**
 * Agent compatibility matrix - which agents work well together
 */
export const AGENT_COMPATIBILITY: Record<ValidAgentType, ValidAgentType[]> = {
  'coder': ['reviewer', 'tester', 'code-analyzer', 'system-architect'],
  'reviewer': ['coder', 'tester', 'code-analyzer'],
  'tester': ['coder', 'reviewer', 'backend-dev', 'mobile-dev'],
  'planner': ['system-architect', 'researcher', 'coder'],
  'researcher': ['planner', 'code-analyzer', 'system-architect'],
  'code-analyzer': ['coder', 'reviewer', 'researcher', 'system-architect'],
  'system-architect': ['planner', 'researcher', 'code-analyzer', 'coder'],
  'backend-dev': ['tester', 'reviewer', 'cicd-engineer', 'api-docs'],
  'mobile-dev': ['tester', 'reviewer', 'backend-dev'],
  'ml-developer': ['researcher', 'code-analyzer', 'backend-dev'],
  'cicd-engineer': ['backend-dev', 'tester', 'production-validator'],
  'api-docs': ['backend-dev', 'reviewer'],
  'telegram-user-agent': ['backend-dev', 'tester', 'reviewer'],
  // Add more as needed...
} as any

/**
 * Gets environment-specific configuration
 */
export function getEnvironmentConfig(): Partial<GlobalAgentConfig> {
  const env = process.env.NODE_ENV

  switch (env) {
    case 'development':
      return {
        features: {
          ...GLOBAL_AGENT_CONFIG.features,
          enableMetricsCollection: false // Reduce overhead in dev
        },
        performance: {
          ...GLOBAL_AGENT_CONFIG.performance,
          maxConcurrentSpawns: 5, // Lower limit for dev
          healthCheckIntervalMs: 120000 // Less frequent checks
        },
        environment: {
          ...GLOBAL_AGENT_CONFIG.environment,
          logLevel: 'debug'
        }
      }

    case 'test':
      return {
        features: {
          ...GLOBAL_AGENT_CONFIG.features,
          enableHealthMonitoring: false,
          enableHooksIntegration: false,
          enableMetricsCollection: false
        },
        connectionManagement: {
          ...GLOBAL_AGENT_CONFIG.connectionManagement,
          enableHealthChecks: false,
          maxRetries: 1,
          connectionTimeoutMs: 5000
        },
        environment: {
          ...GLOBAL_AGENT_CONFIG.environment,
          logLevel: 'warn'
        }
      }

    case 'production':
      return {
        features: {
          ...GLOBAL_AGENT_CONFIG.features,
          // All features enabled for production
        },
        performance: {
          ...GLOBAL_AGENT_CONFIG.performance,
          maxConcurrentSpawns: 20, // Higher limit for production
          healthCheckIntervalMs: 30000 // More frequent checks
        },
        environment: {
          ...GLOBAL_AGENT_CONFIG.environment,
          logLevel: 'info'
        }
      }

    default:
      return {}
  }
}

/**
 * Creates a merged configuration for the current environment
 */
export function createAgentConfig(): GlobalAgentConfig {
  const envConfig = getEnvironmentConfig()
  const merged = { ...GLOBAL_AGENT_CONFIG }

  // Deep merge environment-specific config
  Object.keys(envConfig).forEach(key => {
    const envValue = (envConfig as any)[key]
    if (typeof envValue === 'object' && envValue !== null) {
      ;(merged as any)[key] = { ...(merged as any)[key], ...envValue }
    } else {
      ;(merged as any)[key] = envValue
    }
  })

  return merged
}

/**
 * Validates the agent configuration
 */
export function validateAgentConfig(config: GlobalAgentConfig): {
  isValid: boolean
  errors: string[]
  warnings: string[]
} {
  const errors: string[] = []
  const warnings: string[] = []

  // Validate type validation config
  if (!config.typeValidation.validTypes || config.typeValidation.validTypes.length === 0) {
    errors.push('typeValidation.validTypes cannot be empty')
  }

  if (!config.typeValidation.defaultFallback) {
    errors.push('typeValidation.defaultFallback is required')
  }

  // Validate connection config
  if (config.connectionManagement.maxRetries < 0) {
    errors.push('connectionManagement.maxRetries must be >= 0')
  }

  if (config.connectionManagement.connectionTimeoutMs <= 0) {
    errors.push('connectionManagement.connectionTimeoutMs must be > 0')
  }

  // Validate performance config
  if (config.performance.maxConcurrentSpawns <= 0) {
    errors.push('performance.maxConcurrentSpawns must be > 0')
  }

  if (config.performance.spawnTimeoutMs <= 0) {
    errors.push('performance.spawnTimeoutMs must be > 0')
  }

  // Warnings for suboptimal settings
  if (config.performance.maxConcurrentSpawns > 50) {
    warnings.push('performance.maxConcurrentSpawns > 50 may cause resource issues')
  }

  if (config.connectionManagement.maxRetries > 10) {
    warnings.push('connectionManagement.maxRetries > 10 may cause excessive delays')
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings
  }
}

/**
 * Logs the current agent configuration
 */
export function logAgentConfig(config: GlobalAgentConfig): void {
  const validation = validateAgentConfig(config)

  logger.info('[AgentConfig] Agent configuration loaded', {
    environment: config.environment,
    featuresEnabled: Object.entries(config.features)
      .filter(([, enabled]) => enabled)
      .map(([feature]) => feature),
    validationStatus: validation.isValid ? 'valid' : 'invalid',
    validationErrors: validation.errors,
    validationWarnings: validation.warnings,
    agentTypesCount: config.typeValidation.validTypes.length,
    aliasesCount: Object.keys(config.typeValidation.typeAliases).length
  })

  if (validation.warnings.length > 0) {
    logger.warn('[AgentConfig] Configuration warnings detected', {
      warnings: validation.warnings
    })
  }

  if (!validation.isValid) {
    logger.error('[AgentConfig] Invalid configuration detected', {
      errors: validation.errors
    })
  }
}

/**
 * Gets agent priority for spawn ordering
 */
export function getAgentPriority(agentType: ValidAgentType): number {
  return AGENT_PRIORITIES[agentType] || 1
}

/**
 * Gets compatible agents for collaboration
 */
export function getCompatibleAgents(agentType: ValidAgentType): ValidAgentType[] {
  return AGENT_COMPATIBILITY[agentType] || []
}

/**
 * Global configuration instance
 */
export const agentConfig = createAgentConfig()

// Validate and log the configuration on module load
const validation = validateAgentConfig(agentConfig)
if (!validation.isValid) {
  logger.error('[AgentConfig] Critical configuration errors detected', {
    errors: validation.errors
  })
  throw new Error(`Agent configuration is invalid: ${validation.errors.join(', ')}`)
}

if (validation.warnings.length > 0) {
  logger.warn('[AgentConfig] Configuration warnings', {
    warnings: validation.warnings
  })
}

// Export the validated configuration
export default agentConfig