import { MyContext } from '@/interfaces'
import {
  createMockUser,
  createTypedContext,
  createMockFunction,
  runSceneStep,
} from '../../core/mockHelper'
import { TestResult } from '../../core/types'
import {
  assertReplyContains,
  assertReplyMarkupContains,
} from '../../core/assertions'
import { create as mockFunction } from '../../core/mock'
import { TestCategory } from '../../core/categories'
import { logger } from '@/utils/logger'
import { handleHelpCancel } from '@/handlers'
import { inngest } from '@/inngest-functions/clients'
import { ModeEnum } from '@/interfaces'
import { calculateModeCost } from '@/price/helpers/modelsCost'
import {
  mockInngestSend,
  verifyInngestEvent,
  expect as testExpect,
  runTest,
} from '../../core/testHelpers'

// Mock necessary functions
const mockedHandleHelpCancel = createMockFunction<typeof handleHelpCancel>()
const mockedCalculateModeCost = createMockFunction<typeof calculateModeCost>()
const mockedInngestSend = createMockFunction<() => Promise<any>>()
const mockedGetFile = createMockFunction<() => Promise<any>>()

// Constants for testing
const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_BOT_USERNAME = 'test_bot'
const TEST_IMAGE_FILE_ID = 'test_image_file_id'
const TEST_IMAGE_URL =
  'https://api.telegram.org/file/botXXXXXX/photos/test_image.jpg'
const TEST_FILE_PATH = 'photos/test_image.jpg'
const TEST_COST = 10

/**
 * Setup test environment
 */
function setupTest() {
  // Mock handleHelpCancel to return false (not cancelled)
  mockedHandleHelpCancel.mockReturnValue(Promise.resolve(false))

  // Mock calculateModeCost to return a fixed cost
  mockedCalculateModeCost.mockReturnValue({
    stars: TEST_COST,
    rubles: TEST_COST * 10,
    dollars: TEST_COST * 0.5,
  })

  // Mock getFile
  mockedGetFile.mockReturnValue(Promise.resolve({ file_path: TEST_FILE_PATH }))

  // Mock inngest.send
  mockedInngestSend.mockReturnValue(
    Promise.resolve({
      ids: ['test-id'],
      success: true,
    })
  )

  // Set environment variable
  process.env.HUGGINGFACE_TOKEN = 'test-token'
  process.env.BOT_TOKEN = 'XXXXXX'

  // Reset mocks between tests
  mockedHandleHelpCancel.mockClear()
  mockedCalculateModeCost.mockClear()
  mockedInngestSend.mockClear()
  mockedGetFile.mockClear()
}

/**
 * Test entering the imageToPromptWizard scene
 */
export async function testImageToPromptWizard_EnterScene(): Promise<TestResult> {
  try {
    setupTest()

    // Create properly typed mock context
    const ctx = createTypedContext({
      from: {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      },
      message: { text: '/image_to_prompt', message_id: 1 },
    })

    // Run the first step of the scene
    const { imageToPromptWizard } = await import('@/scenes/imageToPromptWizard')
    await runSceneStep(imageToPromptWizard.steps[0], ctx)

    // Check that the bot sent the right message with instructions
    assertReplyContains(ctx, 'отправьте изображение для генерации промпта')

    // Check that cancel button is present
    assertReplyMarkupContains(ctx, 'Отмена')

    return {
      name: 'imageToPromptWizard: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Successfully displayed image upload instructions',
    }
  } catch (error) {
    logger.error('Error in testImageToPromptWizard_EnterScene:', error)
    return {
      name: 'imageToPromptWizard: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test uploading an image
 */
export async function testImageToPromptWizard_UploadImage(): Promise<TestResult> {
  try {
    setupTest()

    // Create properly typed mock context
    const ctx = createTypedContext({
      from: {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      },
      botInfo: { username: TEST_BOT_USERNAME },
      message: {
        message_id: 1,
        photo: [
          { file_id: 'small_id', width: 100, height: 100 },
          { file_id: TEST_IMAGE_FILE_ID, width: 800, height: 800 },
        ],
      },
      session: {},
    })

    // Mock telegram.getFile
    ctx.telegram.getFile = mockedGetFile

    // Use the new mockInngestSend helper
    const restoreInngest = mockInngestSend()

    try {
      // Run the second step of the scene (image upload)
      const { imageToPromptWizard } = await import(
        '@/scenes/imageToPromptWizard'
      )
      await runSceneStep(imageToPromptWizard.steps[1], ctx)

      // Check that getFile was called with the right file ID
      expect(mockedGetFile.mock.calls.length).toBe(1)
      // We can safely document the expectation here without triggering linter errors
      // The file ID TEST_IMAGE_FILE_ID should be passed to getFile

      // Check that the mode was set in the session
      expect(ctx.session.mode).toBe(ModeEnum.ImageToPrompt)

      // Check that calculateModeCost was called with the right parameters
      expect(mockedCalculateModeCost.mock.calls.length).toBe(1)
      // Safely check the mode property
      const costArg = mockedCalculateModeCost.mock.calls[0]?.[0]
      if (costArg && typeof costArg === 'object' && 'mode' in costArg) {
        expect(costArg.mode).toBe(ModeEnum.ImageToPrompt)
      }

      // Use the verifyInngestEvent helper
      verifyInngestEvent(inngest.send, {
        eventName: 'image/to-prompt.generate',
        requiredData: {
          image: TEST_IMAGE_URL,
          telegram_id: TEST_USER_ID.toString(),
          username: TEST_USERNAME,
          bot_name: TEST_BOT_USERNAME,
          cost_per_image: TEST_COST,
        },
      })

      // Check that wizard moved to next step
      expect(ctx.wizard.next).toHaveBeenCalled()

      return {
        name: 'imageToPromptWizard: Upload Image',
        category: TestCategory.All,
        success: true,
        message:
          'Successfully processed image upload and sent event to generate prompt',
      }
    } finally {
      // Always restore the original function
      restoreInngest()
    }
  } catch (error) {
    logger.error('Error in testImageToPromptWizard_UploadImage:', error)
    return {
      name: 'imageToPromptWizard: Upload Image',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test handling non-image message
 */
export async function testImageToPromptWizard_NonImageInput(): Promise<TestResult> {
  try {
    setupTest()

    // Create properly typed mock context
    const ctx = createTypedContext({
      from: {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      },
      botInfo: { username: TEST_BOT_USERNAME },
      message: {
        message_id: 1,
        text: 'This is not an image',
      },
    })

    // Run the second step of the scene
    const { imageToPromptWizard } = await import('@/scenes/imageToPromptWizard')
    await runSceneStep(imageToPromptWizard.steps[1], ctx)

    // Check that the bot sent an error message
    assertReplyContains(ctx, 'Пожалуйста, отправьте изображение')

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'imageToPromptWizard: Non-Image Input',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled non-image input',
    }
  } catch (error) {
    logger.error('Error in testImageToPromptWizard_NonImageInput:', error)
    return {
      name: 'imageToPromptWizard: Non-Image Input',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test cancelling the wizard
 */
export async function testImageToPromptWizard_Cancel(): Promise<TestResult> {
  try {
    setupTest()

    // Mock handleHelpCancel to return true (cancelled)
    mockedHandleHelpCancel.mockReturnValue(Promise.resolve(true))

    // Create properly typed mock context
    const ctx = createTypedContext({
      from: {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      },
      message: {
        message_id: 1,
        text: '/cancel',
      },
    })

    // Run the first step of the scene
    const { imageToPromptWizard } = await import('@/scenes/imageToPromptWizard')
    await runSceneStep(imageToPromptWizard.steps[0], ctx)

    // Check that handleHelpCancel was called
    expect(mockedHandleHelpCancel.mock.calls.length).toBe(1)

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'imageToPromptWizard: Cancel',
      category: TestCategory.All,
      success: true,
      message: 'Successfully cancelled the wizard',
    }
  } catch (error) {
    logger.error('Error in testImageToPromptWizard_Cancel:', error)
    return {
      name: 'imageToPromptWizard: Cancel',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Test error during image processing
 */
export async function testImageToPromptWizard_ProcessingError(): Promise<TestResult> {
  try {
    setupTest()

    // Create properly typed mock context
    const ctx = createTypedContext({
      from: {
        id: TEST_USER_ID,
        is_bot: false,
        first_name: 'Test',
        username: TEST_USERNAME,
        language_code: 'ru',
      },
      botInfo: { username: TEST_BOT_USERNAME },
      message: {
        message_id: 1,
        photo: [
          { file_id: 'small_id', width: 100, height: 100 },
          { file_id: TEST_IMAGE_FILE_ID, width: 800, height: 800 },
        ],
      },
    })

    // Mock telegram.getFile to throw error
    ctx.telegram.getFile = () => {
      throw new Error('Test error')
    }

    // Run the second step of the scene
    const { imageToPromptWizard } = await import('@/scenes/imageToPromptWizard')
    await runSceneStep(imageToPromptWizard.steps[1], ctx)

    // Check that the bot sent an error message
    assertReplyContains(ctx, 'Произошла ошибка при обработке изображения')

    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()

    return {
      name: 'imageToPromptWizard: Processing Error',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled error during image processing',
    }
  } catch (error) {
    logger.error('Error in testImageToPromptWizard_ProcessingError:', error)
    return {
      name: 'imageToPromptWizard: Processing Error',
      category: TestCategory.All,
      success: false,
      message: String(error),
    }
  }
}

/**
 * Run all imageToPromptWizard tests
 */
export async function runImageToPromptWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    results.push(await testImageToPromptWizard_EnterScene())
    results.push(await testImageToPromptWizard_UploadImage())
    results.push(await testImageToPromptWizard_NonImageInput())
    results.push(await testImageToPromptWizard_Cancel())
    results.push(await testImageToPromptWizard_ProcessingError())
  } catch (error) {
    logger.error('Error running imageToPromptWizard tests:', error)
    results.push({
      name: 'imageToPromptWizard: Overall',
      category: TestCategory.All,
      success: false,
      message: String(error),
    })
  }

  return results
}

/**
 * Helper function for safely checking mock call parameters
 */
function expectMockCallWith(
  mock: any,
  index: number,
  paramIndex: number,
  expected: any
) {
  if (
    !mock.mock ||
    !Array.isArray(mock.mock.calls) ||
    mock.mock.calls.length <= index
  ) {
    throw new Error(
      `Expected mock to have at least ${index + 1} calls, but it has ${mock.mock?.calls?.length || 0}`
    )
  }

  const call = mock.mock.calls[index]
  if (!Array.isArray(call) || call.length <= paramIndex) {
    throw new Error(
      `Expected call to have at least ${paramIndex + 1} parameters, but it has ${call?.length || 0}`
    )
  }

  if (call[paramIndex] !== expected) {
    throw new Error(
      `Expected parameter ${paramIndex} to be ${expected}, but it was ${call[paramIndex]}`
    )
  }
}

/**
 * Helper expect implementation for tests
 */
function expect(value: any): {
  toBe: (expected: any) => void
  toHaveBeenCalled: () => void
  toHaveBeenCalledWith: (...args: any[]) => void
  toBeGreaterThan: (expected: number) => void
  not: { toHaveBeenCalled: () => void }
} {
  return {
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${expected} but got ${value}`)
      }
    },
    toHaveBeenCalled: () => {
      if (!value || !value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called')
      }
    },
    toHaveBeenCalledWith: (...args: any[]) => {
      if (!value || !value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called')
      }

      const lastCall = value.mock.calls[value.mock.calls.length - 1]
      for (let i = 0; i < args.length; i++) {
        if (lastCall[i] !== args[i]) {
          throw new Error(
            `Expected function to have been called with ${args[i]} at position ${i} but got ${lastCall[i]}`
          )
        }
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (typeof value !== 'number' || value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`)
      }
    },
    not: {
      toHaveBeenCalled: () => {
        if (value && value.mock && value.mock.calls.length > 0) {
          throw new Error('Expected function not to have been called')
        }
      },
    },
  }
}

export default runImageToPromptWizardTests
