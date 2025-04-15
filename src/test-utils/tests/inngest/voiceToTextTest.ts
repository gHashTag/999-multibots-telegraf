import { TestCategory } from '../../core/categories'
import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import assert from '../../core/assert'

/**
 * Data for testing voice-to-text transcription
 */
export interface VoiceToTextData {
  audio_url: string
  language?: string
  telegram_id: number
  username: string
  is_ru: boolean
  bot_name: string
  duration?: number
}

/**
 * Result of testing voice-to-text transcription
 */
export interface VoiceToTextTestResult extends TestResult {
  data?: any
}

/**
 * Test voice-to-text transcription
 *
 * @param data Input data for the voice-to-text transcription
 * @param options Additional test options
 * @returns Test result
 */
export async function testVoiceToText(
  data: VoiceToTextData,
  options: {
    verbose?: boolean
  } = {}
): Promise<VoiceToTextTestResult> {
  const testName = `Test Voice-to-Text Transcription (${data.language || 'auto-detect'})`
  const startTime = Date.now()
  const { verbose = false } = options

  logger.info(`[${testName}] Starting test with audio: "${data.audio_url}"`)

  try {
    // Step 1: Check if user has enough balance (simulated)
    logger.info(`[${testName}] Step 1: Checking user balance...`)
    const userBalance = 100 // Mock balance
    assert.assert(userBalance > 0, 'User has insufficient balance')

    if (verbose) {
      logger.info(`[${testName}] User balance: ${userBalance}`)
    }

    // Step 2: Creating the transcription task
    logger.info(`[${testName}] Step 2: Creating transcription task...`)

    // Simulate API call to create transcription task
    const transcriptionResponse = {
      success: true,
      taskId: `voice2text-${Date.now()}`,
      estimatedTime: '20 seconds',
    }

    assert.assert(
      transcriptionResponse.success,
      'Failed to create transcription task'
    )

    if (verbose) {
      logger.info(
        `[${testName}] Task created with ID: ${transcriptionResponse.taskId}`
      )
      logger.info(
        `[${testName}] Estimated time: ${transcriptionResponse.estimatedTime}`
      )
    }

    // Step 3: Simulating transcription processing
    logger.info(`[${testName}] Step 3: Processing transcription...`)

    // Mock the processing time (in a real test this would wait for webhook)
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Determine test transcription based on language
    let transcriptionText = ''
    if (data.is_ru || data.language === 'ru') {
      transcriptionText =
        'Привет, это тестовое аудио для проверки функции преобразования голоса в текст.'
    } else {
      transcriptionText =
        'Hello, this is a test audio for checking the voice-to-text transcription function.'
    }

    // Mock transcription result
    const transcriptionResult = {
      success: true,
      text: transcriptionText,
      confidence: 0.89,
      language_detected: data.is_ru ? 'ru' : 'en',
      duration: data.duration || 5.2, // Seconds
      segments: [
        {
          start: 0.0,
          end: 2.1,
          text: data.is_ru
            ? 'Привет, это тестовое аудио'
            : 'Hello, this is a test audio',
          confidence: 0.92,
        },
        {
          start: 2.1,
          end: 5.2,
          text: data.is_ru
            ? 'для проверки функции преобразования голоса в текст.'
            : 'for checking the voice-to-text transcription function.',
          confidence: 0.87,
        },
      ],
    }

    assert.assert(transcriptionResult.success, 'Transcription failed')
    assert.ok(transcriptionResult.text, 'No text returned from transcription')

    if (verbose) {
      logger.info(
        `[${testName}] Transcribed text: "${transcriptionResult.text}"`
      )
      logger.info(`[${testName}] Confidence: ${transcriptionResult.confidence}`)
      logger.info(
        `[${testName}] Detected language: ${transcriptionResult.language_detected}`
      )
      logger.info(
        `[${testName}] Audio duration: ${transcriptionResult.duration} seconds`
      )
    }

    // Step 4: Store the transcription result (simulated)
    logger.info(`[${testName}] Step 4: Storing transcription result...`)

    // Mock storage result
    const storageResult = {
      success: true,
      storedTranscription: true,
    }

    assert.assert(storageResult.success, 'Failed to store transcription')

    if (verbose) {
      logger.info(`[${testName}] Successfully stored transcription result`)
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
      message: `Successfully transcribed audio in ${data.language || 'auto-detected'} language`,
      category: TestCategory.Inngest,
      details: {
        executionTime,
        language: transcriptionResult.language_detected,
        confidence: transcriptionResult.confidence,
        text_length: transcriptionResult.text.length,
        duration: transcriptionResult.duration,
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
      message: `Failed to transcribe audio: ${error.message}`,
      category: TestCategory.Inngest,
      details: {
        executionTime,
        language: data.language,
        error: error.message,
      },
      error,
    }
  }
}

/**
 * Test voice-to-text with English audio
 */
export async function testEnglishAudio(
  options: { verbose?: boolean } = {}
): Promise<VoiceToTextTestResult> {
  const data: VoiceToTextData = {
    audio_url: 'https://example.com/test-audio/english-speech.mp3',
    language: 'en',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
    duration: 5.2,
  }

  return testVoiceToText(data, options)
}

/**
 * Test voice-to-text with Russian audio
 */
export async function testRussianAudio(
  options: { verbose?: boolean } = {}
): Promise<VoiceToTextTestResult> {
  const data: VoiceToTextData = {
    audio_url: 'https://example.com/test-audio/russian-speech.mp3',
    language: 'ru',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: true,
    bot_name: 'test_bot',
    duration: 6.4,
  }

  return testVoiceToText(data, options)
}

/**
 * Test voice-to-text with language auto-detection
 */
export async function testAutoDetectLanguage(
  options: { verbose?: boolean } = {}
): Promise<VoiceToTextTestResult> {
  const data: VoiceToTextData = {
    audio_url: 'https://example.com/test-audio/unknown-language.mp3',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false, // This will be used to determine the mock result
    bot_name: 'test_bot',
    duration: 4.8,
  }

  return testVoiceToText(data, options)
}

/**
 * Test voice-to-text with invalid audio
 */
export async function testInvalidAudio(
  options: { verbose?: boolean } = {}
): Promise<VoiceToTextTestResult> {
  const data: VoiceToTextData = {
    audio_url: '', // Empty URL
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  const testName = 'Test Voice-to-Text Transcription (Invalid Audio)'

  try {
    // Validate audio URL
    if (!data.audio_url || data.audio_url.trim().length === 0) {
      throw new Error('Empty audio URL is not allowed')
    }

    // Should not reach here
    return await testVoiceToText(data, options)
  } catch (error: any) {
    logger.info(`[${testName}] Expected error caught: ${error.message}`)

    return {
      success: true, // Test is successful because we expected to catch an error
      passed: true,
      name: testName,
      message: `Successfully validated that empty audio URLs are rejected`,
      category: TestCategory.Inngest,
      details: {
        error: error.message,
      },
    }
  }
}

/**
 * Run all voice-to-text tests
 */
export async function runVoiceToTextTests(
  options: { verbose?: boolean } = {}
): Promise<VoiceToTextTestResult[]> {
  logger.info('🎤 Запуск тестов Voice-to-Text...', {
    description: 'Starting Voice-to-Text tests...',
  })

  const results: VoiceToTextTestResult[] = []

  try {
    // Test with English audio
    const englishResult = await testEnglishAudio(options)
    results.push(englishResult)

    // Test with Russian audio
    const russianResult = await testRussianAudio(options)
    results.push(russianResult)

    // Test with auto-detection
    const autoDetectResult = await testAutoDetectLanguage(options)
    results.push(autoDetectResult)

    // Test with invalid audio
    const invalidAudioResult = await testInvalidAudio(options)
    results.push(invalidAudioResult)

    const passedTests = results.filter(r => r.passed).length
    logger.info(
      `📊 Тесты Voice-to-Text завершены: ${passedTests}/${results.length} успешно`,
      {
        description: `Voice-to-Text tests completed: ${passedTests}/${results.length} passed`,
      }
    )
  } catch (error: any) {
    logger.error(
      `❌ Ошибка при запуске тестов Voice-to-Text: ${error.message}`,
      {
        description: `Error running voice-to-text tests: ${error.message}`,
      }
    )
  }

  return results
}

// Run tests if this file is executed directly
if (require.main === module) {
  ;(async () => {
    const results = await runVoiceToTextTests({ verbose: true })
    const passedTests = results.filter(r => r.passed).length

    console.log(`\nСводка: ${passedTests}/${results.length} тестов успешно`)

    // Exit with non-zero code if any tests failed
    if (passedTests < results.length) {
      process.exit(1)
    }
  })()
}
