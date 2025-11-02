/**
 * Inngest Functions Tests
 * Test suite for all Inngest functions
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals'
import { allInngestFunctions, getFunctionStatus } from '../registerFunctions'

describe('Inngest Functions', () => {
  describe('Function Registration', () => {
    it('should have all functions registered', () => {
      const functions = allInngestFunctions()
      expect(functions).toBeDefined()
      expect(Array.isArray(functions)).toBe(true)
      expect(functions.length).toBeGreaterThan(0)
    })

    it('should have correct total count', () => {
      const functions = allInngestFunctions()
      expect(functions.length).toBe(22) // Current count
    })

    it('should have correct categories count', () => {
      const status = getFunctionStatus()
      expect(status.total).toBe(22)
      expect(status.categories).toEqual({
        content: 6,
        instagram: 2,
        monitoring: 2,
        training: 2,
        generation: 1,
        payment: 1,
        broadcast: 1,
        render: 3,
        existing: 3,
        test: 1,
      })
    })
  })

  describe('Function Structure', () => {
    it('all functions should have required properties', () => {
      const functions = allInngestFunctions()
      functions.forEach((func, index) => {
        expect(func).toBeDefined()
        expect(typeof func).toBe('object')
        expect(func).toHaveProperty('name')
        expect(func).toHaveProperty('id')
        expect(typeof func.name).toBe('string')
        expect(typeof func.id).toBe('string')
      })
    })

    it('all functions should have unique IDs', () => {
      const functions = allInngestFunctions()
      const ids = functions.map(f => f.id)
      const uniqueIds = new Set(ids)
      expect(uniqueIds.size).toBe(ids.length)
    })
  })

  describe('Common Modules', () => {
    it('should export common validators', async () => {
      const { validateEventData, validateBaseEvent } = await import('../common')
      expect(validateEventData).toBeDefined()
      expect(validateBaseEvent).toBeDefined()
      expect(typeof validateEventData).toBe('function')
      expect(typeof validateBaseEvent).toBe('function')
    })

    it('should export common helpers', async () => {
      const { createInngestLogger, safeAsync } = await import('../common')
      expect(createInngestLogger).toBeDefined()
      expect(safeAsync).toBeDefined()
      expect(typeof createInngestLogger).toBe('function')
      expect(typeof safeAsync).toBe('function')
    })

    it('should export common services', async () => {
      const { db, http, notifications } = await import('../common')
      expect(db).toBeDefined()
      expect(http).toBeDefined()
      expect(notifications).toBeDefined()
    })

    it('should export common types', async () => {
      const { BaseEventData, FunctionResult } = await import('../common')
      expect(BaseEventData).toBeDefined()
      expect(FunctionResult).toBeDefined()
    })
  })

  describe('Function Categories', () => {
    it('should have content functions', () => {
      const contentFunctions = [
        'analyze-competitor-reels',
        'extract-top-content',
        'find-competitors',
        'generate-content-scripts',
        'generate-detailed-script',
        'generate-scenario-clips',
      ]
      const functions = allInngestFunctions()
      const functionIds = functions.map(f => f.id)
      contentFunctions.forEach(id => {
        expect(functionIds).toContain(id)
      })
    })

    it('should have monitoring functions', () => {
      const monitoringFunctions = ['monitoring-critical-error', 'monitoring-log']
      const functions = allInngestFunctions()
      const functionIds = functions.map(f => f.id)
      monitoringFunctions.forEach(id => {
        expect(functionIds).toContain(id)
      })
    })

    it('should have render functions', () => {
      const renderFunctions = ['render', 'render-avatar-video', 'render-riddle']
      const functions = allInngestFunctions()
      const functionIds = functions.map(f => f.id)
      renderFunctions.forEach(id => {
        expect(functionIds).toContain(id)
      })
    })

    it('should have test functions', () => {
      const functions = allInngestFunctions()
      const testFunctions = functions.filter(f => f.id.startsWith('test-'))
      expect(testFunctions.length).toBe(1)
      expect(testFunctions[0].id).toBe('test-simple')
    })
  })

  describe('Event Names', () => {
    it('should have valid event configuration', () => {
      const functions = allInngestFunctions()
      functions.forEach((func, index) => {
        // Each function should have proper structure
        expect(func.name).toMatch(/^[A-Za-z0-9\s\-\.]+$/)
        expect(func.id).toMatch(/^[a-z0-9\-\.]+$/)
      })
    })
  })

  describe('Error Handling', () => {
    it('should handle test function execution', async () => {
      const { testSimpleFunction } = await import('../functions/test')
      expect(testSimpleFunction).toBeDefined()
      expect(testSimpleFunction.name).toBe('🧪 Test Simple Function')
      expect(testSimpleFunction.id).toBe('test-simple')
    })
  })

  describe('Database Integration', () => {
    it('should export database service', async () => {
      const { db } = await import('../common/services')
      expect(db).toBeDefined()
      expect(typeof db.fetchOne).toBe('function')
      expect(typeof db.insert).toBe('function')
      expect(typeof db.update).toBe('function')
      expect(typeof db.delete).toBe('function')
    })
  })

  describe('HTTP Service', () => {
    it('should export HTTP service', async () => {
      const { http } = await import('../common/services')
      expect(http).toBeDefined()
      expect(typeof http.get).toBe('function')
      expect(typeof http.post).toBe('function')
      expect(typeof http.uploadFile).toBe('function')
    })
  })

  describe('Notification Service', () => {
    it('should export notification service', async () => {
      const { notifications } = await import('../common/services')
      expect(notifications).toBeDefined()
      expect(typeof notifications.sendWebhook).toBe('function')
      expect(typeof notifications.sendTelegramNotification).toBe('function')
    })
  })

  describe('Event Service', () => {
    it('should export event service', async () => {
      const { events } = await import('../common/services')
      expect(events).toBeDefined()
      expect(typeof events.send).toBe('function')
    })
  })
})
