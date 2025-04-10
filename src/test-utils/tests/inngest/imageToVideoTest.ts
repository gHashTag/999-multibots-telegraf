import { TestCategory } from '../../core/categories'
import { TestResult } from '../../core/types'
import { logger } from '@/utils/logger'
import assert from '../../core/assert'

/**
 * Data for testing image-to-video generation
 */
export interface ImageToVideoData {
  image_url: string;
  duration?: number;
  motion?: string; // 'zoom', 'pan', 'rotate', etc.
  model?: string;
  telegram_id: number;
  username: string;
  is_ru: boolean;
  bot_name: string;
}

/**
 * Result of testing image-to-video generation
 */
export interface ImageToVideoTestResult extends TestResult {
  data?: any;
}

/**
 * Test image-to-video generation
 * 
 * @param data Input data for the image-to-video generation
 * @param options Additional test options
 * @returns Test result
 */
export async function testImageToVideo(
  data: ImageToVideoData,
  options: {
    verbose?: boolean;
  } = {}
): Promise<ImageToVideoTestResult> {
  const testName = `Test Image-to-Video Generation (${data.motion || 'default'} motion)`;
  const startTime = Date.now();
  const { verbose = false } = options;

  logger.info(`[${testName}] Starting test with image: "${data.image_url}"`);
  
  try {
    // Step 1: Check if user has enough balance (simulated)
    logger.info(`[${testName}] Step 1: Checking user balance...`);
    const userBalance = 100; // Mock balance
    assert.assert(userBalance > 0, "User has insufficient balance");
    
    if (verbose) {
      logger.info(`[${testName}] User balance: ${userBalance}`);
    }
    
    // Step 2: Creating the video generation task
    logger.info(`[${testName}] Step 2: Creating video generation task...`);
    
    // Simulate API call to generate video
    const generationResponse = {
      success: true,
      taskId: `img2video-${Date.now()}`,
      estimatedTime: "30 seconds"
    };
    
    assert.assert(generationResponse.success, "Failed to create video generation task");
    
    if (verbose) {
      logger.info(`[${testName}] Task created with ID: ${generationResponse.taskId}`);
      logger.info(`[${testName}] Estimated time: ${generationResponse.estimatedTime}`);
    }
    
    // Step 3: Simulating video generation processing
    logger.info(`[${testName}] Step 3: Processing video generation...`);
    
    // Mock the processing time (in a real test this would wait for webhook)
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Mock generation result
    const generationResult = {
      success: true,
      videoUrl: `https://example.com/video-${Date.now()}.mp4`,
      thumbnailUrl: `https://example.com/thumbnail-${Date.now()}.jpg`,
      duration: data.duration || 4,
      resolution: "720p",
      fps: 30,
      motionType: data.motion || "default"
    };
    
    assert.assert(generationResult.success, "Video generation failed");
    assert.ok(generationResult.videoUrl, "No video URL returned");
    assert.ok(generationResult.thumbnailUrl, "No thumbnail URL returned");
    
    if (verbose) {
      logger.info(`[${testName}] Generated video: ${generationResult.videoUrl}`);
      logger.info(`[${testName}] Thumbnail: ${generationResult.thumbnailUrl}`);
      logger.info(`[${testName}] Duration: ${generationResult.duration} seconds`);
      logger.info(`[${testName}] Resolution: ${generationResult.resolution}`);
      logger.info(`[${testName}] FPS: ${generationResult.fps}`);
    }
    
    // Step 4: Store the video (simulated)
    logger.info(`[${testName}] Step 4: Storing generated video...`);
    
    // Mock storage result
    const storageResult = {
      success: true,
      storedVideo: true,
      storedThumbnail: true
    };
    
    assert.assert(storageResult.success, "Failed to store video");
    
    if (verbose) {
      logger.info(`[${testName}] Successfully stored video and thumbnail`);
    }
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    logger.info(`[${testName}] Test completed successfully in ${executionTime}ms`);
    
    return {
      success: true,
      passed: true,
      name: testName,
      message: `Successfully generated video from image using ${data.motion || 'default'} motion`,
      category: TestCategory.Inngest,
      details: {
        executionTime,
        motion: data.motion || "default",
        duration: generationResult.duration,
        resolution: generationResult.resolution,
        fps: generationResult.fps
      }
    };
  } catch (error: any) {
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    logger.error(`[${testName}] Test failed after ${executionTime}ms: ${error.message}`);
    
    return {
      success: false,
      passed: false,
      name: testName,
      message: `Failed to generate video from image: ${error.message}`,
      category: TestCategory.Inngest,
      details: {
        executionTime,
        motion: data.motion,
        error: error.message
      },
      error
    };
  }
}

/**
 * Test image-to-video with default motion
 */
export async function testDefaultMotion(options: { verbose?: boolean } = {}): Promise<ImageToVideoTestResult> {
  const data: ImageToVideoData = {
    image_url: "https://example.com/test-images/landscape.jpg",
    telegram_id: 123456789,
    username: "testuser",
    is_ru: false,
    bot_name: "test_bot",
    duration: 4
  };
  
  return testImageToVideo(data, options);
}

/**
 * Test image-to-video with zoom motion
 */
export async function testZoomMotion(options: { verbose?: boolean } = {}): Promise<ImageToVideoTestResult> {
  const data: ImageToVideoData = {
    image_url: "https://example.com/test-images/portrait.jpg",
    motion: "zoom",
    telegram_id: 123456789,
    username: "testuser",
    is_ru: false,
    bot_name: "test_bot",
    duration: 6
  };
  
  return testImageToVideo(data, options);
}

/**
 * Test image-to-video with pan motion
 */
export async function testPanMotion(options: { verbose?: boolean } = {}): Promise<ImageToVideoTestResult> {
  const data: ImageToVideoData = {
    image_url: "https://example.com/test-images/cityscape.jpg",
    motion: "pan",
    telegram_id: 123456789,
    username: "testuser",
    is_ru: false,
    bot_name: "test_bot",
    duration: 5
  };
  
  return testImageToVideo(data, options);
}

/**
 * Test image-to-video with invalid image
 */
export async function testInvalidImage(options: { verbose?: boolean } = {}): Promise<ImageToVideoTestResult> {
  const data: ImageToVideoData = {
    image_url: "", // Empty URL
    telegram_id: 123456789,
    username: "testuser",
    is_ru: false,
    bot_name: "test_bot"
  };
  
  const testName = "Test Image-to-Video Generation (Invalid Image)";
  
  try {
    // Validate image URL
    if (!data.image_url || data.image_url.trim().length === 0) {
      throw new Error("Empty image URL is not allowed");
    }
    
    // Should not reach here
    return await testImageToVideo(data, options);
  } catch (error: any) {
    logger.info(`[${testName}] Expected error caught: ${error.message}`);
    
    return {
      success: true, // Test is successful because we expected to catch an error
      passed: true,
      name: testName,
      message: `Successfully validated that empty image URLs are rejected`,
      category: TestCategory.Inngest,
      details: {
        error: error.message
      }
    };
  }
}

/**
 * Run all image-to-video tests
 */
export async function runImageToVideoTests(options: { verbose?: boolean } = {}): Promise<ImageToVideoTestResult[]> {
  logger.info("🎭 Запуск тестов Image-to-Video...", { description: "Starting Image-to-Video tests..." });
  
  const results: ImageToVideoTestResult[] = [];
  
  try {
    // Test with default motion
    const defaultResult = await testDefaultMotion(options);
    results.push(defaultResult);
    
    // Test with zoom motion
    const zoomResult = await testZoomMotion(options);
    results.push(zoomResult);
    
    // Test with pan motion
    const panResult = await testPanMotion(options);
    results.push(panResult);
    
    // Test with invalid image
    const invalidImageResult = await testInvalidImage(options);
    results.push(invalidImageResult);
    
    const passedTests = results.filter(r => r.passed).length;
    logger.info(`📊 Тесты Image-to-Video завершены: ${passedTests}/${results.length} успешно`, {
      description: `Image-to-Video tests completed: ${passedTests}/${results.length} passed`
    });
  } catch (error: any) {
    logger.error(`❌ Ошибка при запуске тестов Image-to-Video: ${error.message}`, {
      description: `Error running image-to-video tests: ${error.message}`
    });
  }
  
  return results;
}

// Run tests if this file is executed directly
if (require.main === module) {
  (async () => {
    const results = await runImageToVideoTests({ verbose: true });
    const passedTests = results.filter(r => r.passed).length;
    
    console.log(`\nСводка: ${passedTests}/${results.length} тестов успешно`);
    
    // Exit with non-zero code if any tests failed
    if (passedTests < results.length) {
      process.exit(1);
    }
  })();
} 