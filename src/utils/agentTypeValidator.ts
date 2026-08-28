/**
 * Agent Type Validation and Mapping System
 *
 * This module provides comprehensive validation and mapping for agent types
 * to prevent errors when spawning agents and ensure proper fallbacks.
 */

import { logger } from './logger'

export interface AgentTypeConfig {
  /** Valid agent types supported by the system */
  validTypes: string[]
  /** Type aliases mapping invalid types to valid ones */
  typeAliases: Record<string, string>
  /** Fallback agent type when all else fails */
  defaultFallback: string
  /** Deprecated types with their replacements */
  deprecatedTypes: Record<string, string>
}

/**
 * Complete list of valid agent types supported by Claude Flow
 */
export const VALID_AGENT_TYPES = [
  // Core Development
  'coder',
  'reviewer',
  'tester',
  'planner',
  'researcher',

  // Specialized Development
  'backend-dev',
  'mobile-dev',
  'ml-developer',
  'cicd-engineer',
  'api-docs',
  'system-architect',
  'code-analyzer', // Fixed: 'analyst' -> 'code-analyzer'
  'base-template-generator',

  // SPARC Methodology
  'sparc-coord',
  'sparc-coder',
  'specification',
  'pseudocode',
  'architecture',
  'refinement',

  // Testing & Validation
  'tdd-london-swarm',
  'production-validator',

  // GitHub & Repository
  'github-modes',
  'pr-manager',
  'code-review-swarm',
  'issue-tracker',
  'release-manager',
  'workflow-automation',
  'project-board-sync',
  'repo-architect',
  'multi-repo-swarm',

  // Swarm Coordination
  'hierarchical-coordinator',
  'mesh-coordinator',
  'adaptive-coordinator',
  'collective-intelligence-coordinator',
  'swarm-memory-manager',

  // Consensus & Distributed
  'byzantine-coordinator',
  'raft-manager',
  'gossip-coordinator',
  'consensus-builder',
  'crdt-synchronizer',
  'quorum-manager',
  'security-manager',

  // Performance & Optimization
  'perf-analyzer',
  'performance-benchmarker',
  'task-orchestrator',
  'memory-coordinator',
  'smart-agent',

  // Telegram Bot Management
  'telegram-user-agent',

  // Migration & Planning
  'migration-planner',
  'swarm-init',
] as const

export type ValidAgentType = (typeof VALID_AGENT_TYPES)[number]

/**
 * Configuration for agent type validation and mapping
 */
export const AGENT_TYPE_CONFIG: AgentTypeConfig = {
  validTypes: [...VALID_AGENT_TYPES],

  // Type aliases - map common mistakes to correct types
  typeAliases: {
    // Primary fix: analyst -> code-analyzer
    analyst: 'code-analyzer',
    analyzer: 'code-analyzer',
    'code-analyst': 'code-analyzer',

    // Common aliases
    dev: 'coder',
    developer: 'coder',
    programmer: 'coder',
    engineer: 'coder',

    test: 'tester',
    testing: 'tester',
    qa: 'tester',

    review: 'reviewer',
    'reviewer-agent': 'reviewer',

    research: 'researcher',
    'researcher-agent': 'researcher',

    plan: 'planner',
    planning: 'planner',

    architect: 'system-architect',
    'architecture-agent': 'system-architect',

    backend: 'backend-dev',
    'backend-developer': 'backend-dev',
    mobile: 'mobile-dev',
    'mobile-developer': 'mobile-dev',

    ml: 'ml-developer',
    'machine-learning': 'ml-developer',
    'ai-developer': 'ml-developer',

    devops: 'cicd-engineer',
    ci: 'cicd-engineer',
    cd: 'cicd-engineer',
    deployment: 'cicd-engineer',

    docs: 'api-docs',
    documentation: 'api-docs',
    'doc-writer': 'api-docs',

    security: 'security-manager',
    sec: 'security-manager',

    performance: 'perf-analyzer',
    perf: 'perf-analyzer',
    benchmark: 'performance-benchmarker',

    github: 'github-modes',
    git: 'github-modes',
    pr: 'pr-manager',
    'pull-request': 'pr-manager',

    telegram: 'telegram-user-agent',
    'telegram-agent': 'telegram-user-agent',
    'user-agent': 'telegram-user-agent',
  },

  // Deprecated types with replacements
  deprecatedTypes: {
    analyst: 'code-analyzer',
    'code-analyst': 'code-analyzer',
    analyzer: 'code-analyzer',
  },

  // Default fallback when all else fails
  defaultFallback: 'coder',
}

/**
 * Validates and maps agent type to a valid type
 */
export function validateAndMapAgentType(agentType: string): {
  isValid: boolean
  mappedType: string
  originalType: string
  warnings: string[]
  suggestions: string[]
} {
  const originalType = agentType
  const warnings: string[] = []
  const suggestions: string[] = []

  // Check if type is already valid
  if (AGENT_TYPE_CONFIG.validTypes.includes(agentType)) {
    return {
      isValid: true,
      mappedType: agentType,
      originalType,
      warnings: [],
      suggestions: [],
    }
  }

  // Check for alias mapping
  if (AGENT_TYPE_CONFIG.typeAliases[agentType]) {
    const mappedType = AGENT_TYPE_CONFIG.typeAliases[agentType]

    if (AGENT_TYPE_CONFIG.deprecatedTypes[agentType]) {
      warnings.push(
        `Agent type '${agentType}' is deprecated. Use '${mappedType}' instead.`
      )
    } else {
      warnings.push(`Agent type '${agentType}' mapped to '${mappedType}'.`)
    }

    return {
      isValid: true,
      mappedType,
      originalType,
      warnings,
      suggestions: [],
    }
  }

  // Type not found - provide suggestions
  const similarTypes = findSimilarAgentTypes(agentType)
  suggestions.push(
    `Invalid agent type '${agentType}'.`,
    `Did you mean: ${similarTypes.join(', ')}?`,
    `Using fallback type '${AGENT_TYPE_CONFIG.defaultFallback}'.`
  )

  return {
    isValid: false,
    mappedType: AGENT_TYPE_CONFIG.defaultFallback,
    originalType,
    warnings,
    suggestions,
  }
}

/**
 * Finds similar agent types based on string similarity
 */
function findSimilarAgentTypes(
  agentType: string,
  maxSuggestions: number = 3
): string[] {
  const similarities = AGENT_TYPE_CONFIG.validTypes.map(validType => ({
    type: validType,
    similarity: calculateSimilarity(
      agentType.toLowerCase(),
      validType.toLowerCase()
    ),
  }))

  return similarities
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxSuggestions)
    .map(item => item.type)
}

/**
 * Calculates string similarity using Levenshtein distance
 */
function calculateSimilarity(str1: string, str2: string): number {
  const matrix: number[][] = []
  const len1 = str1.length
  const len2 = str2.length

  if (len1 === 0) return len2
  if (len2 === 0) return len1

  // Initialize matrix
  for (let i = 0; i <= len2; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= len1; j++) {
    matrix[0][j] = j
  }

  // Calculate distances
  for (let i = 1; i <= len2; i++) {
    for (let j = 1; j <= len1; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1, // insertion
          matrix[i - 1][j] + 1 // deletion
        )
      }
    }
  }

  const maxLen = Math.max(len1, len2)
  return (maxLen - matrix[len2][len1]) / maxLen
}

/**
 * Validates agent type and logs warnings/errors
 */
export function validateAgentTypeWithLogging(agentType: string): string {
  const validation = validateAndMapAgentType(agentType)

  if (validation.warnings.length > 0) {
    logger.warn('[AgentTypeValidator] Agent type validation warnings', {
      originalType: validation.originalType,
      mappedType: validation.mappedType,
      warnings: validation.warnings,
    })
  }

  if (validation.suggestions.length > 0) {
    logger.error('[AgentTypeValidator] Invalid agent type detected', {
      originalType: validation.originalType,
      mappedType: validation.mappedType,
      suggestions: validation.suggestions,
      availableTypes: AGENT_TYPE_CONFIG.validTypes.slice(0, 10), // Show first 10 for reference
    })
  }

  return validation.mappedType
}

/**
 * Gets all available agent types with descriptions
 */
export function getAvailableAgentTypes(): Record<string, string> {
  return {
    // Core Development
    coder: 'General-purpose coder for implementation tasks',
    reviewer: 'Code review and quality assurance',
    tester: 'Test creation and validation',
    planner: 'Task planning and organization',
    researcher: 'Research and analysis tasks',

    // Specialized Development
    'backend-dev': 'Backend development specialist',
    'mobile-dev': 'Mobile app development',
    'ml-developer': 'Machine learning and AI development',
    'cicd-engineer': 'DevOps and CI/CD pipeline management',
    'api-docs': 'API documentation generation',
    'system-architect': 'System architecture and design',
    'code-analyzer': 'Code analysis and metrics (replaces "analyst")',
    'base-template-generator': 'Template and boilerplate generation',

    // SPARC Methodology
    'sparc-coord': 'SPARC methodology coordinator',
    'sparc-coder': 'SPARC-specific coding tasks',
    specification: 'Requirements specification',
    pseudocode: 'Algorithm design and pseudocode',
    architecture: 'Architecture design',
    refinement: 'Code refinement and optimization',

    // Testing & Validation
    'tdd-london-swarm': 'Test-driven development (London style)',
    'production-validator': 'Production environment validation',

    // GitHub & Repository
    'github-modes': 'GitHub integration and management',
    'pr-manager': 'Pull request management',
    'code-review-swarm': 'Collaborative code review',
    'issue-tracker': 'Issue tracking and management',
    'release-manager': 'Release management and deployment',
    'workflow-automation': 'Workflow automation',
    'project-board-sync': 'Project board synchronization',
    'repo-architect': 'Repository architecture design',
    'multi-repo-swarm': 'Multi-repository coordination',

    // Telegram Bot Management
    'telegram-user-agent': 'Telegram bot user management and automation',
  }
}

/**
 * Creates a user-friendly error message for invalid agent types
 */
export function createAgentTypeErrorMessage(agentType: string): string {
  const validation = validateAndMapAgentType(agentType)

  if (validation.isValid) {
    return `Agent type '${agentType}' is valid.`
  }

  const availableTypes = Object.keys(getAvailableAgentTypes())
  const suggestions = findSimilarAgentTypes(agentType, 5)

  return `
🚨 Invalid Agent Type: '${agentType}'

❓ Did you mean one of these?
${suggestions.map(type => `  • ${type}`).join('\n')}

💡 Most common agent types:
  • coder - General development tasks
  • code-analyzer - Code analysis (replaces 'analyst')
  • tester - Testing and QA
  • reviewer - Code review
  • researcher - Research tasks

📚 All available types: ${availableTypes.length} total
Run getAvailableAgentTypes() for a complete list with descriptions.

🔄 Using fallback: '${validation.mappedType}'
`.trim()
}

/**
 * Utility function to check if an agent type exists
 */
export function isValidAgentType(agentType: string): boolean {
  return (
    AGENT_TYPE_CONFIG.validTypes.includes(agentType) ||
    agentType in AGENT_TYPE_CONFIG.typeAliases
  )
}

/**
 * Get the final mapped agent type without validation details
 */
export function getValidAgentType(agentType: string): string {
  return validateAndMapAgentType(agentType).mappedType
}
