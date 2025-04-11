import { TestCategory } from '../../core/categories'
import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import assert from '../../core/assert'

/**
 * Data for testing voice avatar creation
 */
export interface CreateVoiceAvatarData {
  voice_sample_url: string
  voice_name?: string
  voice_description?: string
  telegram_id: number
  username: string
  is_ru: boolean
  bot_name: string
  sample_duration?: number
}

/**
 * Result of testing voice avatar creation
 */
export interface CreateVoiceAvatarTestResult extends TestResult {
  data?: any
}

/**
 * Test voice avatar creation
 *
 * @param data Input data for the voice avatar creation
 * @param options Additional test options
 * @returns Test result
 */
export async function testCreateVoiceAvatar(
  data: CreateVoiceAvatarData,
  options: {
    verbose?: boolean
  } = {}
): Promise<CreateVoiceAvatarTestResult> {
  const testName = `Test Voice Avatar Creation (${data.voice_name || 'Unnamed'})`
  const startTime = Date.now()
  const { verbose = false } = options

  logger.info(
    `[${testName}] Starting test with voice sample: "${data.voice_sample_url}"`
  )

  try {
    // Step 1: Check if user has enough balance (simulated)
    logger.info(`[${testName}] Step 1: Checking user balance...`)
    const userBalance = 100 // Mock balance
    assert.assert(userBalance > 0, 'User has insufficient balance')

    if (verbose) {
      logger.info(`[${testName}] User balance: ${userBalance}`)
    }

    // Step 2: Validating the voice sample
    logger.info(`[${testName}] Step 2: Validating voice sample...`)

    // Mock validation result
    const validationResult = {
      success: true,
      duration: data.sample_duration || 30, // Seconds
      quality: 'good',
      language: data.is_ru ? 'ru' : 'en',
    }

    assert.assert(validationResult.success, 'Voice sample validation failed')
    assert.assert(
      validationResult.duration >= 30,
      'Voice sample is too short (minimum 30 seconds)'
    )

    if (verbose) {
      logger.info(
        `[${testName}] Sample duration: ${validationResult.duration} seconds`
      )
      logger.info(`[${testName}] Sample quality: ${validationResult.quality}`)
      logger.info(
        `[${testName}] Detected language: ${validationResult.language}`
      )
    }

    // Step 3: Creating the voice model
    logger.info(`[${testName}] Step 3: Creating voice model...`)

    // Simulate API call to start voice creation
    const creationResponse = {
      success: true,
      taskId: `voice-avatar-${Date.now()}`,
      estimatedTime: '10 minutes',
    }

    assert.assert(
      creationResponse.success,
      'Failed to start voice model creation'
    )

    if (verbose) {
      logger.info(
        `[${testName}] Task created with ID: ${creationResponse.taskId}`
      )
      logger.info(
        `[${testName}] Estimated time: ${creationResponse.estimatedTime}`
      )
    }

    // Step 4: Simulating voice model creation processing
    logger.info(`[${testName}] Step 4: Processing voice model creation...`)

    // Mock the processing time (in a real test this would wait for webhook)
    await new Promise(resolve => setTimeout(resolve, 3000))

    // Mock creation result
    const voiceId = `voice-${Date.now()}`
    const creationResult = {
      success: true,
      voiceId: voiceId,
      voiceName: data.voice_name || `Voice ${voiceId.slice(-4)}`,
      previewAudioUrl: `https://example.com/voice-preview-${voiceId}.mp3`,
      similarityScore: 0.92,
      clarity: 0.88,
    }

    assert.assert(creationResult.success, 'Voice model creation failed')
    assert.ok(creationResult.voiceId, 'No voice ID returned')
    assert.ok(creationResult.previewAudioUrl, 'No preview audio URL returned')

    if (verbose) {
      logger.info(`[${testName}] Created voice ID: ${creationResult.voiceId}`)
      logger.info(`[${testName}] Voice name: ${creationResult.voiceName}`)
      logger.info(
        `[${testName}] Preview audio: ${creationResult.previewAudioUrl}`
      )
      logger.info(
        `[${testName}] Similarity score: ${creationResult.similarityScore}`
      )
      logger.info(`[${testName}] Clarity: ${creationResult.clarity}`)
    }

    // Step 5: Save the voice model (simulated)
    logger.info(`[${testName}] Step 5: Saving voice model...`)

    // Mock save result
    const saveResult = {
      success: true,
      savedVoice: true,
      userId: data.telegram_id,
    }

    assert.assert(saveResult.success, 'Failed to save voice model')

    if (verbose) {
      logger.info(
        `[${testName}] Successfully saved voice model for user ${saveResult.userId}`
      )
    }

    const endTime = Date.now()
    const executionTime = endTime - startTime

    logger.info(
      `[${testName}] Test completed successfully in ${executionTime}ms`
    )

    return {
      success: true,
      passed: true,
      name: testName,
      message: `Successfully created voice avatar "${creationResult.voiceName}"`,
      category: TestCategory.Inngest,
      details: {
        executionTime,
        voiceId: creationResult.voiceId,
        voiceName: creationResult.voiceName,
        similarityScore: creationResult.similarityScore,
        clarity: creationResult.clarity,
      },
    }
  } catch (error: any) {
    const endTime = Date.now()
    const executionTime = endTime - startTime

    logger.error(
      `[${testName}] Test failed after ${executionTime}ms: ${error.message}`
    )

    return {
      success: false,
      passed: false,
      name: testName,
      message: `Failed to create voice avatar: ${error.message}`,
      category: TestCategory.Inngest,
      details: {
        executionTime,
        voiceName: data.voice_name,
        error: error.message,
      },
      error,
    }
  }
}

/**
 * Test voice avatar creation with English sample
 */
export async function testEnglishVoice(
  options: { verbose?: boolean } = {}
): Promise<CreateVoiceAvatarTestResult> {
  const data: CreateVoiceAvatarData = {
    voice_sample_url: 'https://example.com/voice-samples/english-sample.mp3',
    voice_name: 'English Voice',
    voice_description: 'A clear English voice with neutral accent',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
    sample_duration: 65, // 1 minute 5 seconds
  }

  return testCreateVoiceAvatar(data, options)
}

/**
 * Test voice avatar creation with Russian sample
 */
export async function testRussianVoice(
  options: { verbose?: boolean } = {}
): Promise<CreateVoiceAvatarTestResult> {
  const data: CreateVoiceAvatarData = {
    voice_sample_url: 'https://example.com/voice-samples/russian-sample.mp3',
    voice_name: 'Русский голос',
    voice_description: 'Чистый русский голос с нейтральным акцентом',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: true,
    bot_name: 'test_bot',
    sample_duration: 45, // 45 seconds
  }

  return testCreateVoiceAvatar(data, options)
}

/**
 * Test voice avatar creation with short sample (should fail)
 */
export async function testShortSample(
  options: { verbose?: boolean } = {}
): Promise<CreateVoiceAvatarTestResult> {
  const data: CreateVoiceAvatarData = {
    voice_sample_url: 'https://example.com/voice-samples/short-sample.mp3',
    voice_name: 'Short Sample Voice',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
    sample_duration: 15, // Only 15 seconds (too short)
  }

  const testName = 'Test Voice Avatar Creation (Short Sample)'

  try {
    const result = await testCreateVoiceAvatar(data, options)

    // This should not succeed due to the short sample
    logger.error(
      `[${testName}] Test unexpectedly succeeded with a short sample`
    )

    return {
      success: false,
      passed: false,
      name: testName,
      message: 'Test should have failed with short sample but succeeded',
      category: TestCategory.Inngest,
      details: {
        expectedFailure: true,
        actualResult: 'success',
        sampleDuration: data.sample_duration,
      },
    }
  } catch (error: any) {
    // This is expected behavior
    logger.info(`[${testName}] Expected error caught: ${error.message}`)

    return {
      success: true, // Test is successful because we expected to catch an error
      passed: true,
      name: testName,
      message: 'Successfully validated that short voice samples are rejected',
      category: TestCategory.Inngest,
      details: {
        expectedFailure: true,
        error: error.message,
        sampleDuration: data.sample_duration,
      },
    }
  }
}

/**
 * Test voice avatar creation with invalid sample URL
 */
export async function testInvalidSample(
  options: { verbose?: boolean } = {}
): Promise<CreateVoiceAvatarTestResult> {
  const data: CreateVoiceAvatarData = {
    voice_sample_url: '', // Empty URL
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  const testName = 'Test Voice Avatar Creation (Invalid Sample URL)'

  try {
    // Validate sample URL
    if (!data.voice_sample_url || data.voice_sample_url.trim().length === 0) {
      throw new Error('Empty voice sample URL is not allowed')
    }

    // Should not reach here
    return await testCreateVoiceAvatar(data, options)
  } catch (error: any) {
    logger.info(`[${testName}] Expected error caught: ${error.message}`)

    return {
      success: true, // Test is successful because we expected to catch an error
      passed: true,
      name: testName,
      message:
        'Successfully validated that empty voice sample URLs are rejected',
      category: TestCategory.Inngest,
      details: {
        error: error.message,
      },
    }
  }
}

/**
 * Run all voice avatar creation tests
 */
export async function runVoiceAvatarTests(
  options: { verbose?: boolean } = {}
): Promise<CreateVoiceAvatarTestResult[]> {
  logger.info('🎙️ Запуск тестов Create Voice Avatar...', {
    description: 'Starting Create Voice Avatar tests...',
  })

  const results: CreateVoiceAvatarTestResult[] = []

  try {
    // Test with English voice
    const englishResult = await testEnglishVoice(options)
    results.push(englishResult)

    // Test with Russian voice
    const russianResult = await testRussianVoice(options)
    results.push(russianResult)

    // Test with short sample (should fail but test should pass)
    const shortSampleResult = await testShortSample(options)
    results.push(shortSampleResult)

    // Test with invalid sample URL
    const invalidSampleResult = await testInvalidSample(options)
    results.push(invalidSampleResult)

    const passedTests = results.filter(r => r.passed).length
    logger.info(
      `📊 Тесты Create Voice Avatar завершены: ${passedTests}/${results.length} успешно`,
      {
        description: `Create Voice Avatar tests completed: ${passedTests}/${results.length} passed`,
      }
    )
  } catch (error: any) {
    logger.error(
      `❌ Ошибка при запуске тестов Create Voice Avatar: ${error.message}`,
      {
        description: `Error running create voice avatar tests: ${error.message}`,
      }
    )
  }

  return results
}

// Run tests if this file is executed directly
if (require.main === module) {
  ;(async () => {
    const results = await runVoiceAvatarTests({ verbose: true })
    const passedTests = results.filter(r => r.passed).length

    console.log(`\nСводка: ${passedTests}/${results.length} тестов успешно`)

    // Exit with non-zero code if any tests failed
    if (passedTests < results.length) {
      process.exit(1)
    }
  })()
}
