/**
 * Tests for slugify.ts
 *
 * URL-friendly slug conversion for Inngest
 */

import { describe, it, expect } from 'vitest'
import { slugify } from '@/inngest_app/utils/slugify'

describe('slugify', () => {
  describe('basic transformations', () => {
    it('should convert to lowercase', () => {
      expect(slugify('Hello World')).toBe('hello-world')
    })

    it('should replace spaces with dashes', () => {
      expect(slugify('hello world')).toBe('hello-world')
    })

    it('should replace underscores with dashes', () => {
      expect(slugify('hello_world')).toBe('hello-world')
    })

    it('should handle multiple consecutive spaces', () => {
      expect(slugify('hello   world')).toBe('hello-world')
    })

    it('should handle mixed separators', () => {
      expect(slugify('hello_world test-case')).toBe('hello-world-test-case')
    })
  })

  describe('special character removal', () => {
    it('should remove special characters', () => {
      expect(slugify('hello@world!')).toBe('helloworld')
    })

    it('should remove punctuation', () => {
      expect(slugify('hello, world. test?')).toBe('hello-world-test')
    })

    it('should remove emojis', () => {
      expect(slugify('hello 🎉 world')).toBe('hello-world')
    })

    it('should keep alphanumeric characters', () => {
      expect(slugify('test123')).toBe('test123')
    })

    it('should handle brackets and parentheses', () => {
      expect(slugify('hello [world] (test)')).toBe('hello-world-test')
    })
  })

  describe('trimming', () => {
    it('should trim leading spaces', () => {
      expect(slugify('   hello')).toBe('hello')
    })

    it('should trim trailing spaces', () => {
      expect(slugify('hello   ')).toBe('hello')
    })

    it('should remove leading dashes', () => {
      expect(slugify('-hello')).toBe('hello')
    })

    it('should remove trailing dashes', () => {
      expect(slugify('hello-')).toBe('hello')
    })

    it('should remove multiple leading/trailing dashes', () => {
      expect(slugify('---hello---')).toBe('hello')
    })
  })

  describe('edge cases', () => {
    it('should return empty string for empty input', () => {
      expect(slugify('')).toBe('')
    })

    it('should return empty string for whitespace only', () => {
      expect(slugify('   ')).toBe('')
    })

    it('should return empty string for special chars only', () => {
      expect(slugify('@#$%')).toBe('')
    })

    it('should handle single character', () => {
      expect(slugify('a')).toBe('a')
    })

    it('should handle numbers only', () => {
      expect(slugify('12345')).toBe('12345')
    })
  })

  describe('real-world examples', () => {
    it('should slugify function names', () => {
      expect(slugify('Model Training V2')).toBe('model-training-v2')
    })

    it('should slugify event names', () => {
      expect(slugify('content/Generate Scripts')).toBe(
        'contentgenerate-scripts'
      )
    })

    it('should slugify user input', () => {
      expect(slugify('  My New Model (Test)  ')).toBe('my-new-model-test')
    })

    it('should handle camelCase', () => {
      expect(slugify('camelCaseText')).toBe('camelcasetext')
    })

    it('should handle PascalCase', () => {
      expect(slugify('PascalCaseText')).toBe('pascalcasetext')
    })
  })

  describe('dash handling', () => {
    it('should collapse multiple dashes', () => {
      expect(slugify('hello---world')).toBe('hello-world')
    })

    it('should handle dashes with spaces', () => {
      expect(slugify('hello - world')).toBe('hello-world')
    })

    it('should preserve existing dashes', () => {
      expect(slugify('hello-world')).toBe('hello-world')
    })
  })
})
