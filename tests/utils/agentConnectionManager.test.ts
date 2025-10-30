/**
 * Test Suite for Agent Connection Manager
 *
 * Tests for agent connection management, retry logic, and health monitoring
 */

import {
  AgentConnectionManager,
  spawnValidatedAgent,
  preValidateAgentType,
  DEFAULT_AGENT_CONFIG
} from '../../src/utils/agentConnectionManager'

// Mock logger to prevent console output during tests
jest.mock('../../src/utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}))

describe('AgentConnectionManager', () => {
  let manager: AgentConnectionManager

  beforeEach(() => {
    manager = new AgentConnectionManager({
      enableHealthChecks: false, // Disable for tests
      maxRetries: 2,
      retryDelayMs: 100
    })
  })

  afterEach(() => {
    manager.destroy()
  })

  describe('Constructor', () => {
    it('should initialize with default config', () => {
      const defaultManager = new AgentConnectionManager()
      expect(defaultManager).toBeInstanceOf(AgentConnectionManager)
      defaultManager.destroy()
    })

    it('should merge custom config with defaults', () => {
      const customManager = new AgentConnectionManager({
        maxRetries: 5,
        retryDelayMs: 2000
      })
      expect(customManager).toBeInstanceOf(AgentConnectionManager)
      customManager.destroy()
    })
  })

  describe('spawnAgentWithValidation', () => {
    it('should spawn agent with valid type', async () => {
      const result = await manager.spawnAgentWithValidation({
        agentType: 'coder',
        description: 'Test coder agent'
      })

      expect(result).toHaveProperty('agentType', 'coder')
      expect(result).toHaveProperty('status', 'active')
    })

    it('should map analyst to code-analyzer', async () => {
      const result = await manager.spawnAgentWithValidation({
        agentType: 'analyst',
        description: 'Test analyst agent'
      })

      expect(result).toHaveProperty('agentType', 'code-analyzer')
      expect(result).toHaveProperty('status', 'active')
    })

    it('should handle invalid agent types with fallback', async () => {
      const result = await manager.spawnAgentWithValidation({
        agentType: 'invalid-agent',
        description: 'Test invalid agent'
      })

      expect(result).toHaveProperty('agentType', 'coder') // fallback
      expect(result).toHaveProperty('status', 'active')
    })

    it('should call success callback', async () => {
      const onSuccess = jest.fn()

      await manager.spawnAgentWithValidation({
        agentType: 'coder',
        description: 'Test agent',
        onSuccess
      })

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })

    it('should update connection status on success', async () => {
      await manager.spawnAgentWithValidation({
        agentType: 'coder',
        description: 'Test agent'
      })

      const status = manager.getConnectionStatus('coder')
      expect(status).toBeDefined()
      expect(status?.isConnected).toBe(true)
      expect(status?.agentType).toBe('coder')
      expect(status?.responseTime).toBeGreaterThan(0)
    })

    it('should handle spawn failures', async () => {
      // Create a manager that will always fail
      const failingManager = new AgentConnectionManager({
        enableHealthChecks: false,
        maxRetries: 1,
        connectionTimeoutMs: 1 // Very short timeout to force failure
      })

      const onError = jest.fn()

      await expect(
        failingManager.spawnAgentWithValidation({
          agentType: 'coder',
          description: 'Test failing agent',
          onError
        })
      ).rejects.toThrow()

      expect(onError).toHaveBeenCalledTimes(1)

      failingManager.destroy()
    })
  })

  describe('Connection Status Management', () => {
    it('should track connection statuses', async () => {
      await manager.spawnAgentWithValidation({
        agentType: 'coder',
        description: 'Test agent 1'
      })

      await manager.spawnAgentWithValidation({
        agentType: 'tester',
        description: 'Test agent 2'
      })

      const allStatuses = manager.getAllConnectionStatuses()
      expect(Object.keys(allStatuses)).toHaveLength(2)
      expect(allStatuses).toHaveProperty('coder')
      expect(allStatuses).toHaveProperty('tester')
    })

    it('should get individual connection status', async () => {
      await manager.spawnAgentWithValidation({
        agentType: 'reviewer',
        description: 'Test reviewer'
      })

      const status = manager.getConnectionStatus('reviewer')
      expect(status).toBeDefined()
      expect(status?.agentType).toBe('reviewer')
      expect(status?.isConnected).toBe(true)
    })

    it('should return undefined for non-existent agent status', () => {
      const status = manager.getConnectionStatus('non-existent')
      expect(status).toBeUndefined()
    })
  })

  describe('Health Checks', () => {
    it('should perform health check with no agents', async () => {
      const health = await manager.performHealthCheck()

      expect(health).toHaveProperty('healthy')
      expect(health).toHaveProperty('unhealthy')
      expect(health).toHaveProperty('total', 0)
      expect(health).toHaveProperty('healthScore', 100)
    })

    it('should perform health check with connected agents', async () => {
      await manager.spawnAgentWithValidation({
        agentType: 'coder',
        description: 'Test agent 1'
      })

      await manager.spawnAgentWithValidation({
        agentType: 'tester',
        description: 'Test agent 2'
      })

      const health = await manager.performHealthCheck()

      expect(health.total).toBe(2)
      expect(health.healthy).toHaveLength(2)
      expect(health.unhealthy).toHaveLength(0)
      expect(health.healthScore).toBe(100)
    })

    it('should calculate health score correctly', async () => {
      // Spawn one successful agent
      await manager.spawnAgentWithValidation({
        agentType: 'coder',
        description: 'Successful agent'
      })

      // Manually set one agent as failed
      manager['updateConnectionStatus']('failed-agent', {
        agentType: 'failed-agent',
        isConnected: false,
        lastConnectionAttempt: new Date(),
        connectionAttempts: 1,
        lastError: 'Connection failed'
      })

      const health = await manager.performHealthCheck()

      expect(health.total).toBe(2)
      expect(health.healthy).toHaveLength(1)
      expect(health.unhealthy).toHaveLength(1)
      expect(health.healthScore).toBe(50)
    })
  })

  describe('Status Report', () => {
    it('should generate status report with no agents', () => {
      const report = manager.getStatusReport()
      expect(report).toContain('No agents connected')
    })

    it('should generate status report with connected agents', async () => {
      await manager.spawnAgentWithValidation({
        agentType: 'coder',
        description: 'Test agent'
      })

      const report = manager.getStatusReport()
      expect(report).toContain('Agent Connection Status')
      expect(report).toContain('Connected: 1/1')
      expect(report).toContain('coder')
    })

    it('should show disconnected agents in report', async () => {
      // Add a failed agent manually
      manager['updateConnectionStatus']('failed-agent', {
        agentType: 'failed-agent',
        isConnected: false,
        lastConnectionAttempt: new Date(),
        connectionAttempts: 1,
        lastError: 'Test error'
      })

      const report = manager.getStatusReport()
      expect(report).toContain('Disconnected Agents')
      expect(report).toContain('failed-agent')
      expect(report).toContain('Test error')
    })
  })

  describe('Cleanup', () => {
    it('should clean up resources on destroy', () => {
      const manager = new AgentConnectionManager({
        enableHealthChecks: true,
        healthCheckIntervalMs: 1000
      })

      manager.destroy()

      // After destroy, status should be empty
      const statuses = manager.getAllConnectionStatuses()
      expect(Object.keys(statuses)).toHaveLength(0)
    })
  })
})

describe('Utility Functions', () => {
  describe('spawnValidatedAgent', () => {
    it('should spawn agent using global manager', async () => {
      const result = await spawnValidatedAgent('coder', 'Test global spawn')

      expect(result).toHaveProperty('agentType', 'coder')
      expect(result).toHaveProperty('status', 'active')
    })

    it('should accept additional options', async () => {
      const onSuccess = jest.fn()

      await spawnValidatedAgent('tester', 'Test with options', {
        timeout: 5000,
        onSuccess
      })

      expect(onSuccess).toHaveBeenCalledTimes(1)
    })
  })

  describe('preValidateAgentType', () => {
    it('should validate correct agent type', () => {
      const result = preValidateAgentType('coder')

      expect(result.isValid).toBe(true)
      expect(result.validatedType).toBe('coder')
      expect(result.errorMessage).toBeUndefined()
    })

    it('should validate and map analyst', () => {
      const result = preValidateAgentType('analyst')

      expect(result.isValid).toBe(true)
      expect(result.validatedType).toBe('code-analyzer')
      expect(result.errorMessage).toContain('mapped to')
    })

    it('should handle invalid agent type', () => {
      const result = preValidateAgentType('invalid-agent')

      expect(result.isValid).toBe(false)
      expect(result.validatedType).toBe('coder') // fallback
      expect(result.errorMessage).toContain('Invalid Agent Type')
    })
  })
})

describe('Configuration Tests', () => {
  it('should have reasonable default config', () => {
    expect(DEFAULT_AGENT_CONFIG.maxRetries).toBeGreaterThan(0)
    expect(DEFAULT_AGENT_CONFIG.retryDelayMs).toBeGreaterThan(0)
    expect(DEFAULT_AGENT_CONFIG.connectionTimeoutMs).toBeGreaterThan(0)
    expect(DEFAULT_AGENT_CONFIG.healthCheckIntervalMs).toBeGreaterThan(0)
  })

  it('should handle edge case configurations', () => {
    const manager = new AgentConnectionManager({
      maxRetries: 0,
      retryDelayMs: 0,
      connectionTimeoutMs: 1,
      enableHealthChecks: false
    })

    expect(manager).toBeInstanceOf(AgentConnectionManager)
    manager.destroy()
  })
})

describe('Error Handling', () => {
  it('should handle malformed options gracefully', async () => {
    const manager = new AgentConnectionManager({ enableHealthChecks: false })

    // Test with minimal options
    const result = await manager.spawnAgentWithValidation({
      agentType: 'coder',
      description: ''
    })

    expect(result).toHaveProperty('agentType', 'coder')
    manager.destroy()
  })

  it('should handle concurrent spawning', async () => {
    const manager = new AgentConnectionManager({ enableHealthChecks: false })

    const promises = [
      manager.spawnAgentWithValidation({ agentType: 'coder', description: 'Agent 1' }),
      manager.spawnAgentWithValidation({ agentType: 'tester', description: 'Agent 2' }),
      manager.spawnAgentWithValidation({ agentType: 'reviewer', description: 'Agent 3' })
    ]

    const results = await Promise.all(promises)

    expect(results).toHaveLength(3)
    results.forEach(result => {
      expect(result).toHaveProperty('status', 'active')
    })

    manager.destroy()
  })
})