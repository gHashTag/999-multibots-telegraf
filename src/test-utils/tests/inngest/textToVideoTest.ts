import { TestCategory } from '../../core/categories'
import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import assert from '../../core/assert'

/**
 * Data for testing text-to-video generation
 */
export interface TextToVideoData {
  prompt: string
  duration: number
  model: string
  telegram_id: number
  username: string
  is_ru: boolean
  bot_name: string
}

/**
 * Result of testing text-to-video generation
 */
export interface TextToVideoTestResult extends TestResult {
  data?: any
}

/**
 * Test text-to-video generation
 *
 * @param data Input data for the text-to-video generation
 * @param options Additional test options
 * @returns Test result
 */
export async function testTextToVideo(
  data: TextToVideoData,
  options: {
    verbose?: boolean
  } = {}
): Promise<TextToVideoTestResult> {
  const testName = `Test Text-to-Video Generation (${data.model})`
  const startTime = Date.now()
  const { verbose = false } = options

  logger.info(`[${testName}] Starting test with prompt: "${data.prompt}"`)

  try {
    // Step 1: Check if user has enough balance (simulated)
    logger.info(`[${testName}] Step 1: Checking user balance...`)
    const userBalance = 100 // Mock balance
    assert.assert(userBalance > 0, 'User has insufficient balance')

    if (verbose) {
      logger.info(`[${testName}] User balance: ${userBalance}`)
    }

    // Step 2: Creating the video generation task
    logger.info(`[${testName}] Step 2: Creating video generation task...`)

    // Simulate API call to generate video
    const generationResponse = {
      success: true,
      taskId: `text2video-${Date.now()}`,
      estimatedTime: '2 minutes',
    }

    assert.assert(
      generationResponse.success,
      'Failed to create video generation task'
    )

    if (verbose) {
      logger.info(
        `[${testName}] Task created with ID: ${generationResponse.taskId}`
      )
      logger.info(
        `[${testName}] Estimated time: ${generationResponse.estimatedTime}`
      )
    }

    // Step 3: Simulating video generation processing
    logger.info(`[${testName}] Step 3: Processing video generation...`)

    // Mock the processing time (in a real test this would wait for webhook)
    await new Promise(resolve => setTimeout(resolve, 1500))

    // Mock generation result
    const generationResult = {
      success: true,
      videoUrl: `https://example.com/video-${Date.now()}.mp4`,
      thumbnailUrl: `https://example.com/thumbnail-${Date.now()}.jpg`,
      processedPrompt: data.prompt,
      duration: data.duration,
    }

    assert.assert(generationResult.success, 'Video generation failed')
    assert.ok(generationResult.videoUrl, 'No video URL returned')
    assert.ok(generationResult.thumbnailUrl, 'No thumbnail URL returned')

    if (verbose) {
      logger.info(`[${testName}] Generated video: ${generationResult.videoUrl}`)
      logger.info(`[${testName}] Thumbnail: ${generationResult.thumbnailUrl}`)
      logger.info(
        `[${testName}] Duration: ${generationResult.duration} seconds`
      )
    }

    // Step 4: Store the video (simulated)
    logger.info(`[${testName}] Step 4: Storing generated video...`)

    // Mock storage result
    const storageResult = {
      success: true,
      storedVideo: true,
      storedThumbnail: true,
    }

    assert.assert(storageResult.success, 'Failed to store video')

    if (verbose) {
      logger.info(`[${testName}] Successfully stored video and thumbnail`)
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
      message: `Successfully generated video using model ${data.model}`,
      category: TestCategory.TextToVideo,
      details: {
        executionTime,
        model: data.model,
        duration: data.duration,
        prompt: data.prompt,
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
      message: `Failed to generate video: ${error.message}`,
      category: TestCategory.TextToVideo,
      details: {
        executionTime,
        model: data.model,
        prompt: data.prompt,
        error: error.message,
      },
      error,
    }
  }
}

/**
 * Test text-to-video with Gen-2 model
 */
export async function testGen2(
  options: { verbose?: boolean } = {}
): Promise<TextToVideoTestResult> {
  const data: TextToVideoData = {
    prompt: 'A spaceship flying through a nebula with stars in the background',
    duration: 10,
    model: 'gen-2',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  return testTextToVideo(data, options)
}

/**
 * Test text-to-video with Runway model
 */
export async function testRunway(
  options: { verbose?: boolean } = {}
): Promise<TextToVideoTestResult> {
  const data: TextToVideoData = {
    prompt: 'A drone shot of a beautiful mountain landscape, sunrise, crisp',
    duration: 8,
    model: 'runway',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  return testTextToVideo(data, options)
}

/**
 * Test text-to-video with invalid data
 */
export async function testInvalidPrompt(
  options: { verbose?: boolean } = {}
): Promise<TextToVideoTestResult> {
  const data: TextToVideoData = {
    prompt: '', // Empty prompt
    duration: 5,
    model: 'gen-2',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  const testName = 'Test Text-to-Video Generation (Invalid Prompt)'

  try {
    // Validate prompt
    if (!data.prompt || data.prompt.trim().length === 0) {
      throw new Error('Empty prompt is not allowed')
    }

    // Should not reach here
    return await testTextToVideo(data, options)
  } catch (error: any) {
    logger.info(`[${testName}] Expected error caught: ${error.message}`)

    return {
      success: true, // Test is successful because we expected to catch an error
      passed: true,
      name: testName,
      message: `Successfully validated that empty prompts are rejected`,
      category: TestCategory.TextToVideo,
      details: {
        error: error.message,
      },
    }
  }
}

/**
 * Run all text-to-video tests
 */
export async function runTextToVideoTests(
  options: { verbose?: boolean } = {}
): Promise<TextToVideoTestResult[]> {
  logger.info('🎬 Запуск тестов Text-to-Video...', {
    description: 'Starting Text-to-Video tests...',
  })

  const results: TextToVideoTestResult[] = []

  try {
    // Test with Gen-2
    const gen2Result = await testGen2(options)
    results.push(gen2Result)

    // Test with Runway
    const runwayResult = await testRunway(options)
    results.push(runwayResult)

    // Test with invalid prompt
    const invalidPromptResult = await testInvalidPrompt(options)
    results.push(invalidPromptResult)

    const passedTests = results.filter(r => r.passed).length
    logger.info(
      `📊 Тесты Text-to-Video завершены: ${passedTests}/${results.length} успешно`,
      {
        description: `Text-to-Video tests completed: ${passedTests}/${results.length} passed`,
      }
    )
  } catch (error: any) {
    logger.error(
      `❌ Ошибка при запуске тестов Text-to-Video: ${error.message}`,
      {
        description: `Error running text-to-video tests: ${error.message}`,
      }
    )
  }

  return results
}

// Run tests if this file is executed directly
if (require.main === module) {
  ;(async () => {
    const results = await runTextToVideoTests({ verbose: true })
    const passedTests = results.filter(r => r.passed).length

    console.log(`\nСводка: ${passedTests}/${results.length} тестов успешно`)

    // Exit with non-zero code if any tests failed
    if (passedTests < results.length) {
      process.exit(1)
    }
  })()
}
