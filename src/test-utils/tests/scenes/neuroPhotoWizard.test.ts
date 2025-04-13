import { MyContext } from '@/interfaces';
import { createMockContext, createMockWizardContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertScene } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { logger } from '@/utils/logger';
import { TestCategory } from '../../core/categories';

// Mocked functions
const mockedGetUserInfo = mockFunction<typeof import('@/handlers/getUserInfo').getUserInfo>();
const mockedGetLatestUserModel = mockFunction<typeof import('@/core/supabase').getLatestUserModel>();
const mockedGetReferalsCountAndUserData = mockFunction<typeof import('@/core/supabase').getReferalsCountAndUserData>();
const mockedSendPhotoDescriptionRequest = mockFunction<typeof import('@/menu').sendPhotoDescriptionRequest>();
const mockedGenerateNeuroImage = mockFunction<typeof import('@/services/generateNeuroImage').generateNeuroImage>();
const mockedHandleHelpCancel = mockFunction<typeof import('@/handlers/handleHelpCancel').handleHelpCancel>();
const mockedMainMenu = mockFunction<typeof import('@/menu').mainMenu>();
const mockedHandleMenu = mockFunction<typeof import('@/handlers').handleMenu>();

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_MODEL_URL = 'owner/flux-model:12345';
const TEST_TRIGGER_WORD = 'tfg777, photo of';
const TEST_PROMPT = 'A beautiful sunset beach portrait';

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getUserInfo
  mockedGetUserInfo.mockReturnValue({
    telegramId: TEST_USER_ID.toString(),
    username: TEST_USERNAME,
    isRu: true
  });

  // Mock getLatestUserModel
  mockedGetLatestUserModel.mockReturnValue(Promise.resolve({
    model_url: TEST_MODEL_URL,
    trigger_word: TEST_TRIGGER_WORD,
    id: 'model-123',
    user_id: 'user-123',
    created_at: new Date().toISOString()
  }));

  // Mock getReferalsCountAndUserData
  mockedGetReferalsCountAndUserData.mockReturnValue(Promise.resolve({
    count: 5,
    subscription: 'stars',
    level: 1
  }));

  // Mock sendPhotoDescriptionRequest
  mockedSendPhotoDescriptionRequest.mockReturnValue(Promise.resolve());

  // Mock generateNeuroImage
  mockedGenerateNeuroImage.mockReturnValue(Promise.resolve());

  // Mock handleHelpCancel
  mockedHandleHelpCancel.mockReturnValue(Promise.resolve(false));

  // Mock mainMenu
  mockedMainMenu.mockReturnValue(Promise.resolve({
    reply_markup: {
      keyboard: [['Button 1', 'Button 2']]
    }
  }));

  // Mock handleMenu
  mockedHandleMenu.mockReturnValue(Promise.resolve());

  // Reset mocks between tests
  mockedGetUserInfo.mockClear();
  mockedGetLatestUserModel.mockClear();
  mockedGetReferalsCountAndUserData.mockClear();
  mockedSendPhotoDescriptionRequest.mockClear();
  mockedGenerateNeuroImage.mockClear();
  mockedHandleHelpCancel.mockClear();
  mockedMainMenu.mockClear();
  mockedHandleMenu.mockClear();
}

/**
 * Test entering the neuroPhotoWizard scene
 */
export async function testNeuroPhotoWizard_EnterScene(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context for the first step
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = { ...ctx.session, mode: 'neuroPhoto' };
    
    // Run the first step of the scene
    const neuroPhotoWizard = (await import('@/scenes/neuroPhotoWizard')).neuroPhotoWizard;
    await neuroPhotoWizard.steps[0](ctx as unknown as MyContext);
    
    // Check that getUserInfo was called
    if (mockedGetUserInfo.mock.calls.length === 0) {
      throw new Error('getUserInfo should have been called');
    }
    
    // Check that getLatestUserModel was called with correct args
    if (mockedGetLatestUserModel.mock.calls.length === 0) {
      throw new Error('getLatestUserModel should have been called');
    }
    expect(mockedGetLatestUserModel.mock.calls[0][0]).toBe(TEST_USER_ID.toString());
    expect(mockedGetLatestUserModel.mock.calls[0][1]).toBe('replicate');
    
    // Check that the user model was saved in the session
    if (!ctx.session.userModel) {
      throw new Error('User model should have been saved in session');
    }
    expect(ctx.session.userModel.model_url).toBe(TEST_MODEL_URL);
    
    // Check that sendPhotoDescriptionRequest was called
    if (mockedSendPhotoDescriptionRequest.mock.calls.length === 0) {
      throw new Error('sendPhotoDescriptionRequest should have been called');
    }
    
    // Check that the wizard moved to the next step
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizard: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Successfully entered neuroPhotoWizard and displayed prompt instructions'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizard_EnterScene:', error);
    return {
      name: 'neuroPhotoWizard: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling the case when user doesn't have any trained models
 */
export async function testNeuroPhotoWizard_NoTrainedModels(): Promise<TestResult> {
  try {
    setupTest();
    
    // Change the mock to return null (no models)
    mockedGetLatestUserModel.mockReturnValue(Promise.resolve(null));
    
    // Create mock context for the first step
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    
    // Run the first step of the scene
    const neuroPhotoWizard = (await import('@/scenes/neuroPhotoWizard')).neuroPhotoWizard;
    await neuroPhotoWizard.steps[0](ctx as unknown as MyContext);
    
    // Check that the correct error message was sent
    assertReplyContains(ctx, 'У вас нет обученных моделей');
    
    // Check that scene.leave was called
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizard: No Trained Models',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled case when user has no trained models'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizard_NoTrainedModels:', error);
    return {
      name: 'neuroPhotoWizard: No Trained Models',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test providing a text prompt
 */
export async function testNeuroPhotoWizard_ProvidePrompt(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 1 (prompt input)
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session = {
      ...ctx.session,
      userModel: {
        model_url: TEST_MODEL_URL,
        trigger_word: TEST_TRIGGER_WORD
      }
    };
    
    // Simulate message with text prompt
    ctx.message = {
      message_id: 1,
      text: TEST_PROMPT
    } as any;
    
    // Run the prompt step
    const neuroPhotoWizard = (await import('@/scenes/neuroPhotoWizard')).neuroPhotoWizard;
    await neuroPhotoWizard.steps[1](ctx as unknown as MyContext);
    
    // Check that prompt was saved in session
    expect(ctx.session.prompt).toBe(TEST_PROMPT);
    
    // Check that generateNeuroImage was called with correct args
    if (mockedGenerateNeuroImage.mock.calls.length === 0) {
      throw new Error('generateNeuroImage should have been called');
    }
    const expectedFullPrompt = `${TEST_TRIGGER_WORD}, ${TEST_PROMPT}`;
    expect(mockedGenerateNeuroImage.mock.calls[0][0]).toBe(expectedFullPrompt);
    expect(mockedGenerateNeuroImage.mock.calls[0][1]).toBe(TEST_MODEL_URL);
    expect(mockedGenerateNeuroImage.mock.calls[0][2]).toBe(1); // Number of images
    
    // Check that the wizard moved to the next step
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizard: Provide Prompt',
      category: TestCategory.All,
      success: true,
      message: 'Successfully processed prompt and generated image'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizard_ProvidePrompt:', error);
    return {
      name: 'neuroPhotoWizard: Provide Prompt',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test regenerating with different number of images
 */
export async function testNeuroPhotoWizard_GenerateMultipleImages(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 2 (button step)
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session = {
      ...ctx.session,
      prompt: TEST_PROMPT,
      userModel: {
        model_url: TEST_MODEL_URL,
        trigger_word: TEST_TRIGGER_WORD
      }
    };
    
    // Simulate message with text for 2 images
    ctx.message = {
      message_id: 1,
      text: '2️⃣ Two images'
    } as any;
    
    // Run the button step
    const neuroPhotoWizard = (await import('@/scenes/neuroPhotoWizard')).neuroPhotoWizard;
    await neuroPhotoWizard.steps[2](ctx as unknown as MyContext);
    
    // Check that generateNeuroImage was called with correct args
    if (mockedGenerateNeuroImage.mock.calls.length === 0) {
      throw new Error('generateNeuroImage should have been called');
    }
    expect(mockedGenerateNeuroImage.mock.calls[0][2]).toBe(2); // Number of images
    
    return {
      name: 'neuroPhotoWizard: Generate Multiple Images',
      category: TestCategory.All,
      success: true,
      message: 'Successfully generated multiple images'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizard_GenerateMultipleImages:', error);
    return {
      name: 'neuroPhotoWizard: Generate Multiple Images',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test clicking "Improve prompt" button
 */
export async function testNeuroPhotoWizard_ImprovePrompt(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 2 (button step)
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = { ...ctx.session, prompt: TEST_PROMPT };
    
    // Simulate message with improve prompt request
    ctx.message = {
      message_id: 1,
      text: '⬆️ Улучшить промпт'
    } as any;
    
    // Run the button step
    const neuroPhotoWizard = (await import('@/scenes/neuroPhotoWizard')).neuroPhotoWizard;
    await neuroPhotoWizard.steps[2](ctx as unknown as MyContext);
    
    // Check that scene.enter was called with improvePromptWizard
    expect(ctx.scene.enter).toHaveBeenCalledWith('improvePromptWizard');
    
    return {
      name: 'neuroPhotoWizard: Improve Prompt',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled improve prompt button'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizard_ImprovePrompt:', error);
    return {
      name: 'neuroPhotoWizard: Improve Prompt',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test clicking "Change size" button
 */
export async function testNeuroPhotoWizard_ChangeSize(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 2 (button step)
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = { ...ctx.session, prompt: TEST_PROMPT };
    
    // Simulate message with change size request
    ctx.message = {
      message_id: 1,
      text: '📐 Изменить размер'
    } as any;
    
    // Run the button step
    const neuroPhotoWizard = (await import('@/scenes/neuroPhotoWizard')).neuroPhotoWizard;
    await neuroPhotoWizard.steps[2](ctx as unknown as MyContext);
    
    // Check that scene.enter was called with sizeWizard
    expect(ctx.scene.enter).toHaveBeenCalledWith('sizeWizard');
    
    return {
      name: 'neuroPhotoWizard: Change Size',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled change size button'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizard_ChangeSize:', error);
    return {
      name: 'neuroPhotoWizard: Change Size',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test returning to main menu
 */
export async function testNeuroPhotoWizard_ReturnToMainMenu(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 2 (button step)
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    
    // Simulate message with main menu request
    ctx.message = {
      message_id: 1,
      text: '🏠 Главное меню'
    } as any;
    
    // Run the button step
    const neuroPhotoWizard = (await import('@/scenes/neuroPhotoWizard')).neuroPhotoWizard;
    await neuroPhotoWizard.steps[2](ctx as unknown as MyContext);
    
    // Check that handleMenu was called
    expect(mockedHandleMenu.mock.calls.length).toBeGreaterThan(0);
    
    return {
      name: 'neuroPhotoWizard: Return To Main Menu',
      category: TestCategory.All,
      success: true,
      message: 'Successfully returned to main menu'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizard_ReturnToMainMenu:', error);
    return {
      name: 'neuroPhotoWizard: Return To Main Menu',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling cancel/help commands
 */
export async function testNeuroPhotoWizard_HandleCancelHelp(): Promise<TestResult> {
  try {
    setupTest();
    
    // Change handleHelpCancel to return true (cancel)
    mockedHandleHelpCancel.mockReturnValue(Promise.resolve(true));
    
    // Create mock context
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = { ...ctx.session, userModel: { model_url: TEST_MODEL_URL } };
    
    // Simulate message with /cancel
    ctx.message = {
      message_id: 1,
      text: '/cancel'
    } as any;
    
    // Run the prompt step
    const neuroPhotoWizard = (await import('@/scenes/neuroPhotoWizard')).neuroPhotoWizard;
    await neuroPhotoWizard.steps[1](ctx as unknown as MyContext);
    
    // Check that scene.leave was called
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizard: Handle Cancel/Help',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled cancel/help commands'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizard_HandleCancelHelp:', error);
    return {
      name: 'neuroPhotoWizard: Handle Cancel/Help',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Run all tests for the neuroPhotoWizard scene
 */
export async function runNeuroPhotoWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    results.push(await testNeuroPhotoWizard_EnterScene());
    results.push(await testNeuroPhotoWizard_NoTrainedModels());
    results.push(await testNeuroPhotoWizard_ProvidePrompt());
    results.push(await testNeuroPhotoWizard_GenerateMultipleImages());
    results.push(await testNeuroPhotoWizard_ImprovePrompt());
    results.push(await testNeuroPhotoWizard_ChangeSize());
    results.push(await testNeuroPhotoWizard_ReturnToMainMenu());
    results.push(await testNeuroPhotoWizard_HandleCancelHelp());
  } catch (error) {
    results.push({
      name: 'neuroPhotoWizard: Overall',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

// Helper functions for assertions
function expect(value: any): { toBe: (expected: any) => void; toHaveBeenCalled: () => void; toHaveBeenCalledWith: (...args: any[]) => void } {
  return {
    toBe: (expected: any) => {
      if (value !== expected) {
        throw new Error(`Expected ${value} to be ${expected}`);
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
      
      const call = value.mock.calls[0];
      let match = true;
      
      for (let i = 0; i < args.length; i++) {
        if (call[i] !== args[i]) {
          match = false;
          break;
        }
      }
      
      if (!match) {
        throw new Error(`Expected function to have been called with ${JSON.stringify(args)} but was called with ${JSON.stringify(call)}`);
      }
    }
  };
} 