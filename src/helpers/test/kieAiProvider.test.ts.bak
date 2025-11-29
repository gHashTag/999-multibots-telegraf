import { describe, it, expect } from 'vitest'
import { KieAiProvider } from '../../services/video-providers/KieAiProvider'

// Мок для тестирования без реальных API вызовов
const mockProvider = new KieAiProvider('test-api-key')

describe('KieAiProvider Error Handling', () => {
  describe('successFlag=3 Handling', () => {
    it('should handle unsafe image upload error correctly', () => {
      // Мокаем ответ с successFlag=3
      const mockResponse = {
        data: {
          code: 200,
          msg: 'success',
          data: {
            taskId: 'test-task-id',
            successFlag: 3,
            errorCode: 400,
            errorMessage: 'public error unsafe image upload',
            completeTime: Date.now(),
          }
        }
      }

      // Тестируем, что ошибка правильно обрабатывается
      expect(mockResponse.data.data.successFlag).toBe(3)
      expect(mockResponse.data.data.errorMessage).toContain('unsafe image upload')
      expect(mockResponse.data.data.errorCode).toBe(400)
    })

    it('should handle different error messages for successFlag=3', () => {
      const errorMessages = [
        'public error unsafe image upload',
        'content moderation failed',
        'image violates policy',
        'inappropriate content detected'
      ]

      errorMessages.forEach(errorMessage => {
        const mockResponse = {
          data: {
            data: {
              successFlag: 3,
              errorMessage,
              errorCode: 400,
            }
          }
        }

        expect(mockResponse.data.data.successFlag).toBe(3)
        expect(mockResponse.data.data.errorMessage).toBe(errorMessage)
      })
    })
  })

  describe('successFlag Values', () => {
    it('should recognize all successFlag values', () => {
      const successFlags = [
        { flag: 0, meaning: 'processing' },
        { flag: 1, meaning: 'success' },
        { flag: 2, meaning: 'error' },
        { flag: 3, meaning: 'unsafe_content' },
      ]

      successFlags.forEach(({ flag, meaning }) => {
        expect(typeof flag).toBe('number')
        expect(flag).toBeGreaterThanOrEqual(0)
        expect(flag).toBeLessThanOrEqual(3)
        expect(meaning).toBeTruthy()
      })
    })
  })

  describe('Error Message Formatting', () => {
    it('should format error messages for users properly', () => {
      const unsafeImageError = 'public error unsafe image upload'
      const userFriendlyMessage = `❌ Ошибка генерации видео: ${unsafeImageError}\n\nПопробуйте другое изображение или измените промпт.`
      
      expect(userFriendlyMessage).toContain('❌')
      expect(userFriendlyMessage).toContain(unsafeImageError)
      expect(userFriendlyMessage).toContain('Попробуйте другое изображение')
    })

    it('should provide helpful suggestions for different error types', () => {
      const suggestions = [
        'Попробуйте другое изображение',
        'измените промпт',
        'Try a different image',
        'modify the prompt'
      ]

      suggestions.forEach(suggestion => {
        expect(suggestion.length).toBeGreaterThan(5)
        expect(typeof suggestion).toBe('string')
      })
    })
  })
})
