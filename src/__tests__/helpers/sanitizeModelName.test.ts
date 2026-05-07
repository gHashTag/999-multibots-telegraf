/**
 * Tests for sanitizeModelName.ts
 *
 * Model name sanitization for Replicate API
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  sanitizeModelName,
  isValidReplicateModelName,
} from '@/helpers/sanitizeModelName'

// Suppress console.log during tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {})
})

describe('sanitizeModelName', () => {
  describe('basic transformations', () => {
    it('should convert to lowercase', () => {
      expect(sanitizeModelName('MyModel')).toBe('mymodel')
    })

    it('should replace spaces with dashes', () => {
      expect(sanitizeModelName('my model name')).toBe('my-model-name')
    })

    it('should keep valid characters', () => {
      expect(sanitizeModelName('model123')).toBe('model123')
      expect(sanitizeModelName('my-model')).toBe('my-model')
      expect(sanitizeModelName('my_model')).toBe('my-model') // underscores become dashes
      expect(sanitizeModelName('my.model')).toBe('my.model')
    })
  })

  describe('Cyrillic transliteration', () => {
    it('should transliterate Russian characters', () => {
      expect(sanitizeModelName('Модель')).toBe('model')
    })

    it('should transliterate complex Russian text', () => {
      expect(sanitizeModelName('Александр')).toBe('aleksandr')
    })

    it('should handle mixed Russian and English', () => {
      expect(sanitizeModelName('My Модель 123')).toBe('my-model-123')
    })

    it('should handle special Russian characters', () => {
      expect(sanitizeModelName('Ёлка')).toBe('yolka')
      expect(sanitizeModelName('Щука')).toBe('schuka')
      expect(sanitizeModelName('Цапля')).toBe('tsaplya')
    })
  })

  describe('special character removal', () => {
    it('should remove special characters', () => {
      expect(sanitizeModelName('model!@#$%')).toBe('model')
    })

    it('should remove emojis', () => {
      expect(sanitizeModelName('model 🎉')).toBe('model')
    })

    it('should handle consecutive special characters', () => {
      expect(sanitizeModelName('model---name')).toBe('model-name')
    })
  })

  describe('leading/trailing cleanup', () => {
    it('should remove leading dashes', () => {
      expect(sanitizeModelName('-model')).toBe('model')
    })

    it('should remove trailing dashes', () => {
      expect(sanitizeModelName('model-')).toBe('model')
    })

    it('should remove leading periods', () => {
      expect(sanitizeModelName('.model')).toBe('model')
    })

    it('should remove leading/trailing underscores', () => {
      expect(sanitizeModelName('_model_')).toBe('model')
    })
  })

  describe('length constraints', () => {
    it('should handle minimum length', () => {
      const result = sanitizeModelName('a')
      expect(result.length).toBeGreaterThanOrEqual(2)
      expect(result).toMatch(/^model-\d+$/)
    })

    it('should truncate to 64 characters', () => {
      const longName = 'a'.repeat(100)
      const result = sanitizeModelName(longName)
      expect(result.length).toBeLessThanOrEqual(64)
    })

    it('should remove trailing dash after truncation', () => {
      const name = 'model-' + 'a'.repeat(60)
      const result = sanitizeModelName(name)
      expect(result).not.toMatch(/-$/)
    })
  })

  describe('error handling', () => {
    it('should throw error for empty string', () => {
      expect(() => sanitizeModelName('')).toThrow('Model name cannot be empty')
    })
  })

  describe('real-world examples', () => {
    it('should handle typical user input', () => {
      expect(sanitizeModelName('My New Model 2024')).toBe('my-new-model-2024')
    })

    it('should handle input with special characters and spaces', () => {
      expect(sanitizeModelName('  Model (v2.0)  ')).toBe('model-v2.0')
    })

    it('should handle Russian names', () => {
      expect(sanitizeModelName('Мой аватар')).toBe('moy-avatar')
    })
  })
})

describe('isValidReplicateModelName', () => {
  describe('valid names', () => {
    it('should accept lowercase letters only', () => {
      expect(isValidReplicateModelName('mymodel')).toBe(true)
    })

    it('should accept letters with numbers', () => {
      expect(isValidReplicateModelName('model123')).toBe(true)
    })

    it('should accept dashes', () => {
      expect(isValidReplicateModelName('my-model')).toBe(true)
    })

    it('should accept underscores', () => {
      expect(isValidReplicateModelName('my_model')).toBe(true)
    })

    it('should accept periods', () => {
      expect(isValidReplicateModelName('my.model')).toBe(true)
    })

    it('should accept combined valid characters', () => {
      expect(isValidReplicateModelName('my-model_v1.2')).toBe(true)
    })
  })

  describe('invalid names', () => {
    it('should reject uppercase letters', () => {
      expect(isValidReplicateModelName('MyModel')).toBe(false)
    })

    it('should reject spaces', () => {
      expect(isValidReplicateModelName('my model')).toBe(false)
    })

    it('should reject special characters', () => {
      expect(isValidReplicateModelName('my@model')).toBe(false)
    })

    it('should reject leading dash', () => {
      expect(isValidReplicateModelName('-model')).toBe(false)
    })

    it('should reject trailing dash', () => {
      expect(isValidReplicateModelName('model-')).toBe(false)
    })

    it('should reject leading underscore', () => {
      expect(isValidReplicateModelName('_model')).toBe(false)
    })

    it('should reject trailing period', () => {
      expect(isValidReplicateModelName('model.')).toBe(false)
    })
  })

  describe('length validation', () => {
    it('should reject single character', () => {
      expect(isValidReplicateModelName('a')).toBe(false)
    })

    it('should accept two characters', () => {
      expect(isValidReplicateModelName('ab')).toBe(true)
    })

    it('should accept 64 characters', () => {
      expect(isValidReplicateModelName('a'.repeat(64))).toBe(true)
    })

    it('should reject 65+ characters', () => {
      expect(isValidReplicateModelName('a'.repeat(65))).toBe(false)
    })
  })
})
