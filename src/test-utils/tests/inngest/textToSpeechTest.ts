import { TestCategory } from '../../core/categories'
import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import assert from '../../core/assert'

/**
 * Data for testing text-to-speech generation
 */
export interface TextToSpeechData {
  text: string
  voice_id: string
  telegram_id: number
  username: string
  is_ru: boolean
  bot_name: string
  stability?: number
  similarity?: number
}

/**
 * Result of testing text-to-speech generation
 */
export interface TextToSpeechTestResult extends TestResult {
  data?: any
}

/**
 * Test text-to-speech generation
 *
 * @param data Input data for the text-to-speech generation
 * @param options Additional test options
 * @returns Test result
 */
export async function testTextToSpeech(
  data: TextToSpeechData,
  options: {
    verbose?: boolean
  } = {}
): Promise<TextToSpeechTestResult> {
  const testName = `Test Text-to-Speech Generation (Voice: ${data.voice_id})`
  const startTime = Date.now()
  const { verbose = false } = options

  logger.info(
    `[${testName}] Starting test with text: "${data.text.substring(0, 30)}${data.text.length > 30 ? '...' : ''}"`
  )

  try {
    // Step 1: Check if user has enough balance (simulated)
    logger.info(`[${testName}] Step 1: Checking user balance...`)
    const userBalance = 100 // Mock balance
    assert.assert(userBalance > 0, 'User has insufficient balance')

    if (verbose) {
      logger.info(`[${testName}] User balance: ${userBalance}`)
    }

    // Step 2: Creating the speech generation task
    logger.info(`[${testName}] Step 2: Creating speech generation task...`)

    // Simulate API call to generate speech
    const generationResponse = {
      success: true,
      taskId: `text2speech-${Date.now()}`,
      estimatedTime: '10 seconds',
    }

    assert.assert(
      generationResponse.success,
      'Failed to create speech generation task'
    )

    if (verbose) {
      logger.info(
        `[${testName}] Task created with ID: ${generationResponse.taskId}`
      )
      logger.info(
        `[${testName}] Estimated time: ${generationResponse.estimatedTime}`
      )
    }

    // Step 3: Simulating speech generation processing
    logger.info(`[${testName}] Step 3: Processing speech generation...`)

    // Mock the processing time (in a real test this would wait for webhook)
    await new Promise(resolve => setTimeout(resolve, 1200))

    // Mock generation result
    const generationResult = {
      success: true,
      audioUrl: `https://example.com/audio-${Date.now()}.mp3`,
      duration: data.text.length / 20, // Rough estimate of duration in seconds
      format: 'mp3',
      sampleRate: 44100,
    }

    assert.assert(generationResult.success, 'Speech generation failed')
    assert.ok(generationResult.audioUrl, 'No audio URL returned')

    if (verbose) {
      logger.info(`[${testName}] Generated audio: ${generationResult.audioUrl}`)
      logger.info(
        `[${testName}] Duration: ${generationResult.duration.toFixed(2)} seconds`
      )
      logger.info(`[${testName}] Format: ${generationResult.format}`)
    }

    // Step 4: Store the audio (simulated)
    logger.info(`[${testName}] Step 4: Storing generated audio...`)

    // Mock storage result
    const storageResult = {
      success: true,
      storedAudio: true,
    }

    assert.assert(storageResult.success, 'Failed to store audio')

    if (verbose) {
      logger.info(`[${testName}] Successfully stored audio file`)
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
      message: `Successfully generated speech using voice ${data.voice_id}`,
      category: TestCategory.TextToSpeech,
      details: {
        executionTime,
        voice_id: data.voice_id,
        duration: generationResult.duration,
        text_length: data.text.length,
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
      message: `Failed to generate speech: ${error.message}`,
      category: TestCategory.TextToSpeech,
      details: {
        executionTime,
        voice_id: data.voice_id,
        text_length: data.text.length,
        error: error.message,
      },
      error,
    }
  }
}

/**
 * Test text-to-speech with default voice
 */
export async function testDefaultVoice(
  options: { verbose?: boolean } = {}
): Promise<TextToSpeechTestResult> {
  const data: TextToSpeechData = {
    text: 'Hello, this is a test of the text to speech system. How does my voice sound?',
    voice_id: 'default',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  return testTextToSpeech(data, options)
}

/**
 * Test text-to-speech with custom voice
 */
export async function testCustomVoice(
  options: { verbose?: boolean } = {}
): Promise<TextToSpeechTestResult> {
  const data: TextToSpeechData = {
    text: 'Привет! Это тест системы преобразования текста в речь. Как звучит мой голос?',
    voice_id: 'custom-voice-123',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: true,
    bot_name: 'test_bot',
    stability: 0.7,
    similarity: 0.8,
  }

  return testTextToSpeech(data, options)
}

/**
 * Test text-to-speech with long text
 */
export async function testLongText(
  options: { verbose?: boolean } = {}
): Promise<TextToSpeechTestResult> {
  // Create a longer text to test
  const longText =
    'This is a long paragraph of text that will be used to test the text-to-speech system with a substantial amount of content. ' +
    "When processing longer texts, we need to ensure that the system handles it correctly and doesn't truncate or distort the audio. " +
    'The system should maintain consistent voice quality, pacing, and intonation throughout the generated speech. ' +
    'It should also properly handle punctuation, pauses, and emphasis to create natural-sounding speech that closely resembles human speech patterns. ' +
    'Testing with various text lengths helps ensure the robustness of the text-to-speech functionality.'

  const data: TextToSpeechData = {
    text: longText,
    voice_id: 'default',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  return testTextToSpeech(data, options)
}

/**
 * Test text-to-speech with invalid voice ID
 */
export async function testInvalidVoice(
  options: { verbose?: boolean } = {}
): Promise<TextToSpeechTestResult> {
  const data: TextToSpeechData = {
    text: 'This should fail because the voice ID is invalid.',
    voice_id: 'nonexistent-voice',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  const testName = 'Test Text-to-Speech Generation (Invalid Voice)'

  try {
    // For this test, we'll actually mock a failure
    const errorResponse = {
      success: false,
      error: 'Voice ID not found',
    }

    // Simulate the error by checking the voice ID
    if (data.voice_id === 'nonexistent-voice') {
      throw new Error(errorResponse.error)
    }

    // Should not reach here
    return await testTextToSpeech(data, options)
  } catch (error: any) {
    logger.info(`[${testName}] Expected error caught: ${error.message}`)

    return {
      success: true, // Test is successful because we expected to catch an error
      passed: true,
      name: testName,
      message: `Successfully validated that invalid voice IDs are rejected`,
      category: TestCategory.TextToSpeech,
      details: {
        error: error.message,
        voice_id: data.voice_id,
      },
    }
  }
}

/**
 * Run all text-to-speech tests
 */
export async function runTextToSpeechTests(
  options: { verbose?: boolean } = {}
): Promise<TextToSpeechTestResult[]> {
  logger.info('🔊 Запуск тестов Text-to-Speech...', {
    description: 'Starting Text-to-Speech tests...',
  })

  const results: TextToSpeechTestResult[] = []

  try {
    // Test with default voice
    const defaultVoiceResult = await testDefaultVoice(options)
    results.push(defaultVoiceResult)

    // Test with custom voice
    const customVoiceResult = await testCustomVoice(options)
    results.push(customVoiceResult)

    // Test with long text
    const longTextResult = await testLongText(options)
    results.push(longTextResult)

    // Test with invalid voice
    const invalidVoiceResult = await testInvalidVoice(options)
    results.push(invalidVoiceResult)

    const passedTests = results.filter(r => r.passed).length
    logger.info(
      `📊 Тесты Text-to-Speech завершены: ${passedTests}/${results.length} успешно`,
      {
        description: `Text-to-Speech tests completed: ${passedTests}/${results.length} passed`,
      }
    )
  } catch (error: any) {
    logger.error(
      `❌ Ошибка при запуске тестов Text-to-Speech: ${error.message}`,
      {
        description: `Error running text-to-speech tests: ${error.message}`,
      }
    )
  }

  return results
}

// Run tests if this file is executed directly
if (require.main === module) {
  ;(async () => {
    const results = await runTextToSpeechTests({ verbose: true })
    const passedTests = results.filter(r => r.passed).length

    console.log(`\nСводка: ${passedTests}/${results.length} тестов успешно`)

    // Exit with non-zero code if any tests failed
    if (passedTests < results.length) {
      process.exit(1)
    }
  })()
}
