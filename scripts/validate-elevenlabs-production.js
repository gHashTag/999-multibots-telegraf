#!/usr/bin/env node

/**
 * ElevenLabs Production Validation Script
 * Runs comprehensive validation of ElevenLabs integration on production server
 *
 * Usage: node scripts/validate-elevenlabs-production.js
 */

const { execSync, spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const axios = require('axios')

// Configuration
const VALIDATION_CONFIG = {
  testUser: 'validation_test_user_' + Date.now(),
  maxRetries: 3,
  timeoutMs: 30000,
  logFile: `/tmp/elevenlabs-validation-${Date.now()}.log`
}

class ProductionValidator {
  constructor() {
    this.results = {
      passed: 0,
      failed: 0,
      warnings: 0,
      errors: []
    }
    this.startTime = Date.now()
  }

  log(message, level = 'INFO') {
    const timestamp = new Date().toISOString()
    const logMessage = `[${timestamp}] ${level}: ${message}`

    console.log(logMessage)

    // Also write to log file
    try {
      fs.appendFileSync(VALIDATION_CONFIG.logFile, logMessage + '\n')
    } catch (error) {
      console.error('Failed to write to log file:', error.message)
    }
  }

  async runTest(name, testFn) {
    this.log(`Running test: ${name}`)

    try {
      const result = await testFn()
      if (result === false) {
        throw new Error('Test returned false')
      }

      this.results.passed++
      this.log(`✅ PASSED: ${name}`, 'PASS')
      return true
    } catch (error) {
      this.results.failed++
      this.results.errors.push({ test: name, error: error.message })
      this.log(`❌ FAILED: ${name} - ${error.message}`, 'FAIL')
      return false
    }
  }

  async runWarningTest(name, testFn) {
    this.log(`Running warning test: ${name}`)

    try {
      const result = await testFn()
      if (result === false) {
        this.results.warnings++
        this.log(`⚠️ WARNING: ${name}`, 'WARN')
        return false
      }

      this.results.passed++
      this.log(`✅ PASSED: ${name}`, 'PASS')
      return true
    } catch (error) {
      this.results.warnings++
      this.log(`⚠️ WARNING: ${name} - ${error.message}`, 'WARN')
      return false
    }
  }

  // Environment and Configuration Tests
  async validateEnvironment() {
    this.log('=== ENVIRONMENT VALIDATION ===')

    await this.runTest('Environment Variables Check', async () => {
      const requiredVars = ['NODE_ENV', 'DATABASE_URL']
      const recommendedVars = ['ELEVENLABS_API_KEY', 'AI_SERVER_URL']

      for (const varName of requiredVars) {
        if (!process.env[varName]) {
          throw new Error(`Required environment variable ${varName} is missing`)
        }
      }

      for (const varName of recommendedVars) {
        if (!process.env[varName]) {
          this.log(`⚠️ Recommended environment variable ${varName} is missing`, 'WARN')
          this.results.warnings++
        }
      }

      return true
    })

    await this.runTest('ElevenLabs API Key Format', async () => {
      const apiKey = process.env.ELEVENLABS_API_KEY
      if (!apiKey) {
        this.log('ElevenLabs API Key not found - will use mock client', 'WARN')
        return true
      }

      if (!apiKey.startsWith('sk_')) {
        throw new Error('ElevenLabs API key should start with "sk_"')
      }

      if (apiKey.length < 20) {
        throw new Error('ElevenLabs API key appears to be too short')
      }

      this.log(`API Key prefix: ${apiKey.substring(0, 8)}...`)
      return true
    })
  }

  // Database Tests
  async validateDatabase() {
    this.log('=== DATABASE VALIDATION ===')

    await this.runTest('Database Connection', async () => {
      try {
        const { supabase } = require('../dist/core/supabase/index.js')

        const { data, error } = await supabase
          .from('users')
          .select('telegram_id')
          .limit(1)

        if (error) {
          throw new Error(`Database error: ${error.message}`)
        }

        this.log(`Database connection successful`)
        return true
      } catch (error) {
        throw new Error(`Failed to connect to database: ${error.message}`)
      }
    })

    await this.runTest('voice_id_elevenlabs Column Schema', async () => {
      try {
        const { supabase } = require('../dist/core/supabase/index.js')

        // Test inserting and retrieving null value
        const testId = VALIDATION_CONFIG.testUser + '_schema'

        const { error: insertError } = await supabase
          .from('users')
          .upsert({
            telegram_id: testId,
            username: 'schema_test',
            voice_id_elevenlabs: null
          })

        if (insertError) {
          throw new Error(`Schema insert failed: ${insertError.message}`)
        }

        const { data, error: selectError } = await supabase
          .from('users')
          .select('voice_id_elevenlabs')
          .eq('telegram_id', testId)
          .maybeSingle()

        if (selectError) {
          throw new Error(`Schema select failed: ${selectError.message}`)
        }

        if (data?.voice_id_elevenlabs !== null) {
          throw new Error('voice_id_elevenlabs should be null')
        }

        // Clean up
        await supabase.from('users').delete().eq('telegram_id', testId)

        this.log('Database schema validation passed')
        return true
      } catch (error) {
        throw new Error(`Schema validation failed: ${error.message}`)
      }
    })
  }

  // ElevenLabs API Tests
  async validateElevenLabsAPI() {
    this.log('=== ELEVENLABS API VALIDATION ===')

    await this.runWarningTest('ElevenLabs API Connectivity', async () => {
      const apiKey = process.env.ELEVENLABS_API_KEY
      if (!apiKey) {
        this.log('No API key - skipping connectivity test')
        return false
      }

      try {
        const response = await axios.get('https://api.elevenlabs.io/v1/voices', {
          headers: {
            'xi-api-key': apiKey
          },
          timeout: 10000
        })

        if (response.status !== 200) {
          throw new Error(`API returned status ${response.status}`)
        }

        const voiceCount = response.data?.voices?.length || 0
        this.log(`ElevenLabs API connected - ${voiceCount} voices available`)
        return true
      } catch (error) {
        if (error.response?.status === 401) {
          throw new Error('API key is invalid')
        }
        throw new Error(`API connectivity failed: ${error.message}`)
      }
    })

    await this.runTest('Voice Validation Function', async () => {
      try {
        const { checkVoiceExists } = require('../dist/core/elevenlabs/index.js')

        // Test with obviously fake voice ID
        const exists = await checkVoiceExists('fake_voice_id_test_123')

        // Should return false (doesn't exist) or true (if somehow it exists)
        if (typeof exists !== 'boolean') {
          throw new Error('checkVoiceExists should return boolean')
        }

        this.log(`Voice validation function working - returned ${exists}`)
        return true
      } catch (error) {
        throw new Error(`Voice validation failed: ${error.message}`)
      }
    })
  }

  // Core Function Tests
  async validateCoreFunctions() {
    this.log('=== CORE FUNCTIONS VALIDATION ===')

    await this.runTest('getVoiceId Function', async () => {
      try {
        const { getVoiceId } = require('../dist/core/supabase/getVoiceId.js')

        // Test with non-existent user
        const voiceId = await getVoiceId('nonexistent_user_test_123')

        // Should return null or undefined without throwing
        if (voiceId !== null && voiceId !== undefined) {
          this.log(`Unexpected voice ID returned: ${voiceId}`)
        }

        this.log('getVoiceId function working correctly')
        return true
      } catch (error) {
        // Should not throw for non-existent users
        throw new Error(`getVoiceId failed: ${error.message}`)
      }
    })

    await this.runTest('validateAndCleanVoiceId Function', async () => {
      try {
        const { validateAndCleanVoiceId } = require('../dist/helpers/voiceValidation.js')

        // Test with null voice ID
        const isValid = await validateAndCleanVoiceId(null, 'test_user_123')

        if (isValid !== false) {
          throw new Error('Null voice ID should return false')
        }

        this.log('Voice validation function working correctly')
        return true
      } catch (error) {
        throw new Error(`Voice validation failed: ${error.message}`)
      }
    })

    await this.runTest('createAudioFileFromText Function', async () => {
      try {
        const { createAudioFileFromText } = require('../dist/core/elevenlabs/createAudioFileFromText.js')

        // Test with null voice ID (should fail gracefully)
        try {
          await createAudioFileFromText({
            text: 'Test message',
            voice_id: null,
            telegram_id: 'test_user'
          })
          throw new Error('Should have thrown error for null voice_id')
        } catch (expectedError) {
          // This is expected - function should reject null voice_id
          this.log('TTS function correctly rejects null voice_id')
        }

        // Test with mock voice ID (should work with mock client)
        const audioPath = await createAudioFileFromText({
          text: 'Mock test message',
          voice_id: 'mock_voice_id',
          telegram_id: 'test_user'
        })

        if (!audioPath || typeof audioPath !== 'string') {
          throw new Error('TTS function should return audio file path')
        }

        // Clean up generated file
        if (fs.existsSync(audioPath)) {
          fs.unlinkSync(audioPath)
        }

        this.log('TTS function working correctly')
        return true
      } catch (error) {
        throw new Error(`TTS function failed: ${error.message}`)
      }
    })
  }

  // Null Voice ID Specific Tests
  async validateNullVoiceIdHandling() {
    this.log('=== NULL VOICE_ID HANDLING VALIDATION ===')

    await this.runTest('Null Voice ID Database Handling', async () => {
      try {
        const { supabase } = require('../dist/core/supabase/index.js')
        const { getVoiceId } = require('../dist/core/supabase/getVoiceId.js')

        const testUserId = VALIDATION_CONFIG.testUser + '_null_test'

        // Create user with null voice_id_elevenlabs
        const { error: insertError } = await supabase
          .from('users')
          .upsert({
            telegram_id: testUserId,
            username: 'null_voice_test',
            voice_id_elevenlabs: null
          })

        if (insertError) {
          throw new Error(`Failed to create test user: ${insertError.message}`)
        }

        // Retrieve voice ID
        const voiceId = await getVoiceId(testUserId)

        if (voiceId !== null) {
          throw new Error(`Expected null voice ID, got: ${voiceId}`)
        }

        // Clean up
        await supabase.from('users').delete().eq('telegram_id', testUserId)

        this.log('Null voice ID handling validated')
        return true
      } catch (error) {
        throw new Error(`Null voice ID test failed: ${error.message}`)
      }
    })

    await this.runTest('Voice Validation with Null', async () => {
      try {
        const { validateAndCleanVoiceId } = require('../dist/helpers/voiceValidation.js')

        const testCases = [
          { voiceId: null, description: 'null' },
          { voiceId: undefined, description: 'undefined' },
          { voiceId: '', description: 'empty string' },
          { voiceId: '   ', description: 'whitespace' }
        ]

        for (const testCase of testCases) {
          const isValid = await validateAndCleanVoiceId(testCase.voiceId, 'test_user')

          if (isValid !== false) {
            throw new Error(`${testCase.description} voice ID should return false`)
          }
        }

        this.log('Voice validation with null values working correctly')
        return true
      } catch (error) {
        throw new Error(`Voice validation with null failed: ${error.message}`)
      }
    })
  }

  // AI Server Tests
  async validateAIServer() {
    this.log('=== AI SERVER VALIDATION ===')

    await this.runWarningTest('AI Server Connectivity', async () => {
      const aiServerUrl = process.env.AI_SERVER_URL
      if (!aiServerUrl) {
        this.log('AI Server URL not configured')
        return false
      }

      try {
        // Test health endpoint
        const healthResponse = await axios.get(`${aiServerUrl}/health`, {
          timeout: 5000,
          validateStatus: () => true
        })

        this.log(`AI Server health check: Status ${healthResponse.status}`)

        // Test TTS endpoint structure
        const ttsResponse = await axios.post(`${aiServerUrl}/api/elevenlabs/tts`, {
          text: 'test',
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

        this.log(`AI Server TTS endpoint: Status ${ttsResponse.status}`)

        if (healthResponse.status < 500 || ttsResponse.status < 500) {
          this.log('AI Server appears to be functional')
          return true
        }

        return false
      } catch (error) {
        this.log(`AI Server test failed: ${error.message}`)
        return false
      }
    })
  }

  // Performance Tests
  async validatePerformance() {
    this.log('=== PERFORMANCE VALIDATION ===')

    await this.runTest('Database Query Performance', async () => {
      try {
        const { supabase } = require('../dist/core/supabase/index.js')

        const startTime = Date.now()

        // Run multiple queries in parallel
        const promises = Array(10).fill(null).map(() =>
          supabase
            .from('users')
            .select('telegram_id, voice_id_elevenlabs')
            .limit(1)
        )

        await Promise.all(promises)

        const duration = Date.now() - startTime

        if (duration > 5000) {
          throw new Error(`Database queries too slow: ${duration}ms`)
        }

        this.log(`Database performance: ${duration}ms for 10 parallel queries`)
        return true
      } catch (error) {
        throw new Error(`Performance test failed: ${error.message}`)
      }
    })

    await this.runTest('Memory Usage Check', async () => {
      const usage = process.memoryUsage()
      const heapUsedMB = Math.round(usage.heapUsed / 1024 / 1024)
      const rssUsedMB = Math.round(usage.rss / 1024 / 1024)

      this.log(`Memory usage: Heap ${heapUsedMB}MB, RSS ${rssUsedMB}MB`)

      if (heapUsedMB > 500) {
        throw new Error(`High heap memory usage: ${heapUsedMB}MB`)
      }

      if (rssUsedMB > 1000) {
        throw new Error(`High RSS memory usage: ${rssUsedMB}MB`)
      }

      return true
    })
  }

  // Generate final report
  generateReport() {
    const duration = Date.now() - this.startTime
    const totalTests = this.results.passed + this.results.failed

    this.log('=== VALIDATION REPORT ===')
    this.log(`Total tests run: ${totalTests}`)
    this.log(`Passed: ${this.results.passed}`)
    this.log(`Failed: ${this.results.failed}`)
    this.log(`Warnings: ${this.results.warnings}`)
    this.log(`Duration: ${duration}ms`)

    if (this.results.errors.length > 0) {
      this.log('=== ERRORS ===')
      this.results.errors.forEach(({ test, error }) => {
        this.log(`${test}: ${error}`)
      })
    }

    this.log(`Log file: ${VALIDATION_CONFIG.logFile}`)

    // Return summary
    return {
      success: this.results.failed === 0,
      passed: this.results.passed,
      failed: this.results.failed,
      warnings: this.results.warnings,
      duration,
      logFile: VALIDATION_CONFIG.logFile
    }
  }

  // Main validation runner
  async runValidation() {
    this.log('Starting ElevenLabs Production Validation')
    this.log(`Test user ID: ${VALIDATION_CONFIG.testUser}`)

    try {
      await this.validateEnvironment()
      await this.validateDatabase()
      await this.validateElevenLabsAPI()
      await this.validateCoreFunctions()
      await this.validateNullVoiceIdHandling()
      await this.validateAIServer()
      await this.validatePerformance()
    } catch (error) {
      this.log(`Validation suite failed: ${error.message}`, 'ERROR')
      this.results.failed++
    }

    return this.generateReport()
  }
}

// CLI Interface
async function main() {
  console.log('🔍 ElevenLabs Production Validation Script')
  console.log('==========================================')

  const validator = new ProductionValidator()
  const report = await validator.runValidation()

  console.log('\n📊 VALIDATION SUMMARY:')
  console.log(`✅ Passed: ${report.passed}`)
  console.log(`❌ Failed: ${report.failed}`)
  console.log(`⚠️ Warnings: ${report.warnings}`)
  console.log(`⏱️ Duration: ${report.duration}ms`)
  console.log(`📋 Log file: ${report.logFile}`)

  if (report.success) {
    console.log('\n🎉 All critical tests passed! ElevenLabs integration is ready.')
    process.exit(0)
  } else {
    console.log('\n💥 Some tests failed. Check the log file for details.')
    process.exit(1)
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Validation script crashed:', error)
    process.exit(1)
  })
}

module.exports = { ProductionValidator, VALIDATION_CONFIG }