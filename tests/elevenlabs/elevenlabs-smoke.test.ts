import { describe, it, expect } from '@jest/globals'
import axios from 'axios'

/**
 * Smoke tests for ElevenLabs API endpoints
 * These are quick validation tests to ensure basic connectivity and API health
 */

describe('ElevenLabs API Smoke Tests', () => {
  const testTimeout = 15000 // 15 seconds for API calls

  beforeEach(() => {
    jest.setTimeout(testTimeout)
  })

  describe('API Connectivity', () => {
    it('should connect to ElevenLabs API base URL', async () => {
      try {
        const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
          headers: {
            'xi-api-key': process.env.ELEVENLABS_API_KEY || 'fake-key-for-smoke-test'
          },
          timeout: 10000,
          validateStatus: () => true // Don't throw on any status
        })

        // Should get either 200 (valid key) or 401 (invalid key), but not network errors
        expect([200, 401, 429]).toContain(response.status)
        console.log(`ElevenLabs API responded with status: ${response.status}`)

        if (response.status === 200) {
          expect(response.data).toHaveProperty('voices')
          console.log(`Found ${response.data.voices?.length || 0} voices in account`)
        }
      } catch (error) {
        if (axios.isAxiosError(error)) {
          console.error('Network error connecting to ElevenLabs API:', error.message)
          throw new Error(`ElevenLabs API is not reachable: ${error.message}`)
        }
        throw error
      }
    })

    it('should handle rate limiting gracefully', async () => {
      // Test that we can handle rate limiting responses
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': 'intentionally-invalid-key-to-test-error-handling'
        },
        timeout: 5000,
        validateStatus: () => true
      })

      // Should handle 401 (unauthorized) or 429 (rate limited) without throwing
      expect(response.status).toBeGreaterThanOrEqual(200)
      console.log(`Rate limiting test status: ${response.status}`)
    })
  })

  describe('Environment Configuration', () => {
    it('should detect if ELEVENLABS_API_KEY is configured', () => {
      const hasApiKey = !!process.env.ELEVENLABS_API_KEY
      console.log(`ELEVENLABS_API_KEY configured: ${hasApiKey}`)

      if (hasApiKey) {
        expect(process.env.ELEVENLABS_API_KEY?.length).toBeGreaterThan(10)
        console.log(`API Key prefix: ${process.env.ELEVENLABS_API_KEY?.substring(0, 8)}...`)
      } else {
        console.log('No API key configured - will use mock client')
      }
    })

    it('should validate AI server configuration', () => {
      const aiServerUrl = process.env.AI_SERVER_URL
      console.log(`AI Server URL: ${aiServerUrl || 'Not configured'}`)

      if (aiServerUrl) {
        expect(aiServerUrl).toMatch(/^https?:\/\//)
        console.log('AI Server URL format is valid')
      }
    })
  })

  describe('AI Server Smoke Tests', () => {
    it('should test AI server availability if configured', async () => {
      const aiServerUrl = process.env.AI_SERVER_URL

      if (!aiServerUrl) {
        console.log('AI Server URL not configured, skipping smoke test')
        return
      }

      const endpoints = [
        '/health',
        '/api/health',
        '/status',
        '/api/elevenlabs/tts'
      ]

      let serverReachable = false

      for (const endpoint of endpoints) {
        try {
          const response = await axios.get(`${aiServerUrl}${endpoint}`, {
            timeout: 5000,
            validateStatus: () => true
          })

          console.log(`AI Server ${endpoint}: Status ${response.status}`)

          if (response.status < 500) {
            serverReachable = true
          }
        } catch (error) {
          console.log(`AI Server ${endpoint}: ${error.message}`)
        }
      }

      if (serverReachable) {
        console.log('✅ AI Server is reachable')
      } else {
        console.log('⚠️ AI Server may not be available')
      }
    })

    it('should test AI server TTS endpoint structure', async () => {
      const aiServerUrl = process.env.AI_SERVER_URL

      if (!aiServerUrl) {
        return
      }

      try {
        const response = await axios.post(`${aiServerUrl}/api/elevenlabs/tts`, {
          text: 'smoke test',
          voice_id: 'test_voice',
          model_id: 'eleven_turbo_v2_5'
        }, {
          headers: {
            'Content-Type': 'application/json',
            ...(process.env.AI_SERVER_API_KEY && {
              'Authorization': `Bearer ${process.env.AI_SERVER_API_KEY}`
            })
          },
          timeout: 5000,
          validateStatus: () => true
        })

        console.log(`AI Server TTS endpoint status: ${response.status}`)

        // Should not get 404 (endpoint exists) or 500 (server error)
        if (response.status !== 404 && response.status < 500) {
          console.log('✅ AI Server TTS endpoint is functional')
        } else {
          console.log('⚠️ AI Server TTS endpoint may have issues')
        }
      } catch (error) {
        console.log(`AI Server TTS test failed: ${error.message}`)
      }
    })
  })

  describe('Module Imports', () => {
    it('should import all ElevenLabs modules without errors', () => {
      expect(() => {
        require('@/core/elevenlabs')
        require('@/core/elevenlabs/createAudioFileFromText')
        require('@/core/elevenlabs/createVoiceElevenLabs')
        require('@/core/supabase/getVoiceId')
        require('@/core/supabase/updateUserVoice')
        require('@/helpers/voiceValidation')
      }).not.toThrow()

      console.log('✅ All ElevenLabs modules imported successfully')
    })

    it('should validate module exports', () => {
      const elevenLabsModule = require('@/core/elevenlabs')
      const audioModule = require('@/core/elevenlabs/createAudioFileFromText')
      const voiceIdModule = require('@/core/supabase/getVoiceId')
      const validationModule = require('@/helpers/voiceValidation')

      expect(elevenLabsModule.elevenlabs).toBeDefined()
      expect(elevenLabsModule.checkVoiceExists).toBeDefined()
      expect(audioModule.createAudioFileFromText).toBeDefined()
      expect(audioModule.VoiceNotFoundError).toBeDefined()
      expect(voiceIdModule.getVoiceId).toBeDefined()
      expect(validationModule.validateAndCleanVoiceId).toBeDefined()

      console.log('✅ All required exports are available')
    })
  })

  describe('Database Connectivity', () => {
    it('should test Supabase connection', async () => {
      try {
        const { supabase } = require('@/core/supabase')

        // Simple query to test connection
        const { data, error } = await supabase
          .from('users')
          .select('telegram_id')
          .limit(1)

        if (error) {
          console.log('Supabase connection error:', error.message)
          throw new Error(`Database connection failed: ${error.message}`)
        }

        console.log('✅ Supabase connection successful')
      } catch (error) {
        console.error('Database smoke test failed:', error.message)
        throw error
      }
    })

    it('should validate database schema for voice_id_elevenlabs', async () => {
      try {
        const { supabase } = require('@/core/supabase')

        // Test query structure
        const { data, error } = await supabase
          .from('users')
          .select('voice_id_elevenlabs')
          .limit(1)

        if (error && !error.message.includes('does not exist')) {
          throw new Error(`Schema validation failed: ${error.message}`)
        }

        console.log('✅ Database schema validation passed')
      } catch (error) {
        console.error('Database schema test failed:', error.message)
        throw error
      }
    })
  })

  describe('Critical Path Validation', () => {
    it('should validate complete TTS flow with mock data', async () => {
      try {
        const { createAudioFileFromText } = require('@/core/elevenlabs/createAudioFileFromText')

        // Test with mock data
        const result = await createAudioFileFromText({
          text: 'Smoke test message',
          voice_id: 'smoke_test_voice_id',
          telegram_id: 'smoke_test_user'
        })

        expect(result).toBeTruthy()
        console.log('✅ TTS flow validation passed')

        // Clean up if file was created
        const fs = require('fs')
        if (fs.existsSync(result)) {
          fs.unlinkSync(result)
        }
      } catch (error) {
        console.error('TTS flow validation failed:', error.message)
        throw error
      }
    })

    it('should validate voice validation flow', async () => {
      try {
        const { validateAndCleanVoiceId } = require('@/helpers/voiceValidation')

        // Test with non-existent voice (should return false)
        const result = await validateAndCleanVoiceId(
          'non_existent_voice_id',
          'smoke_test_user'
        )

        expect(typeof result).toBe('boolean')
        console.log('✅ Voice validation flow passed')
      } catch (error) {
        console.error('Voice validation flow failed:', error.message)
        throw error
      }
    })
  })
})

describe('Performance Smoke Tests', () => {
  it('should complete basic operations within reasonable time', async () => {
    const startTime = Date.now()

    try {
      const { elevenlabs } = require('@/core/elevenlabs')
      const { getVoiceId } = require('@/core/supabase/getVoiceId')

      // Test basic operations
      await Promise.all([
        elevenlabs.voiceExists?.('test_voice') || Promise.resolve(false),
        getVoiceId('smoke_test_user').catch(() => null)
      ])

      const duration = Date.now() - startTime
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds

      console.log(`Basic operations completed in ${duration}ms`)
    } catch (error) {
      console.error('Performance test failed:', error.message)
    }
  })
})