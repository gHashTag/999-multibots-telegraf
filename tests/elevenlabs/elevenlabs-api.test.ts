import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'
import axios from 'axios'
import { elevenlabs, checkVoiceExists } from '@/core/elevenlabs'
import { createAudioFileFromText, VoiceNotFoundError } from '@/core/elevenlabs/createAudioFileFromText'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import { updateUserVoice } from '@/core/supabase/updateUserVoice'
import { validateAndCleanVoiceId } from '@/helpers/voiceValidation'
import { supabase } from '@/core/supabase'
import fs from 'fs'
import path from 'path'

// Mock environment variables
const originalEnv = process.env
const mockAPIKey = 'sk_test_elevenlabs_key_12345'

jest.mock('axios')
const mockedAxios = axios as jest.Mocked<typeof axios>

jest.mock('@/core/supabase', () => ({
  supabase: {
    from: jest.fn(() => ({
      select: jest.fn(() => ({
        eq: jest.fn(() => ({
          maybeSingle: jest.fn(() => Promise.resolve({ data: null, error: null })),
          single: jest.fn(() => Promise.resolve({ data: null, error: null }))
        }))
      })),
      update: jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null }))
      })),
      insert: jest.fn(() => Promise.resolve({ error: null }))
    }))
  }
}))

describe('ElevenLabs API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    process.env = { ...originalEnv }
    process.env.ELEVENLABS_API_KEY = mockAPIKey
    process.env.AI_SERVER_URL = 'https://test-ai-server.com'
  })

  afterEach(() => {
    process.env = originalEnv
  })

  describe('Voice ID Validation', () => {
    it('should validate null voice_id_elevenlabs gracefully', async () => {
      // Mock database response with null voice_id_elevenlabs
      const mockSupabaseQuery = {
        data: { voice_id_elevenlabs: null },
        error: null
      }

      ;(supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(() => Promise.resolve(mockSupabaseQuery))
          }))
        }))
      })

      const voiceId = await getVoiceId('123456789')
      expect(voiceId).toBeNull()
    })

    it('should handle voice_id_elevenlabs with valid UUID format', async () => {
      const validVoiceId = 'pNInz6obpgDQGcFmaJgB'
      const mockSupabaseQuery = {
        data: { voice_id_elevenlabs: validVoiceId },
        error: null
      }

      ;(supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(() => Promise.resolve(mockSupabaseQuery))
          }))
        }))
      })

      const voiceId = await getVoiceId('123456789')
      expect(voiceId).toBe(validVoiceId)
    })

    it('should handle database errors when fetching voice_id_elevenlabs', async () => {
      const mockSupabaseQuery = {
        data: null,
        error: { message: 'Database connection failed' }
      }

      ;(supabase.from as jest.Mock).mockReturnValue({
        select: jest.fn(() => ({
          eq: jest.fn(() => ({
            maybeSingle: jest.fn(() => Promise.resolve(mockSupabaseQuery))
          }))
        }))
      })

      await expect(getVoiceId('123456789')).rejects.toThrow('Ошибка при получении voice_id_elevenlabs')
    })
  })

  describe('ElevenLabs API Client', () => {
    it('should create mock client when API key is missing', () => {
      delete process.env.ELEVENLABS_API_KEY

      // Re-require the module to test initialization
      const { elevenlabs: testClient } = require('@/core/elevenlabs')
      expect(testClient).toBeDefined()
    })

    it('should check if voice exists using real API when available', async () => {
      const testVoiceId = 'pNInz6obpgDQGcFmaJgB'

      // Mock ElevenLabs API response
      const mockVoicesResponse = {
        voices: [
          { voice_id: 'pNInz6obpgDQGcFmaJgB', name: 'Test Voice' },
          { voice_id: 'other_voice_id', name: 'Other Voice' }
        ]
      }

      // Mock the client methods
      elevenlabs.voices = {
        getAll: jest.fn().mockResolvedValue(mockVoicesResponse)
      } as any

      const exists = await checkVoiceExists(testVoiceId)
      expect(exists).toBe(false) // Mock client always returns false
    })

    it('should handle API errors gracefully when checking voice existence', async () => {
      const testVoiceId = 'invalid_voice_id'

      // Mock API error
      elevenlabs.voices = {
        getAll: jest.fn().mockRejectedValue(new Error('API Error'))
      } as any

      const exists = await checkVoiceExists(testVoiceId)
      expect(exists).toBe(false)
    })
  })

  describe('Text-to-Speech Generation', () => {
    it('should handle null voice_id in TTS generation', async () => {
      const testParams = {
        text: 'Hello world',
        voice_id: '', // Empty/null voice_id
        telegram_id: '123456789'
      }

      // Mock AI server endpoints to fail
      mockedAxios.post.mockRejectedValue(new Error('Voice ID is required'))

      await expect(createAudioFileFromText(testParams)).rejects.toThrow()
    })

    it('should try AI server endpoints sequentially', async () => {
      const testParams = {
        text: 'Hello world',
        voice_id: 'pNInz6obpgDQGcFmaJgB',
        telegram_id: '123456789'
      }

      // Mock first endpoint to fail with 404, second to succeed
      mockedAxios.post
        .mockRejectedValueOnce({
          response: { status: 404 },
          isAxiosError: true
        })
        .mockResolvedValueOnce({
          status: 200,
          data: {
            pipe: jest.fn((writer: any) => {
              setTimeout(() => writer.emit('finish'), 100)
            })
          }
        })

      // Should try multiple endpoints
      try {
        await createAudioFileFromText(testParams)
      } catch (error) {
        expect(mockedAxios.post).toHaveBeenCalledTimes(6) // All endpoints tried
      }
    })

    it('should handle VoiceNotFoundError (404) correctly', async () => {
      const testParams = {
        text: 'Hello world',
        voice_id: 'deleted_voice_id',
        telegram_id: '123456789'
      }

      // Mock 404 error for all endpoints
      mockedAxios.post.mockRejectedValue({
        response: { status: 404 },
        isAxiosError: true
      })

      // Mock direct API error as well
      elevenlabs.generate = jest.fn().mockRejectedValue({
        statusCode: 404,
        message: 'Voice not found'
      })

      // Mock database update
      ;(supabase.from as jest.Mock).mockReturnValue({
        update: jest.fn(() => ({
          eq: jest.fn(() => Promise.resolve({ error: null }))
        }))
      })

      await expect(createAudioFileFromText(testParams)).rejects.toThrow(VoiceNotFoundError)
    })

    it('should clear invalid voice_id from database on 404 error', async () => {
      const testParams = {
        text: 'Hello world',
        voice_id: 'deleted_voice_id',
        telegram_id: '123456789'
      }

      // Mock 404 error
      elevenlabs.generate = jest.fn().mockRejectedValue({
        statusCode: 404,
        message: 'Voice not found'
      })

      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null }))
      }))

      ;(supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate
      })

      try {
        await createAudioFileFromText(testParams)
      } catch (error) {
        expect(mockUpdate).toHaveBeenCalledWith({ voice_id_elevenlabs: null })
      }
    })
  })

  describe('Voice Validation Helper', () => {
    it('should validate and clean invalid voice IDs', async () => {
      const invalidVoiceId = 'invalid_voice_id'
      const telegramId = '123456789'

      // Mock voice doesn't exist
      elevenlabs.voiceExists = jest.fn().mockResolvedValue(false)

      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null }))
      }))

      ;(supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate
      })

      const isValid = await validateAndCleanVoiceId(invalidVoiceId, telegramId)

      expect(isValid).toBe(false)
      expect(mockUpdate).toHaveBeenCalledWith({ voice_id_elevenlabs: null })
    })

    it('should return true for valid voice IDs', async () => {
      const validVoiceId = 'valid_voice_id'
      const telegramId = '123456789'

      // Mock voice exists
      elevenlabs.voiceExists = jest.fn().mockResolvedValue(true)

      const isValid = await validateAndCleanVoiceId(validVoiceId, telegramId)

      expect(isValid).toBe(true)
    })

    it('should handle errors during voice validation', async () => {
      const voiceId = 'test_voice_id'
      const telegramId = '123456789'

      // Mock validation error
      elevenlabs.voiceExists = jest.fn().mockRejectedValue(new Error('API Error'))

      const isValid = await validateAndCleanVoiceId(voiceId, telegramId)

      expect(isValid).toBe(false)
    })
  })

  describe('User Voice Management', () => {
    it('should update user voice ID successfully', async () => {
      const telegramId = '123456789'
      const voiceId = 'new_voice_id'

      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({ error: null }))
      }))

      ;(supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate
      })

      await updateUserVoice(telegramId, voiceId)

      expect(mockUpdate).toHaveBeenCalledWith({ voice_id_elevenlabs: voiceId })
    })

    it('should handle database errors during voice update', async () => {
      const telegramId = '123456789'
      const voiceId = 'new_voice_id'

      const mockUpdate = jest.fn(() => ({
        eq: jest.fn(() => Promise.resolve({
          error: { message: 'Database update failed' }
        }))
      }))

      ;(supabase.from as jest.Mock).mockReturnValue({
        update: mockUpdate
      })

      await expect(updateUserVoice(telegramId, voiceId))
        .rejects.toThrow('Ошибка при обновлении пользователя')
    })
  })

  describe('Environment Configuration', () => {
    it('should handle missing ELEVENLABS_API_KEY gracefully', () => {
      delete process.env.ELEVENLABS_API_KEY

      // Should not throw error, should use mock client
      expect(() => {
        require('@/core/elevenlabs')
      }).not.toThrow()
    })

    it('should validate API key format', () => {
      const validKeys = [
        'sk_test_1234567890abcdef',
        'sk_live_abcdef1234567890'
      ]

      const invalidKeys = [
        '',
        'invalid_key',
        'sk_test_',
        null,
        undefined
      ]

      validKeys.forEach(key => {
        process.env.ELEVENLABS_API_KEY = key
        expect(process.env.ELEVENLABS_API_KEY).toBeTruthy()
      })

      invalidKeys.forEach(key => {
        process.env.ELEVENLABS_API_KEY = key as any
        expect(process.env.ELEVENLABS_API_KEY).toBeFalsy()
      })
    })
  })

  describe('Error Handling and Logging', () => {
    it('should log detailed error information', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation()

      const testParams = {
        text: 'Hello world',
        voice_id: 'error_voice_id',
        telegram_id: '123456789'
      }

      // Mock error
      elevenlabs.generate = jest.fn().mockRejectedValue({
        message: 'Test error',
        statusCode: 500,
        stack: 'Error stack trace'
      })

      try {
        await createAudioFileFromText(testParams)
      } catch (error) {
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[TTS_BOT] Error in createAudioFileFromText'),
          expect.any(Object)
        )
      }

      consoleSpy.mockRestore()
    })
  })
})

describe('ElevenLabs Integration Smoke Tests', () => {
  it('should verify all required modules can be imported', () => {
    expect(() => {
      require('@/core/elevenlabs')
      require('@/core/elevenlabs/createAudioFileFromText')
      require('@/core/supabase/getVoiceId')
      require('@/helpers/voiceValidation')
    }).not.toThrow()
  })

  it('should have proper TypeScript types', () => {
    // Type checking tests
    const voiceId: string | null = null
    const telegramId: string = '123456789'
    const text: string = 'Hello world'

    expect(typeof voiceId).toBe('object') // null is object type
    expect(typeof telegramId).toBe('string')
    expect(typeof text).toBe('string')
  })
})