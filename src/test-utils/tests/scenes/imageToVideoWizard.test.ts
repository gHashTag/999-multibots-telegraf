import { MyContext } from '@/interfaces';
import {
  createMockUser,
  createTypedContext,
  createMockFunction,
  runSceneStep
} from '../../core/mockHelper';
import { TestResult } from '../../core/types';
import {
  assertReplyContains,
  assertReplyMarkupContains,
} from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu';
import { TestCategory } from '../../core/categories';
import { logger } from '@/utils/logger';
import { getUserBalance } from '@/core/supabase';
import { handleHelpCancel } from '@/handlers';
import { inngest } from '@/inngest-functions/clients';
import { ModeEnum } from '@/interfaces';
import { validateAndCalculateVideoModelPrice } from '@/price/helpers/validateAndCalculateVideoModelPrice';
import { 
  mockInngestSend, 
  verifyInngestEvent, 
  expect as testExpect,
  runTest 
} from '../../core/testHelpers';

// Mock necessary functions
const mockedGetUserBalance = createMockFunction<typeof getUserBalance>();
const mockedValidateAndCalculateVideoModelPrice = createMockFunction<typeof validateAndCalculateVideoModelPrice>();
const mockedInngestSend = createMockFunction<() => Promise<any>>();
const mockedHandleHelpCancel = createMockFunction<() => Promise<boolean>>();
const mockedGetFile = createMockFunction<() => Promise<{ file_path: string }>>();

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_VIDEO_MODEL = 'AnimateDiff';
const TEST_VIDEO_MODEL_ID = 'animate-diff';
const TEST_PROMPT = 'A beautiful sunset over mountains coming to life';
const TEST_AMOUNT = 10;
const TEST_BALANCE = 100;
const TEST_IMAGE_FILE_ID = 'test_image_file_id';
const TEST_IMAGE_URL = 'https://api.telegram.org/file/botXXXXXX/photos/test_image.jpg';

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getUserBalance
  mockedGetUserBalance.mockReturnValue(Promise.resolve(TEST_BALANCE));

  // Mock validateAndCalculateVideoModelPrice
  mockedValidateAndCalculateVideoModelPrice.mockReturnValue(
    Promise.resolve({
      amount: TEST_AMOUNT,
      modelId: TEST_VIDEO_MODEL_ID,
      success: true
    })
  );

  // Mock inngest.send
  mockedInngestSend.mockReturnValue(Promise.resolve({
    ids: ['test-id'],
    success: true
  }));

  // Mock handleHelpCancel
  mockedHandleHelpCancel.mockReturnValue(Promise.resolve(false));

  // Mock getFile
  mockedGetFile.mockReturnValue(Promise.resolve({
    file_path: 'photos/test_image.jpg'
  }));

  // Reset mocks between tests
  mockedGetUserBalance.mockClear();
  mockedValidateAndCalculateVideoModelPrice.mockClear();
  mockedInngestSend.mockClear();
  mockedHandleHelpCancel.mockClear();
  mockedGetFile.mockClear();
}

/**
 * Test entering the imageToVideoWizard scene
 */
export async function testImageToVideoWizard_EnterScene(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create properly typed mock context
    const ctx = createTypedContext({
      from: { 
        id: TEST_USER_ID, 
        is_bot: false, 
        first_name: 'Test', 
        username: TEST_USERNAME,
        language_code: 'ru' 
      },
      message: { text: '/image_to_video', message_id: 1 }
    });
    
    // Run the first step of the scene
    const { imageToVideoWizard } = await import('@/scenes/imageToVideoWizard');
    await runSceneStep(imageToVideoWizard.steps[0], ctx);
    
    // Check that the bot sent the right message with instructions
    assertReplyContains(ctx, 'Выберите модель для генерации видео');
    
    // Check that keyboard contains video model options
    assertReplyMarkupContains(ctx, 'AnimateDiff');
    
    return {
      name: 'imageToVideoWizard: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Successfully displayed video model selection instructions'
    };
  } catch (error) {
    logger.error('Error in testImageToVideoWizard_EnterScene:', error);
    return {
      name: 'imageToVideoWizard: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test selecting a video model
 */
export async function testImageToVideoWizard_SelectModel(): Promise<TestResult> {
  try {
    setupTest();
    
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
    });
    
    // Run the step for processing the model selection
    const { imageToVideoWizard } = await import('@/scenes/imageToVideoWizard');
    await runSceneStep(imageToVideoWizard.steps[1], ctx);
    
    // Check that getUserBalance was called with the correct user ID
    expect(mockedGetUserBalance.mock.calls.length).toBe(1);
    expect(mockedGetUserBalance.mock.calls[0][0]).toBe(TEST_USER_ID.toString());
    
    // Check that validateAndCalculateVideoModelPrice was called with the correct parameters
    expect(mockedValidateAndCalculateVideoModelPrice.mock.calls.length).toBe(1);
    expect(mockedValidateAndCalculateVideoModelPrice.mock.calls[0][0]).toBe(TEST_VIDEO_MODEL.toLowerCase());
    
    // Check that the model ID was saved in the session
    expect(ctx.session.videoModel).toBe(TEST_VIDEO_MODEL_ID);
    
    // Check that the amount was saved in the session
    expect(ctx.session.amount).toBe(TEST_AMOUNT);
    
    // Check that the bot sent a message asking for an image
    assertReplyContains(ctx, 'отправьте изображение для генерации видео');
    
    return {
      name: 'imageToVideoWizard: Select Model',
      category: TestCategory.All,
      success: true,
      message: 'Successfully selected video model and progressed to image upload step'
    };
  } catch (error) {
    logger.error('Error in testImageToVideoWizard_SelectModel:', error);
    return {
      name: 'imageToVideoWizard: Select Model',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test uploading an image
 */
export async function testImageToVideoWizard_UploadImage(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest();
      
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
          photo: [
            { file_id: 'small_file_id', file_unique_id: 'unique1', width: 100, height: 100 },
            { file_id: TEST_IMAGE_FILE_ID, file_unique_id: 'unique2', width: 800, height: 800 }
          ]
        },
        session: {
          videoModel: TEST_VIDEO_MODEL_ID,
          amount: TEST_AMOUNT
        },
        telegram: {
          getFile: mockedGetFile
        }
      });
      
      // Run the step for processing the image
      const { imageToVideoWizard } = await import('@/scenes/imageToVideoWizard');
      await runSceneStep(imageToVideoWizard.steps[2], ctx);
      
      // Check that getFile was called with the correct file ID (largest image)
      expect(mockedGetFile.mock.calls.length).toBe(1);
      expect(mockedGetFile.mock.calls[0][0]).toBe(TEST_IMAGE_FILE_ID);
      
      // Check that the image URL was saved in the session
      testExpect(ctx.session.imageUrl).toBeTruthy();
      
      // Check that the bot sent the message asking for text prompt
      assertReplyContains(ctx, 'отправьте текстовое описание для генерации видео');
      
      return {
        message: 'Successfully processed image upload and progressed to text prompt step'
      };
    },
    {
      name: 'imageToVideoWizard: Upload Image',
      category: TestCategory.All
    }
  );
}

/**
 * Test providing text prompt
 */
export async function testImageToVideoWizard_ProvidePrompt(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest();
      
      // Mock process.env.BOT_TOKEN
      process.env.BOT_TOKEN = 'test_token';
      
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
          videoModel: TEST_VIDEO_MODEL_ID,
          imageUrl: TEST_IMAGE_URL
        }
      });
      
      // Use the new mockInngestSend helper
      const restoreInngest = mockInngestSend();
      
      try {
        // Run the step for processing the text prompt
        const { imageToVideoWizard } = await import('@/scenes/imageToVideoWizard');
        await runSceneStep(imageToVideoWizard.steps[3], ctx);
        
        // Use the new verifyInngestEvent helper
        verifyInngestEvent(inngest.send, {
          eventName: 'text-to-video.requested',
          requiredData: {
            prompt: TEST_PROMPT,
            telegram_id: TEST_USER_ID.toString(),
            model_id: TEST_VIDEO_MODEL_ID,
            username: TEST_USERNAME,
            image: TEST_IMAGE_URL
          }
        });
        
        // Check that the prompt was saved in the session
        testExpect(ctx.session.prompt).toBe(TEST_PROMPT);
        
        // Check that the bot sent the confirmation message
        assertReplyContains(ctx, 'Запрос на генерацию видео отправлен');
        
        return {
          message: 'Successfully processed text prompt and sent generation request'
        };
      } finally {
        // Always restore the original function, even if test fails
        restoreInngest();
        delete process.env.BOT_TOKEN;
      }
    },
    {
      name: 'imageToVideoWizard: Provide Prompt',
      category: TestCategory.All
    }
  );
}

/**
 * Test insufficient balance handling
 */
export async function testImageToVideoWizard_InsufficientBalance(): Promise<TestResult> {
  try {
    setupTest();
    
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
    });
    
    // Mock user balance to be low
    mockedGetUserBalance.mockReturnValue(Promise.resolve(5));
    
    // Mock validation to return null (indicating insufficient balance)
    mockedValidateAndCalculateVideoModelPrice.mockReturnValue(
      Promise.resolve(null)
    );
    
    // Run the step for processing the model selection
    const { imageToVideoWizard } = await import('@/scenes/imageToVideoWizard');
    await runSceneStep(imageToVideoWizard.steps[1], ctx);
    
    // Check that validateAndCalculateVideoModelPrice was called
    expect(mockedValidateAndCalculateVideoModelPrice.mock.calls.length).toBe(1);
    
    // Check that the scene was exited due to insufficient balance
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'imageToVideoWizard: Insufficient Balance',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled insufficient balance scenario'
    };
  } catch (error) {
    logger.error('Error in testImageToVideoWizard_InsufficientBalance:', error);
    return {
      name: 'imageToVideoWizard: Insufficient Balance',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test canceling the wizard
 */
export async function testImageToVideoWizard_Cancel(): Promise<TestResult> {
  try {
    setupTest();
    
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
    });
    
    // Mock handleHelpCancel to return true (indicating successful cancellation)
    const handleHelpCancelMock = createMockFunction<() => Promise<boolean>>();
    handleHelpCancelMock.mockReturnValue(Promise.resolve(true));
    
    // Create a custom import to inject the mock
    jest.mock('@/handlers', () => ({
      handleHelpCancel: handleHelpCancelMock
    }));
    
    // Run the step with our mocked dependencies
    const { imageToVideoWizard } = await import('@/scenes/imageToVideoWizard');
    await runSceneStep(imageToVideoWizard.steps[1], ctx);
    
    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    // Restore the original module
    jest.unmock('@/handlers');
    
    return {
      name: 'imageToVideoWizard: Cancel',
      category: TestCategory.All,
      success: true,
      message: 'Successfully canceled the wizard'
    };
  } catch (error) {
    logger.error('Error in testImageToVideoWizard_Cancel:', error);
    return {
      name: 'imageToVideoWizard: Cancel',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling invalid message (not an image)
 */
export async function testImageToVideoWizard_InvalidImageInput(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest();
      
      // Create properly typed mock context with text message instead of photo
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
          text: 'This is not an image'
        },
        session: {
          videoModel: TEST_VIDEO_MODEL_ID,
          amount: TEST_AMOUNT
        }
      });
      
      // Run the step for processing the image
      const { imageToVideoWizard } = await import('@/scenes/imageToVideoWizard');
      await runSceneStep(imageToVideoWizard.steps[2], ctx);
      
      // Verify the error message was sent
      assertReplyContains(ctx, 'Пожалуйста, отправьте изображение для генерации видео');
      
      // Check that the wizard did not advance to the next step
      testExpect(ctx.wizard.next).not.toHaveBeenCalled();
      
      return {
        message: 'Successfully handled invalid image input'
      };
    },
    {
      name: 'imageToVideoWizard: Invalid Image Input',
      category: TestCategory.All
    }
  );
}

/**
 * Run all imageToVideoWizard tests
 */
export async function runImageToVideoWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  // Run all test functions and collect results
  try {
    results.push(await testImageToVideoWizard_EnterScene());
    results.push(await testImageToVideoWizard_SelectModel());
    results.push(await testImageToVideoWizard_UploadImage());
    results.push(await testImageToVideoWizard_ProvidePrompt());
    results.push(await testImageToVideoWizard_InsufficientBalance());
    results.push(await testImageToVideoWizard_Cancel());
    results.push(await testImageToVideoWizard_InvalidImageInput());
  } catch (error) {
    logger.error('Error running imageToVideoWizard tests:', error);
    results.push({
      name: 'imageToVideoWizard tests',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
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

export default runImageToVideoWizardTests; 