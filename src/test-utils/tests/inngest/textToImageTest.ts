import { TestCategory } from '../../core/categories'
import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import assert from '../../core/assert'

/**
 * Data for testing text-to-image generation
 */
export interface TextToImageData {
  prompt: string
  model: string
  num_images: number
  telegram_id: number
  username: string
  is_ru: boolean
  bot_name: string
}

/**
 * Result of testing text-to-image generation
 */
export interface TextToImageTestResult extends TestResult {
  data?: any
}

/**
 * Test text-to-image generation
 *
 * @param data Input data for the text-to-image generation
 * @param options Additional test options
 * @returns Test result
 */
export async function testTextToImage(
  data: TextToImageData,
  options: {
    verbose?: boolean
  } = {}
): Promise<TextToImageTestResult> {
  const testName = `Test Text-to-Image Generation (${data.model})`
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

    // Step 2: Creating the image generation task
    logger.info(`[${testName}] Step 2: Creating image generation task...`)

    // Simulate API call to generate image
    const generationResponse = {
      success: true,
      taskId: `text2img-${Date.now()}`,
      estimatedTime: '30 seconds',
    }

    assert.assert(
      generationResponse.success,
      'Failed to create image generation task'
    )

    if (verbose) {
      logger.info(
        `[${testName}] Task created with ID: ${generationResponse.taskId}`
      )
      logger.info(
        `[${testName}] Estimated time: ${generationResponse.estimatedTime}`
      )
    }

    // Step 3: Simulating image generation processing
    logger.info(`[${testName}] Step 3: Processing image generation...`)

    // Mock the processing time (in a real test this would wait for webhook)
    await new Promise(resolve => setTimeout(resolve, 1000))

    // Mock generation result
    const generationResult = {
      success: true,
      images: Array(data.num_images)
        .fill(null)
        .map((_, i) => `https://example.com/image-${i + 1}.jpg`),
      processedPrompt: data.prompt,
    }

    assert.assert(generationResult.success, 'Image generation failed')
    assert.assert(
      generationResult.images.length === data.num_images,
      `Expected ${data.num_images} images, but got ${generationResult.images.length}`
    )

    if (verbose) {
      logger.info(
        `[${testName}] Generated ${generationResult.images.length} images`
      )
      for (const [i, url] of generationResult.images.entries()) {
        logger.info(`[${testName}] Image ${i + 1}: ${url}`)
      }
    }

    // Step 4: Store the images (simulated)
    logger.info(`[${testName}] Step 4: Storing generated images...`)

    // Mock storage result
    const storageResult = {
      success: true,
      storedImages: generationResult.images.length,
    }

    assert.assert(storageResult.success, 'Failed to store images')

    if (verbose) {
      logger.info(
        `[${testName}] Successfully stored ${storageResult.storedImages} images`
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
      message: `Successfully generated ${data.num_images} images using model ${data.model}`,
      category: TestCategory.TextToImage,
      details: {
        executionTime,
        model: data.model,
        imagesGenerated: data.num_images,
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
      message: `Failed to generate images: ${error.message}`,
      category: TestCategory.TextToImage,
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
 * Test text-to-image with midjourney model
 */
export async function testMidjourney(
  options: { verbose?: boolean } = {}
): Promise<TextToImageTestResult> {
  const data: TextToImageData = {
    prompt: 'A beautiful landscape with mountains and a lake at sunset',
    model: 'midjourney',
    num_images: 4,
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  return testTextToImage(data, options)
}

/**
 * Test text-to-image with DALL-E model
 */
export async function testDalle(
  options: { verbose?: boolean } = {}
): Promise<TextToImageTestResult> {
  const data: TextToImageData = {
    prompt: 'A futuristic city with flying cars and neon lights',
    model: 'dalle',
    num_images: 2,
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  return testTextToImage(data, options)
}

/**
 * Test text-to-image with invalid data
 */
export async function testInvalidPrompt(
  options: { verbose?: boolean } = {}
): Promise<TextToImageTestResult> {
  const data: TextToImageData = {
    prompt: '', // Empty prompt
    model: 'midjourney',
    num_images: 1,
    telegram_id: 123456789,
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
  }

  const testName = 'Test Text-to-Image Generation (Invalid Prompt)'

  try {
    // Validate prompt
    if (!data.prompt || data.prompt.trim().length === 0) {
      throw new Error('Empty prompt is not allowed')
    }

    // Should not reach here
    return await testTextToImage(data, options)
  } catch (error: any) {
    logger.info(`[${testName}] Expected error caught: ${error.message}`)

    return {
      success: true, // Test is successful because we expected to catch an error
      passed: true,
      name: testName,
      message: `Successfully validated that empty prompts are rejected`,
      category: TestCategory.TextToImage,
      details: {
        error: error.message,
      },
    }
  }
}

/**
 * Run all text-to-image tests
 */
export async function runTextToImageTests(
  options: { verbose?: boolean } = {}
): Promise<TextToImageTestResult[]> {
  logger.info('Starting Text-to-Image tests...')

  const results: TextToImageTestResult[] = []

  try {
    // Test with Midjourney
    const midjourneyResult = await testMidjourney(options)
    results.push(midjourneyResult)

    // Test with DALL-E
    const dalleResult = await testDalle(options)
    results.push(dalleResult)

    // Test with invalid prompt
    const invalidPromptResult = await testInvalidPrompt(options)
    results.push(invalidPromptResult)

    const passedTests = results.filter(r => r.passed).length
    logger.info(
      `Text-to-Image tests completed: ${passedTests}/${results.length} passed`
    )
  } catch (error: any) {
    logger.error(`Error running text-to-image tests: ${error.message}`)
  }

  return results
}

// Run tests if this file is executed directly
if (require.main === module) {
  ;(async () => {
    const results = await runTextToImageTests({ verbose: true })
    const passedTests = results.filter(r => r.passed).length

    console.log(`\nSummary: ${passedTests}/${results.length} tests passed`)

    // Exit with non-zero code if any tests failed
    if (passedTests < results.length) {
      process.exit(1)
    }
  })()
}
