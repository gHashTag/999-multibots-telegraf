import { Scenes } from 'telegraf'
import { MyContext } from '@/interfaces'
import { createMockContext, MockContext } from '@/test-utils/core/mockContext'
import { IMockFunction, mockFn } from '@/test-utils/core/mockFunction'
import { expect } from '@/test-utils/core/assert'
import { TestCategory } from '@/test-utils/core/categories'
import { TestResult } from '@/test-utils/core/types'
import { enhanceText } from '@/services/enhanceText'
import { logger } from '@/utils/logger'

// Mock dependencies
const mockedEnhanceText = mockFn<typeof enhanceText>()
const mockedLogger = {
  info: mockFn<typeof logger.info>(),
  error: mockFn<typeof logger.error>()
}

// Test constants
const TEST_USER_ID = 123456789
const TEST_TEXT = 'Test text to enhance'
const ENHANCED_TEXT = 'Enhanced test text'

// Helper function to create test context
function createTestContext(language = 'ru'): MockContext {
  const ctx = createMockContext()
  ctx.from = {
    id: TEST_USER_ID,
    is_bot: false,
    first_name: 'Test',
    language_code: language,
  }
  return ctx
}

// Setup function to reset mocks before each test
function setupTest() {
  mockedEnhanceText.mockReset()
  mockedLogger.info.mockReset()
  mockedLogger.error.mockReset()
}

/**
 * Test entering the textEnhancerScene
 */
async function testTextEnhancerScene_Enter(): Promise<TestResult> {
  try {
    setupTest()
    const ctx = createTestContext()

    // Import and run the scene
    const { textEnhancerScene } = await import('@/scenes/textEnhancerScene')
    await textEnhancerScene.steps[0](ctx as MyContext)

    // Check that the correct message was sent
    const expectedMessage = '✍️ Пожалуйста, отправьте текст, который нужно улучшить'
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining(expectedMessage))

    return {
      name: 'TextEnhancer: Enter Scene',
      category: TestCategory.SCENE,
      success: true,
      message: 'Successfully entered scene and displayed prompt',
    }
  } catch (error) {
    return {
      name: 'TextEnhancer: Enter Scene',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test successful text enhancement
 */
async function testTextEnhancerScene_EnhanceText(): Promise<TestResult> {
  try {
    setupTest()
    const ctx = createTestContext()
    ctx.message = { text: TEST_TEXT } as Scenes.SceneContext['message']

    // Mock enhanceText to return enhanced version
    mockedEnhanceText.mockResolvedValue(ENHANCED_TEXT)

    // Import and run the scene
    const { textEnhancerScene } = await import('@/scenes/textEnhancerScene')
    await textEnhancerScene.steps[1](ctx)

    // Check that enhanceText was called with correct parameters
    expect(mockedEnhanceText).toHaveBeenCalledWith(TEST_TEXT)

    // Check that the enhanced text was sent back
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining(ENHANCED_TEXT))

    // Check that success was logged
    expect(mockedLogger.info).toHaveBeenCalled()

    return {
      name: 'TextEnhancer: Enhance Text',
      category: TestCategory.SCENE,
      success: true,
      message: 'Successfully enhanced and returned text',
    }
  } catch (error) {
    return {
      name: 'TextEnhancer: Enhance Text',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test error handling during text enhancement
 */
async function testTextEnhancerScene_Error(): Promise<TestResult> {
  try {
    setupTest()
    const ctx = createTestContext()
    ctx.message = { text: TEST_TEXT } as Scenes.SceneContext['message']

    // Mock enhanceText to throw error
    mockedEnhanceText.mockRejectedValue(new Error('Test error'))

    // Import and run the scene
    const { textEnhancerScene } = await import('@/scenes/textEnhancerScene')
    await textEnhancerScene.steps[1](ctx)

    // Check that error was logged
    expect(mockedLogger.error).toHaveBeenCalled()

    // Check that error message was sent to user
    const expectedError = '❌ Произошла ошибка при улучшении текста'
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining(expectedError))

    return {
      name: 'TextEnhancer: Error Handling',
      category: TestCategory.SCENE,
      success: true,
      message: 'Successfully handled enhancement error',
    }
  } catch (error) {
    return {
      name: 'TextEnhancer: Error Handling',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test handling of non-text messages
 */
async function testTextEnhancerScene_NonTextMessage(): Promise<TestResult> {
  try {
    setupTest()
    const ctx = createTestContext()
    ctx.message = { photo: [] } as Scenes.SceneContext['message']

    // Import and run the scene
    const { textEnhancerScene } = await import('@/scenes/textEnhancerScene')
    await textEnhancerScene.steps[1](ctx)

    // Check that error message was sent
    const expectedError = '❌ Пожалуйста, отправьте текстовое сообщение'
    expect(ctx.reply).toHaveBeenCalledWith(expect.stringContaining(expectedError))

    return {
      name: 'TextEnhancer: Non-text Message',
      category: TestCategory.SCENE,
      success: true,
      message: 'Successfully handled non-text message',
    }
  } catch (error) {
    return {
      name: 'TextEnhancer: Non-text Message',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Run all textEnhancerScene tests
 */
export async function runTextEnhancerSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testTextEnhancerScene_Enter())
    results.push(await testTextEnhancerScene_EnhanceText())
    results.push(await testTextEnhancerScene_Error())
    results.push(await testTextEnhancerScene_NonTextMessage())
  } catch (error) {
    results.push({
      name: 'TextEnhancer Scene Tests',
      category: TestCategory.SCENE,
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runTextEnhancerSceneTests
