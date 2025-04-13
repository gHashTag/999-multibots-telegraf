import { MyContext } from '@/interfaces'
import {
  createMockUser,
  createTypedContext,
  createMockFunction,
  runSceneStep
} from '../../core/mockHelper'
import { TestResult } from '../../core/types'
import {
  assertReplyContains,
  assertReplyMarkupContains,
} from '../../core/assertions'
import { create as mockFunction } from '../../core/mock'
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'
import { TestCategory } from '../../core/categories'
import { logger } from '@/utils/logger'
import { getUserBalance } from '@/core/supabase'
import { handleHelpCancel } from '@/handlers'
import { inngest } from '@/inngest-functions/clients'
import { ModeEnum } from '@/interfaces'
import { validateAndCalculateVideoModelPrice } from '@/price/helpers/validateAndCalculateVideoModelPrice'
import { 
  mockInngestSend, 
  verifyInngestEvent, 
  expect as testExpect,
  runTest 
} from '../../core/testHelpers'

// Mock necessary functions
const mockedGetUserBalance = createMockFunction<typeof getUserBalance>()
const mockedValidateAndCalculateVideoModelPrice = createMockFunction<typeof validateAndCalculateVideoModelPrice>()
const mockedInngestSend = createMockFunction<() => Promise<any>>()
const mockedHandleHelpCancel = createMockFunction<() => Promise<boolean>>()

// Constants for testing
const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_VIDEO_MODEL = 'AnimateDiff'
const TEST_VIDEO_MODEL_ID = 'animate-diff'
const TEST_PROMPT = 'A beautiful sunset over mountains coming to life'
const TEST_AMOUNT = 10
const TEST_VIDEO_MODEL_NAME = 'AnimateDiff'
const TEST_TEXT_PROMPT = 'A beautiful sunset with ocean waves crashing on the shore'
const TEST_BALANCE = 100
const TEST_IMAGE_FILE_ID = 'test_image_file_id'
const TEST_IMAGE_URL = 'https://api.telegram.org/file/botXXXXXX/photos/test_image.jpg'

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getUserBalance
  mockedGetUserBalance.mockReturnValue(Promise.resolve(TEST_BALANCE))

  // Mock validateAndCalculateVideoModelPrice
  mockedValidateAndCalculateVideoModelPrice.mockReturnValue(
    Promise.resolve({
      amount: TEST_AMOUNT,
      modelId: TEST_VIDEO_MODEL_ID,
      success: true
    })
  )

  // Mock inngest.send
  mockedInngestSend.mockReturnValue(Promise.resolve({
    ids: ['test-id'],
    success: true
  }))

  // Mock handleHelpCancel
  mockedHandleHelpCancel.mockReturnValue(Promise.resolve(false))

  // Reset mocks between tests
  mockedGetUserBalance.mockClear()
  mockedValidateAndCalculateVideoModelPrice.mockClear()
  mockedInngestSend.mockClear()
  mockedHandleHelpCancel.mockClear()
}

/**
 * Test entering the textToVideoWizard scene
 */
export async function testTextToVideoWizard_EnterScene(): Promise<TestResult> {
  try {
    setupTest()
    
    // Create properly typed mock context
    const ctx = createTypedContext({
      from: { 
        id: TEST_USER_ID, 
        is_bot: false, 
        first_name: 'Test', 
        username: TEST_USERNAME,
        language_code: 'ru' 
      },
      message: { text: '/text_to_video', message_id: 1 }
    })
    
    // Run the first step of the scene
    const { textToVideoWizard } = await import('@/scenes/textToVideoWizard')
    await runSceneStep(textToVideoWizard.steps[0], ctx)
    
    // Check that the bot sent the right message with instructions
    assertReplyContains(ctx, 'Выберите модель для генерации видео')
    
    // Check that keyboard contains video model options
    assertReplyMarkupContains(ctx, 'AnimateDiff')
    
    return {
      name: 'textToVideoWizard: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Successfully displayed video model selection instructions'
    }
  } catch (error) {
    logger.error('Error in testTextToVideoWizard_EnterScene:', error)
    return {
      name: 'textToVideoWizard: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error)
    }
  }
}

/**
 * Test selecting a video model
 */
export async function testTextToVideoWizard_SelectModel(): Promise<TestResult> {
  try {
    setupTest()
    
    // Create properly typed mock context
    const ctx = createTypedContext({
      from: { 
        id: TEST_USER_ID, 
        is_bot: false, 
        first_name: 'Test', 
        username: TEST_USERNAME,
        language_code: 'ru' 
      },
      botInfo: { username: 'test_bot' },
      message: {
        message_id: 1,
        text: TEST_VIDEO_MODEL
      },
      session: {}
    })
    
    // Run the step for processing the model selection
    const { textToVideoWizard } = await import('@/scenes/textToVideoWizard')
    await runSceneStep(textToVideoWizard.steps[1], ctx)
    
    // Check that getUserBalance was called with the correct user ID
    expect(mockedGetUserBalance.mock.calls.length).toBe(1)
    expect(mockedGetUserBalance.mock.calls[0][0]).toBe(TEST_USER_ID.toString())
    
    // Check that validateAndCalculateVideoModelPrice was called with the correct parameters
    expect(mockedValidateAndCalculateVideoModelPrice.mock.calls.length).toBe(1)
    expect(mockedValidateAndCalculateVideoModelPrice.mock.calls[0][0]).toBe(TEST_VIDEO_MODEL.toLowerCase())
    
    // Check that the model ID was saved in the session
    expect(ctx.session.videoModel).toBe(TEST_VIDEO_MODEL_ID)
    
    // Check that the amount was saved in the session
    expect(ctx.session.amount).toBe(TEST_AMOUNT)
    
    // Check that the bot sent a message asking for a text description
    assertReplyContains(ctx, 'отправьте текстовое описание для генерации видео')
    
    return {
      name: 'textToVideoWizard: Select Model',
      category: TestCategory.All,
      success: true,
      message: 'Successfully selected video model and progressed to next step'
    }
  } catch (error) {
    logger.error('Error in testTextToVideoWizard_SelectModel:', error)
    return {
      name: 'textToVideoWizard: Select Model',
      category: TestCategory.All,
      success: false,
      message: String(error)
    }
  }
}

/**
 * Test providing text prompt
 */
export async function testTextToVideoWizard_ProvidePrompt(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()
      
      // Create properly typed mock context
      const ctx = createTypedContext({
        from: { 
          id: TEST_USER_ID, 
          is_bot: false, 
          first_name: 'Test', 
          username: TEST_USERNAME, 
          language_code: 'ru' 
        },
        botInfo: { username: 'test_bot' },
        message: {
          message_id: 1,
          text: TEST_PROMPT
        },
        session: {
          videoModel: TEST_VIDEO_MODEL_ID
        }
      })
      
      // Use the new mockInngestSend helper
      const restoreInngest = mockInngestSend()
      
      try {
        // Run the step for processing the text prompt
        const { textToVideoWizard } = await import('@/scenes/textToVideoWizard')
        await runSceneStep(textToVideoWizard.steps[2], ctx)
        
        // Use the new verifyInngestEvent helper
        verifyInngestEvent(inngest.send, {
          eventName: 'text-to-video.requested',
          requiredData: {
            prompt: TEST_PROMPT,
            telegram_id: TEST_USER_ID.toString(),
            model_id: TEST_VIDEO_MODEL_ID,
            username: TEST_USERNAME
          }
        })
        
        // Check that the prompt was saved in the session
        testExpect(ctx.session.prompt).toBe(TEST_PROMPT)
        
        // Check that the bot sent the confirmation message
        assertReplyContains(ctx, 'Запрос на генерацию видео отправлен')
        
        return {
          message: 'Successfully processed text prompt and sent generation request'
        }
      } finally {
        // Always restore the original function, even if test fails
        restoreInngest()
      }
    },
    {
      name: 'textToVideoWizard: Provide Prompt',
      category: TestCategory.All
    }
  )
}

/**
 * Test image input handling for models that require images
 */
export async function testTextToVideoWizard_ProvideImageForImageModel(): Promise<TestResult> {
  try {
    setupTest()
    
    // Create properly typed mock context
    const ctx = createTypedContext({
      from: { 
        id: TEST_USER_ID, 
        is_bot: false, 
        first_name: 'Test', 
        username: TEST_USERNAME,
        language_code: 'ru' 
      },
      botInfo: { username: 'test_bot' },
      message: {
        message_id: 1,
        text: 'ImageModel'
      },
      session: {}
    })
    
    // Mock the VIDEO_MODELS_CONFIG to simulate a model that requires image input
    const mockVideoModelsConfig = {
      'image-model': {
        inputType: ['image'],
        imageKey: 'image'
      }
    }
    
    // Create a mock for validateAndCalculateVideoModelPrice that returns an image model
    mockedValidateAndCalculateVideoModelPrice.mockReturnValue(
      Promise.resolve({
        amount: TEST_AMOUNT,
        modelId: 'image-model',
        success: true
      })
    )
    
    // Mock the import to include our mock video models config
    jest.mock('@/menu/videoModelMenu', () => ({
      VIDEO_MODELS_CONFIG: mockVideoModelsConfig
    }))
    
    // Run the step for processing the model selection
    const { textToVideoWizard } = await import('@/scenes/textToVideoWizard')
    await runSceneStep(textToVideoWizard.steps[1], ctx)
    
    // Check that the bot sent a message asking for an image
    assertReplyContains(ctx, 'Эта модель требует изображение для генерации видео')
    
    // Restore the original module
    jest.unmock('@/menu/videoModelMenu')
    
    return {
      name: 'textToVideoWizard: Provide Image For Image Model',
      category: TestCategory.All,
      success: true,
      message: 'Successfully recognized image model and requested image upload'
    }
  } catch (error) {
    logger.error('Error in testTextToVideoWizard_ProvideImageForImageModel:', error)
    return {
      name: 'textToVideoWizard: Provide Image For Image Model',
      category: TestCategory.All,
      success: false,
      message: String(error)
    }
  }
}

/**
 * Test insufficient balance handling
 */
export async function testTextToVideoWizard_InsufficientBalance(): Promise<TestResult> {
  try {
    setupTest()
    
    // Create properly typed mock context
    const ctx = createTypedContext({
      from: { 
        id: TEST_USER_ID, 
        is_bot: false, 
        first_name: 'Test', 
        username: TEST_USERNAME,
        language_code: 'ru' 
      },
      botInfo: { username: 'test_bot' },
      message: {
        message_id: 1,
        text: TEST_VIDEO_MODEL
      },
      session: {}
    })
    
    // Mock user balance to be low
    mockedGetUserBalance.mockReturnValue(Promise.resolve(5))
    
    // Mock validation to return null (indicating insufficient balance)
    mockedValidateAndCalculateVideoModelPrice.mockReturnValue(
      Promise.resolve(null)
    )
    
    // Run the step for processing the model selection
    const { textToVideoWizard } = await import('@/scenes/textToVideoWizard')
    await runSceneStep(textToVideoWizard.steps[1], ctx)
    
    // Check that validateAndCalculateVideoModelPrice was called
    expect(mockedValidateAndCalculateVideoModelPrice.mock.calls.length).toBe(1)
    
    // Check that the scene was exited due to insufficient balance
    expect(ctx.scene.leave).toHaveBeenCalled()
    
    return {
      name: 'textToVideoWizard: Insufficient Balance',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled insufficient balance scenario'
    }
  } catch (error) {
    logger.error('Error in testTextToVideoWizard_InsufficientBalance:', error)
    return {
      name: 'textToVideoWizard: Insufficient Balance',
      category: TestCategory.All,
      success: false,
      message: String(error)
    }
  }
}

/**
 * Test canceling the wizard
 */
export async function testTextToVideoWizard_Cancel(): Promise<TestResult> {
  try {
    setupTest()
    
    // Create properly typed mock context
    const ctx = createTypedContext({
      from: { 
        id: TEST_USER_ID, 
        is_bot: false, 
        first_name: 'Test', 
        username: TEST_USERNAME,
        language_code: 'ru' 
      },
      botInfo: { username: 'test_bot' },
      message: {
        message_id: 1,
        text: '/cancel'
      },
      session: {}
    })
    
    // Mock handleHelpCancel to return true (indicating successful cancellation)
    const handleHelpCancelMock = createMockFunction<() => Promise<boolean>>()
    handleHelpCancelMock.mockReturnValue(Promise.resolve(true))
    
    // Create a custom import to inject the mock
    jest.mock('@/handlers', () => ({
      handleHelpCancel: handleHelpCancelMock
    }))
    
    // Run the step with our mocked dependencies
    const { textToVideoWizard } = await import('@/scenes/textToVideoWizard')
    await runSceneStep(textToVideoWizard.steps[1], ctx)
    
    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled()
    
    // Restore the original module
    jest.unmock('@/handlers')
    
    return {
      name: 'textToVideoWizard: Cancel',
      category: TestCategory.All,
      success: true,
      message: 'Successfully canceled the wizard'
    }
  } catch (error) {
    logger.error('Error in testTextToVideoWizard_Cancel:', error)
    return {
      name: 'textToVideoWizard: Cancel',
      category: TestCategory.All,
      success: false,
      message: String(error)
    }
  }
}

/**
 * Run all textToVideoWizard tests
 */
export async function runTextToVideoWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = []
  
  // Run all test functions and collect results
  try {
    results.push(await testTextToVideoWizard_EnterScene())
    results.push(await testTextToVideoWizard_SelectModel())
    results.push(await testTextToVideoWizard_ProvidePrompt())
    results.push(await testTextToVideoWizard_ProvideImageForImageModel())
    results.push(await testTextToVideoWizard_InsufficientBalance())
    results.push(await testTextToVideoWizard_Cancel())
  } catch (error) {
    logger.error('Error running textToVideoWizard tests:', error)
    results.push({
      name: 'textToVideoWizard tests',
      category: TestCategory.All,
      success: false,
      message: String(error)
    })
  }
  
  return results
}

/**
 * Helper expect implementation for tests
 */
function expect(value: any): { 
  toBe: (expected: any) => void;
  toHaveBeenCalled: () => void;
  toHaveBeenCalledWith: (...args: any[]) => void;
  toBeGreaterThan: (expected: number) => void;
  not: { toHaveBeenCalled: () => void }
} {
  return {
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${expected} but got ${value}`);
      }
    },
    toHaveBeenCalled: () => {
      if (!value || !value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
    },
    toHaveBeenCalledWith: (...args: any[]) => {
      if (!value || !value.mock || value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
      
      const lastCall = value.mock.calls[value.mock.calls.length - 1];
      for (let i = 0; i < args.length; i++) {
        if (lastCall[i] !== args[i]) {
          throw new Error(`Expected function to have been called with ${JSON.stringify(args)} but was called with ${JSON.stringify(lastCall)}`);
        }
      }
    },
    toBeGreaterThan: (expected: number) => {
      if (typeof value !== 'number' || value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    },
    not: {
      toHaveBeenCalled: () => {
        if (value && value.mock && value.mock.calls.length > 0) {
          throw new Error('Expected function not to have been called');
        }
      }
    }
  };
}

export default runTextToVideoWizardTests
