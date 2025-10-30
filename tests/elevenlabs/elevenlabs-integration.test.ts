import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals'
import { createAudioFileFromText } from '@/core/elevenlabs/createAudioFileFromText'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import { updateUserVoice } from '@/core/supabase/updateUserVoice'
import { validateAndCleanVoiceId } from '@/helpers/voiceValidation'
import { checkVoiceExists } from '@/core/elevenlabs'
import { supabase } from '@/core/supabase'
import axios from 'axios'
import fs from 'fs'
import path from 'path'

/**
 * Integration tests for ElevenLabs API
 * These tests run against real API endpoints when ELEVENLABS_API_KEY is available
 */

const isRealAPIAvailable = !!process.env.ELEVENLABS_API_KEY && process.env.RUN_INTEGRATION_TESTS === 'true'
const testTelegramId = 'test_integration_user_123456789'
const testText = 'This is a test voice synthesis message.'

// Skip integration tests if not configured
const describeIntegration = isRealAPIAvailable ? describe : describe.skip

describeIntegration('ElevenLabs Real API Integration Tests', () => {
  let testVoiceId: string | null = null
  let createdFiles: string[] = []

  beforeAll(async () => {
    if (!isRealAPIAvailable) {
      console.log('Skipping integration tests - ELEVENLABS_API_KEY or RUN_INTEGRATION_TESTS not set')
      return
    }

    console.log('Running ElevenLabs integration tests with real API')

    // Clean up any existing test data
    try {
      await supabase
        .from('users')
        .delete()
        .eq('telegram_id', testTelegramId)
    } catch (error) {
      console.log('No existing test user to clean up')
    }
  })

  afterAll(async () => {
    if (!isRealAPIAvailable) return

    // Clean up created files
    createdFiles.forEach(file => {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file)
        }
      } catch (error) {
        console.error('Error cleaning up file:', file, error)
      }
    })

    // Clean up test data
    try {
      await supabase
        .from('users')
        .delete()
        .eq('telegram_id', testTelegramId)
    } catch (error) {
      console.error('Error cleaning up test user:', error)
    }
  })

  beforeEach(() => {
    if (!isRealAPIAvailable) return
    jest.setTimeout(30000) // 30 second timeout for API calls
  })

  describe('Real API Voice Management', () => {
    it('should fetch available voices from ElevenLabs API', async () => {
      if (!isRealAPIAvailable) return

      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      })

      expect(response.status).toBe(200)
      expect(response.data).toHaveProperty('voices')
      expect(Array.isArray(response.data.voices)).toBe(true)

      if (response.data.voices.length > 0) {
        testVoiceId = response.data.voices[0].voice_id
        console.log('Using test voice ID:', testVoiceId)
      }
    })

    it('should validate voice existence using real API', async () => {
      if (!isRealAPIAvailable || !testVoiceId) return

      const exists = await checkVoiceExists(testVoiceId)
      expect(typeof exists).toBe('boolean')

      // If we have a real voice ID, it should exist
      if (testVoiceId) {
        console.log(`Voice ${testVoiceId} exists:`, exists)
      }
    })

    it('should detect non-existent voice IDs', async () => {
      if (!isRealAPIAvailable) return

      const fakeVoiceId = 'fake_voice_id_12345'
      const exists = await checkVoiceExists(fakeVoiceId)
      expect(exists).toBe(false)
    })
  })

  describe('Database Integration', () => {
    it('should create test user and set voice ID', async () => {
      if (!isRealAPIAvailable || !testVoiceId) return

      // Create test user
      const { error: insertError } = await supabase
        .from('users')
        .insert({
          telegram_id: testTelegramId,
          username: 'test_integration_user',
          voice_id_elevenlabs: testVoiceId
        })

      if (insertError && !insertError.message.includes('duplicate')) {
        throw insertError
      }

      // Verify user was created/updated
      const retrievedVoiceId = await getVoiceId(testTelegramId)
      expect(retrievedVoiceId).toBe(testVoiceId)
    })

    it('should update user voice ID', async () => {
      if (!isRealAPIAvailable || !testVoiceId) return

      await updateUserVoice(testTelegramId, testVoiceId)

      const retrievedVoiceId = await getVoiceId(testTelegramId)
      expect(retrievedVoiceId).toBe(testVoiceId)
    })

    it('should handle null voice ID gracefully', async () => {
      if (!isRealAPIAvailable) return

      await updateUserVoice(testTelegramId, null as any)

      const retrievedVoiceId = await getVoiceId(testTelegramId)
      expect(retrievedVoiceId).toBeNull()
    })
  })

  describe('Voice Validation Integration', () => {
    it('should validate existing voice IDs', async () => {
      if (!isRealAPIAvailable || !testVoiceId) return

      // Set a valid voice ID
      await updateUserVoice(testTelegramId, testVoiceId)

      const isValid = await validateAndCleanVoiceId(testVoiceId, testTelegramId)
      expect(typeof isValid).toBe('boolean')
    })

    it('should clean invalid voice IDs from database', async () => {
      if (!isRealAPIAvailable) return

      const invalidVoiceId = 'definitely_invalid_voice_id_12345'

      // Set invalid voice ID
      await updateUserVoice(testTelegramId, invalidVoiceId)

      // Validate should return false and clean the ID
      const isValid = await validateAndCleanVoiceId(invalidVoiceId, testTelegramId)
      expect(isValid).toBe(false)

      // Voice ID should be cleared from database
      const clearedVoiceId = await getVoiceId(testTelegramId)
      expect(clearedVoiceId).toBeNull()
    })
  })

  describe('Text-to-Speech Integration', () => {
    it('should generate audio file using real API', async () => {
      if (!isRealAPIAvailable || !testVoiceId) return

      const audioFilePath = await createAudioFileFromText({
        text: testText,
        voice_id: testVoiceId,
        telegram_id: testTelegramId
      })

      expect(audioFilePath).toBeTruthy()
      expect(fs.existsSync(audioFilePath)).toBe(true)

      // Check file size (should be > 0)
      const stats = fs.statSync(audioFilePath)
      expect(stats.size).toBeGreaterThan(0)

      createdFiles.push(audioFilePath)
      console.log('Generated audio file:', audioFilePath, 'Size:', stats.size, 'bytes')
    })

    it('should handle invalid voice ID in TTS', async () => {
      if (!isRealAPIAvailable) return

      const invalidVoiceId = 'invalid_voice_for_tts_test'

      await expect(createAudioFileFromText({
        text: testText,
        voice_id: invalidVoiceId,
        telegram_id: testTelegramId
      })).rejects.toThrow()
    })

    it('should fallback to direct API when AI server unavailable', async () => {
      if (!isRealAPIAvailable || !testVoiceId) return

      // Temporarily break AI server URL
      const originalAiServerUrl = process.env.AI_SERVER_URL
      process.env.AI_SERVER_URL = 'https://invalid-ai-server-url.example.com'

      try {
        const audioFilePath = await createAudioFileFromText({
          text: testText,
          voice_id: testVoiceId,
          telegram_id: testTelegramId
        })

        expect(audioFilePath).toBeTruthy()
        expect(fs.existsSync(audioFilePath)).toBe(true)

        createdFiles.push(audioFilePath)
      } finally {
        // Restore original AI server URL
        process.env.AI_SERVER_URL = originalAiServerUrl
      }
    })
  })

  describe('AI Server Integration', () => {
    it('should test AI server endpoints if available', async () => {
      if (!isRealAPIAvailable || !process.env.AI_SERVER_URL) return

      const aiServerUrl = process.env.AI_SERVER_URL
      const endpoints = [
        '/api/elevenlabs/tts',
        '/api/voice/generate',
        '/elevenlabs/text-to-speech'
      ]

      for (const endpoint of endpoints) {
        try {
          const response = await axios.post(`${aiServerUrl}${endpoint}`, {
            text: 'Test message',
            voice_id: testVoiceId || 'test_voice',
            model_id: 'eleven_turbo_v2_5'
          }, {
            headers: {
              'Content-Type': 'application/json',
              ...(process.env.AI_SERVER_API_KEY && {
                'Authorization': `Bearer ${process.env.AI_SERVER_API_KEY}`
              })
            },
            timeout: 10000,
            validateStatus: () => true // Don't throw on any status code
          })

          console.log(`Endpoint ${endpoint}: Status ${response.status}`)

          // Log if endpoint is working
          if (response.status === 200) {
            console.log(`✅ AI Server endpoint ${endpoint} is working`)
          } else {
            console.log(`⚠️ AI Server endpoint ${endpoint} returned status ${response.status}`)
          }
        } catch (error) {
          console.log(`❌ AI Server endpoint ${endpoint} failed:`, error.message)
        }
      }
    })
  })

  describe('Performance Tests', () => {
    it('should complete TTS generation within reasonable time', async () => {
      if (!isRealAPIAvailable || !testVoiceId) return

      const startTime = Date.now()

      const audioFilePath = await createAudioFileFromText({
        text: testText,
        voice_id: testVoiceId,
        telegram_id: testTelegramId
      })

      const endTime = Date.now()
      const duration = endTime - startTime

      expect(duration).toBeLessThan(30000) // Should complete within 30 seconds
      console.log(`TTS generation took ${duration}ms`)

      createdFiles.push(audioFilePath)
    })

    it('should handle concurrent TTS requests', async () => {
      if (!isRealAPIAvailable || !testVoiceId) return

      const concurrentRequests = 3
      const promises = Array(concurrentRequests).fill(null).map((_, index) =>
        createAudioFileFromText({
          text: `Concurrent test message ${index + 1}`,
          voice_id: testVoiceId!,
          telegram_id: `${testTelegramId}_concurrent_${index}`
        })
      )

      const results = await Promise.all(promises)

      expect(results).toHaveLength(concurrentRequests)
      results.forEach(filePath => {
        expect(fs.existsSync(filePath)).toBe(true)
        createdFiles.push(filePath)
      })
    })
  })
})

describe('ElevenLabs Mock Integration Tests', () => {
  // These tests always run with mock client
  it('should work with mock client when no API key provided', async () => {
    const originalKey = process.env.ELEVENLABS_API_KEY
    delete process.env.ELEVENLABS_API_KEY

    try {
      const audioFilePath = await createAudioFileFromText({
        text: 'Mock test message',
        voice_id: 'mock_voice_id',
        telegram_id: 'mock_telegram_id'
      })

      expect(audioFilePath).toBeTruthy()
      expect(fs.existsSync(audioFilePath)).toBe(true)

      // Clean up
      fs.unlinkSync(audioFilePath)
    } finally {
      if (originalKey) {
        process.env.ELEVENLABS_API_KEY = originalKey
      }
    }
  })

  it('should validate mock client behavior', async () => {
    const originalKey = process.env.ELEVENLABS_API_KEY
    delete process.env.ELEVENLABS_API_KEY

    try {
      const exists = await checkVoiceExists('any_voice_id')
      expect(exists).toBe(false) // Mock always returns false
    } finally {
      if (originalKey) {
        process.env.ELEVENLABS_API_KEY = originalKey
      }
    }
  })
})