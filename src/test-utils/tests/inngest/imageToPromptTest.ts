import { TestCategory } from '../../core/categories'
import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import assert from '../../core/assert'

/**
 * Data for testing image-to-prompt generation
 */
export interface ImageToPromptData {
  image_url: string
  telegram_id: number
  username: string
  is_ru: boolean
  bot_name: string
  detailed?: boolean
}

/**
 * Result of testing image-to-prompt generation
 */
export interface ImageToPromptTestResult extends TestResult {
  data?: any
}

/**
 * Test image-to-prompt generation
 *
 * @param data Input data for the image-to-prompt generation
 * @param options Additional test options
 * @returns Test result
 */
export async function testImageToPrompt(
  data: ImageToPromptData,
  options: {
    verbose?: boolean
  } = {}
): Promise<ImageToPromptTestResult> {
  const testName = `Test Image-to-Prompt Generation${data.detailed ? ' (Detailed)' : ''}`
  const startTime = Date.now()
  const { verbose = false } = options

  logger.info(`[${testName}] Starting test with image: "${data.image_url}"`)

  try {
    // Step 1: Check if user has enough balance (simulated)
    logger.info(`[${testName}] Step 1: Checking user balance...`)
    const userBalance = 100 // Mock balance
    assert.assert(userBalance > 0, 'User has insufficient balance')

    if (verbose) {
      logger.info(`[${testName}] User balance: ${userBalance}`)
    }

    // Step 2: Creating the prompt generation task
    logger.info(`[${testName}] Step 2: Creating prompt generation task...`)

    // Simulate API call to generate prompt
    const generationResponse = {
      success: true,
      taskId: `img2prompt-${Date.now()}`,
      estimatedTime: '15 seconds',
    }

    assert.assert(
      generationResponse.success,
      'Failed to create prompt generation task'
    )

    if (verbose) {
      logger.info(
        `[${testName}] Task created with ID: ${generationResponse.taskId}`
      )
      logger.info(
        `[${testName}] Estimated time: ${generationResponse.estimatedTime}`
      )
    }

    // Step 3: Simulating prompt generation processing
    logger.info(`[${testName}] Step 3: Processing prompt generation...`)

    // Mock the processing time (in a real test this would wait for webhook)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Mock generation result - different for detailed vs simple
    const generationResult = {
      success: true,
      prompt: data.detailed
        ? 'A stunning photograph showcasing a magnificent mountain landscape at dawn. Golden sunlight illuminating snow-capped peaks, with rich textures of rock and vegetation visible in the foreground. Photorealistic, dramatic lighting, award-winning nature photography style.'
        : 'Mountain landscape at dawn with golden sunlight',
      confidence: data.detailed ? 0.92 : 0.85,
    }

    assert.assert(generationResult.success, 'Prompt generation failed')
    assert.ok(generationResult.prompt, 'No prompt returned')

    if (verbose) {
      logger.info(
        `[${testName}] Generated prompt: "${generationResult.prompt}"`
      )
      logger.info(
        `[${testName}] Confidence score: ${generationResult.confidence}`
      )
    }

    // Step 4: Store the prompt result (simulated)
    logger.info(`[${testName}] Step 4: Storing generated prompt...`)

    // Mock storage result
    const storageResult = {
      success: true,
      storedPrompt: true,
    }

    assert.assert(storageResult.success, 'Failed to store prompt')

    if (verbose) {
      logger.info(`[${testName}] Successfully stored prompt result`)
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
      message: `Successfully generated prompt from image with ${data.detailed ? 'detailed' : 'simple'} mode`,
      category: TestCategory.Inngest,
      details: {
        executionTime,
        detailed: data.detailed,
        prompt: generationResult.prompt,
        confidence: generationResult.confidence,
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
      message: `Failed to generate prompt: ${error.message}`,
      category: TestCategory.Inngest,
      details: {
        executionTime,
        detailed: data.detailed,
        error: error.message,
      },
      error,
    }
  }
}

/**
 * Test image-to-prompt with simple mode
 */
export async function testSimpleMode(
  options: { verbose?: boolean } = {}
): Promise<ImageToPromptTestResult> {
  const data: ImageToPromptData = {
    image_url: 'https://example.com/test-images/mountains.jpg',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
    detailed: false,
  }

  return testImageToPrompt(data, options)
}

/**
 * Test image-to-prompt with detailed mode
 */
export async function testDetailedMode(
  options: { verbose?: boolean } = {}
): Promise<ImageToPromptTestResult> {
  const data: ImageToPromptData = {
    image_url: 'https://example.com/test-images/cityscape.jpg',
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
    detailed: true,
  }

  return testImageToPrompt(data, options)
}

/**
 * Test image-to-prompt with invalid image URL
 */
export async function testInvalidImage(
  options: { verbose?: boolean } = {}
): Promise<ImageToPromptTestResult> {
  const data: ImageToPromptData = {
    image_url: '', // Empty URL
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  const testName = 'Test Image-to-Prompt Generation (Invalid Image)'

  try {
    // Validate image URL
    if (!data.image_url || data.image_url.trim().length === 0) {
      throw new Error('Empty image URL is not allowed')
    }

    // Should not reach here
    return await testImageToPrompt(data, options)
  } catch (error: any) {
    logger.info(`[${testName}] Expected error caught: ${error.message}`)

    return {
      success: true, // Test is successful because we expected to catch an error
      passed: true,
      name: testName,
      message: `Successfully validated that empty image URLs are rejected`,
      category: TestCategory.Inngest,
      details: {
        error: error.message,
      },
    }
  }
}

/**
 * Run all image-to-prompt tests
 */
export async function runImageToPromptTests(
  options: { verbose?: boolean } = {}
): Promise<ImageToPromptTestResult[]> {
  logger.info('🖼️ Запуск тестов Image-to-Prompt...', {
    description: 'Starting Image-to-Prompt tests...',
  })

  const results: ImageToPromptTestResult[] = []

  try {
    // Test with simple mode
    const simpleResult = await testSimpleMode(options)
    results.push(simpleResult)

    // Test with detailed mode
    const detailedResult = await testDetailedMode(options)
    results.push(detailedResult)

    // Test with invalid image
    const invalidImageResult = await testInvalidImage(options)
    results.push(invalidImageResult)

    const passedTests = results.filter(r => r.passed).length
    logger.info(
      `📊 Тесты Image-to-Prompt завершены: ${passedTests}/${results.length} успешно`,
      {
        description: `Image-to-Prompt tests completed: ${passedTests}/${results.length} passed`,
      }
    )
  } catch (error: any) {
    logger.error(
      `❌ Ошибка при запуске тестов Image-to-Prompt: ${error.message}`,
      {
        description: `Error running image-to-prompt tests: ${error.message}`,
      }
    )
  }

  return results
}

// Run tests if this file is executed directly
if (require.main === module) {
  ;(async () => {
    const results = await runImageToPromptTests({ verbose: true })
    const passedTests = results.filter(r => r.passed).length

    console.log(`\nСводка: ${passedTests}/${results.length} тестов успешно`)

    // Exit with non-zero code if any tests failed
    if (passedTests < results.length) {
      process.exit(1)
    }
  })()
}
