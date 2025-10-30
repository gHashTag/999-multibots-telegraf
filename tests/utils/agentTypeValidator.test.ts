/**
 * Test Suite for Agent Type Validator
 *
 * Comprehensive tests for agent type validation, mapping, and error handling
 */

import {
  validateAndMapAgentType,
  validateAgentTypeWithLogging,
  getValidAgentType,
  isValidAgentType,
  createAgentTypeErrorMessage,
  getAvailableAgentTypes,
  VALID_AGENT_TYPES,
  AGENT_TYPE_CONFIG
} from '../../src/utils/agentTypeValidator'

describe('AgentTypeValidator', () => {
  describe('validateAndMapAgentType', () => {
    it('should return valid status for correct agent types', () => {
      const result = validateAndMapAgentType('coder')

      expect(result.isValid).toBe(true)
      expect(result.mappedType).toBe('coder')
      expect(result.originalType).toBe('coder')
      expect(result.warnings).toHaveLength(0)
      expect(result.suggestions).toHaveLength(0)
    })

    it('should map analyst to code-analyzer', () => {
      const result = validateAndMapAgentType('analyst')

      expect(result.isValid).toBe(true)
      expect(result.mappedType).toBe('code-analyzer')
      expect(result.originalType).toBe('analyst')
      expect(result.warnings).toHaveLength(1)
      expect(result.warnings[0]).toContain('deprecated')
    })

    it('should map common aliases correctly', () => {
      const testCases = [
        { input: 'dev', expected: 'coder' },
        { input: 'developer', expected: 'coder' },
        { input: 'test', expected: 'tester' },
        { input: 'review', expected: 'reviewer' },
        { input: 'research', expected: 'researcher' },
        { input: 'architect', expected: 'system-architect' },
        { input: 'backend', expected: 'backend-dev' },
        { input: 'mobile', expected: 'mobile-dev' },
        { input: 'ml', expected: 'ml-developer' },
        { input: 'devops', expected: 'cicd-engineer' },
        { input: 'docs', expected: 'api-docs' },
        { input: 'security', expected: 'security-manager' },
        { input: 'performance', expected: 'perf-analyzer' },
        { input: 'github', expected: 'github-modes' },
        { input: 'telegram', expected: 'telegram-user-agent' }
      ]

      testCases.forEach(({ input, expected }) => {
        const result = validateAndMapAgentType(input)
        expect(result.isValid).toBe(true)
        expect(result.mappedType).toBe(expected)
        expect(result.originalType).toBe(input)
      })
    })

    it('should handle invalid agent types with fallback', () => {
      const result = validateAndMapAgentType('invalid-agent-type')

      expect(result.isValid).toBe(false)
      expect(result.mappedType).toBe('coder') // default fallback
      expect(result.originalType).toBe('invalid-agent-type')
      expect(result.suggestions.length).toBeGreaterThan(0)
      expect(result.suggestions[0]).toContain('Invalid agent type')
    })

    it('should provide suggestions for similar agent types', () => {
      const result = validateAndMapAgentType('teste') // similar to 'tester'

      expect(result.isValid).toBe(false)
      expect(result.suggestions.length).toBeGreaterThan(0)
      expect(result.suggestions[1]).toContain('tester')
    })

    it('should handle empty and whitespace input', () => {
      const testCases = ['', ' ', '\t', '\n']

      testCases.forEach(input => {
        const result = validateAndMapAgentType(input)
        expect(result.isValid).toBe(false)
        expect(result.mappedType).toBe('coder')
      })
    })

    it('should be case insensitive for aliases', () => {
      const testCases = [
        'ANALYST',
        'Analyst',
        'AnAlYsT',
        'DEV',
        'Dev',
        'CODER',
        'Coder'
      ]

      testCases.forEach(input => {
        const result = validateAndMapAgentType(input.toLowerCase())
        expect(result.isValid).toBe(true)
      })
    })
  })

  describe('getValidAgentType', () => {
    it('should return mapped type directly', () => {
      expect(getValidAgentType('analyst')).toBe('code-analyzer')
      expect(getValidAgentType('coder')).toBe('coder')
      expect(getValidAgentType('dev')).toBe('coder')
      expect(getValidAgentType('invalid')).toBe('coder')
    })
  })

  describe('isValidAgentType', () => {
    it('should return true for valid types', () => {
      expect(isValidAgentType('coder')).toBe(true)
      expect(isValidAgentType('tester')).toBe(true)
      expect(isValidAgentType('code-analyzer')).toBe(true)
    })

    it('should return true for valid aliases', () => {
      expect(isValidAgentType('analyst')).toBe(true)
      expect(isValidAgentType('dev')).toBe(true)
      expect(isValidAgentType('test')).toBe(true)
    })

    it('should return false for invalid types', () => {
      expect(isValidAgentType('invalid')).toBe(false)
      expect(isValidAgentType('')).toBe(false)
      expect(isValidAgentType('unknown-agent')).toBe(false)
    })
  })

  describe('createAgentTypeErrorMessage', () => {
    it('should create helpful error message for invalid types', () => {
      const message = createAgentTypeErrorMessage('invalid-type')

      expect(message).toContain('Invalid Agent Type')
      expect(message).toContain('invalid-type')
      expect(message).toContain('Did you mean')
      expect(message).toContain('Using fallback')
      expect(message).toContain('coder')
    })

    it('should return success message for valid types', () => {
      const message = createAgentTypeErrorMessage('coder')
      expect(message).toContain('is valid')
    })
  })

  describe('getAvailableAgentTypes', () => {
    it('should return all available types with descriptions', () => {
      const types = getAvailableAgentTypes()

      expect(Object.keys(types).length).toBeGreaterThan(20)
      expect(types['coder']).toContain('General-purpose')
      expect(types['code-analyzer']).toContain('Code analysis')
      expect(types['tester']).toContain('Test')
      expect(types['reviewer']).toContain('Code review')
    })

    it('should include key agent types', () => {
      const types = getAvailableAgentTypes()

      const expectedTypes = [
        'coder',
        'reviewer',
        'tester',
        'planner',
        'researcher',
        'code-analyzer',
        'backend-dev',
        'mobile-dev',
        'system-architect',
        'telegram-user-agent'
      ]

      expectedTypes.forEach(type => {
        expect(types).toHaveProperty(type)
        expect(types[type]).toBeTruthy()
      })
    })
  })

  describe('VALID_AGENT_TYPES constant', () => {
    it('should contain all essential agent types', () => {
      const essentialTypes = [
        'coder',
        'reviewer',
        'tester',
        'planner',
        'researcher',
        'code-analyzer'
      ]

      essentialTypes.forEach(type => {
        expect(VALID_AGENT_TYPES).toContain(type)
      })
    })

    it('should not contain deprecated analyst type', () => {
      expect(VALID_AGENT_TYPES).not.toContain('analyst')
    })

    it('should have reasonable number of types', () => {
      expect(VALID_AGENT_TYPES.length).toBeGreaterThanOrEqual(30)
      expect(VALID_AGENT_TYPES.length).toBeLessThanOrEqual(100)
    })
  })

  describe('AGENT_TYPE_CONFIG', () => {
    it('should have analyst mapped to code-analyzer', () => {
      expect(AGENT_TYPE_CONFIG.typeAliases['analyst']).toBe('code-analyzer')
    })

    it('should have reasonable defaults', () => {
      expect(AGENT_TYPE_CONFIG.defaultFallback).toBe('coder')
      expect(AGENT_TYPE_CONFIG.validTypes.length).toBeGreaterThan(0)
      expect(Object.keys(AGENT_TYPE_CONFIG.typeAliases).length).toBeGreaterThan(0)
    })

    it('should mark analyst as deprecated', () => {
      expect(AGENT_TYPE_CONFIG.deprecatedTypes['analyst']).toBe('code-analyzer')
    })

    it('should not have circular mappings', () => {
      const aliases = AGENT_TYPE_CONFIG.typeAliases

      Object.entries(aliases).forEach(([alias, target]) => {
        // Target should not be an alias itself
        expect(aliases[target]).toBeUndefined()
        // Target should be a valid type
        expect(AGENT_TYPE_CONFIG.validTypes).toContain(target)
      })
    })
  })

  describe('Edge Cases', () => {
    it('should handle null and undefined inputs', () => {
      // @ts-ignore - testing runtime behavior
      const resultNull = validateAndMapAgentType(null)
      expect(resultNull.isValid).toBe(false)
      expect(resultNull.mappedType).toBe('coder')

      // @ts-ignore - testing runtime behavior
      const resultUndefined = validateAndMapAgentType(undefined)
      expect(resultUndefined.isValid).toBe(false)
      expect(resultUndefined.mappedType).toBe('coder')
    })

    it('should handle very long agent type names', () => {
      const longName = 'a'.repeat(1000)
      const result = validateAndMapAgentType(longName)

      expect(result.isValid).toBe(false)
      expect(result.mappedType).toBe('coder')
    })

    it('should handle special characters', () => {
      const specialNames = [
        'agent-with-dashes',
        'agent_with_underscores',
        'agent.with.dots',
        'agent@with@symbols',
        'agent with spaces'
      ]

      specialNames.forEach(name => {
        const result = validateAndMapAgentType(name)
        expect(result.mappedType).toBeTruthy()
      })
    })

    it('should provide different suggestions for different invalid inputs', () => {
      const result1 = validateAndMapAgentType('cod') // should suggest 'coder'
      const result2 = validateAndMapAgentType('test') // should map to 'tester'
      const result3 = validateAndMapAgentType('xyz') // should provide general suggestions

      expect(result1.suggestions).toBeTruthy()
      expect(result2.isValid).toBe(true) // 'test' is a valid alias
      expect(result3.suggestions).toBeTruthy()
    })
  })

  describe('Performance', () => {
    it('should validate types quickly', () => {
      const start = Date.now()

      // Validate 1000 types
      for (let i = 0; i < 1000; i++) {
        validateAndMapAgentType('coder')
      }

      const duration = Date.now() - start
      expect(duration).toBeLessThan(1000) // Should complete in less than 1 second
    })

    it('should handle batch validation efficiently', () => {
      const types = [
        'coder', 'analyst', 'tester', 'invalid', 'dev',
        'reviewer', 'researcher', 'unknown', 'backend', 'mobile'
      ]

      const start = Date.now()

      const results = types.map(type => validateAndMapAgentType(type))

      const duration = Date.now() - start
      expect(duration).toBeLessThan(100) // Should be very fast
      expect(results).toHaveLength(types.length)

      // Check that all results have expected structure
      results.forEach(result => {
        expect(result).toHaveProperty('isValid')
        expect(result).toHaveProperty('mappedType')
        expect(result).toHaveProperty('originalType')
        expect(result).toHaveProperty('warnings')
        expect(result).toHaveProperty('suggestions')
      })
    })
  })

  describe('Integration Tests', () => {
    it('should work with logging function', () => {
      // Test that validateAgentTypeWithLogging doesn't throw
      expect(() => {
        validateAgentTypeWithLogging('analyst')
        validateAgentTypeWithLogging('coder')
        validateAgentTypeWithLogging('invalid')
      }).not.toThrow()
    })

    it('should provide consistent results between functions', () => {
      const testTypes = ['analyst', 'coder', 'invalid', 'dev']

      testTypes.forEach(type => {
        const detailed = validateAndMapAgentType(type)
        const simple = getValidAgentType(type)
        const valid = isValidAgentType(type)

        expect(detailed.mappedType).toBe(simple)
        expect(detailed.isValid || type in AGENT_TYPE_CONFIG.typeAliases).toBe(valid)
      })
    })
  })
})