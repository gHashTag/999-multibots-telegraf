import { MyContext } from '@/interfaces';
import { createMockContext, createMockWizardContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertScene } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { logger } from '@/utils/logger';
import { TestCategory } from '../../core/categories';
import { ModeEnum } from '@/price/helpers/modelsCost';

// Mocked functions
const mockedGetUserInfo = mockFunction<typeof import('@/handlers/getUserInfo').getUserInfo>();
const mockedGetLatestUserModel = mockFunction<typeof import('@/core/supabase').getLatestUserModel>();
const mockedGetReferalsCountAndUserData = mockFunction<typeof import('@/core/supabase').getReferalsCountAndUserData>();
const mockedSendPhotoDescriptionRequest = mockFunction<typeof import('@/menu').sendPhotoDescriptionRequest>();
const mockedGenerateNeuroImageV2 = mockFunction<typeof import('@/services/generateNeuroImageV2').generateNeuroImageV2>();
const mockedHandleHelpCancel = mockFunction<typeof import('@/handlers/handleHelpCancel').handleHelpCancel>();
const mockedMainMenu = mockFunction<typeof import('@/menu').mainMenu>();
const mockedHandleMenu = mockFunction<typeof import('@/handlers').handleMenu>();

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_FINETUNE_ID = 'finetune-12345';
const TEST_TRIGGER_WORD = 'artfxdr, photo of';
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

  // Mock getLatestUserModel - Note we use 'bfl' provider for V2
  mockedGetLatestUserModel.mockReturnValue(Promise.resolve({
    finetune_id: TEST_FINETUNE_ID,
    trigger_word: TEST_TRIGGER_WORD,
    id: 'model-123',
    user_id: 'user-123',
    created_at: new Date().toISOString()
  }));

  // Mock getReferalsCountAndUserData - Include subscription
  mockedGetReferalsCountAndUserData.mockReturnValue(Promise.resolve({
    count: 5,
    subscription: 'premium',
    level: 1
  }));

  // Mock sendPhotoDescriptionRequest
  mockedSendPhotoDescriptionRequest.mockReturnValue(Promise.resolve());

  // Mock generateNeuroImageV2 
  mockedGenerateNeuroImageV2.mockReturnValue(Promise.resolve(true));

  // Mock handleHelpCancel
  mockedHandleHelpCancel.mockReturnValue(Promise.resolve(false));

  // Mock mainMenu
  mockedMainMenu.mockReturnValue({
    reply_markup: {
      keyboard: [['Button 1', 'Button 2']]
    }
  });

  // Mock handleMenu
  mockedHandleMenu.mockReturnValue(Promise.resolve());

  // Reset mocks between tests
  mockedGetUserInfo.mockClear();
  mockedGetLatestUserModel.mockClear();
  mockedGetReferalsCountAndUserData.mockClear();
  mockedSendPhotoDescriptionRequest.mockClear();
  mockedGenerateNeuroImageV2.mockClear();
  mockedHandleHelpCancel.mockClear();
  mockedMainMenu.mockClear();
  mockedHandleMenu.mockClear();
}

/**
 * Test entering the neuroPhotoWizardV2 scene
 */
export async function testNeuroPhotoWizardV2_EnterScene(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context for the first step
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = { ...ctx.session, mode: 'neuroPhotoV2' };
    
    // Run the first step of the scene
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[0](ctx as unknown as MyContext);
    
    // Check that getUserInfo was called
    if (mockedGetUserInfo.mock.calls.length === 0) {
      throw new Error('getUserInfo should have been called');
    }
    
    // Check that getLatestUserModel was called with correct args (bfl provider for V2)
    if (mockedGetLatestUserModel.mock.calls.length === 0) {
      throw new Error('getLatestUserModel should have been called');
    }
    expect(mockedGetLatestUserModel.mock.calls[0][0]).toBe(TEST_USER_ID.toString());
    expect(mockedGetLatestUserModel.mock.calls[0][1]).toBe('bfl');
    
    // Check that the user model was saved in the session
    if (!ctx.session.userModel) {
      throw new Error('User model should have been saved in session');
    }
    expect(ctx.session.userModel.finetune_id).toBe(TEST_FINETUNE_ID);
    
    // Check that sendPhotoDescriptionRequest was called
    if (mockedSendPhotoDescriptionRequest.mock.calls.length === 0) {
      throw new Error('sendPhotoDescriptionRequest should have been called');
    }
    
    // Check that the wizard moved to the next step
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizardV2: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Successfully entered neuroPhotoWizardV2 and displayed prompt instructions'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_EnterScene:', error);
    return {
      name: 'neuroPhotoWizardV2: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling the case when user doesn't have any trained models or subscription
 */
export async function testNeuroPhotoWizardV2_NoTrainedModels(): Promise<TestResult> {
  try {
    setupTest();
    
    // Change the mock to return null (no models)
    mockedGetLatestUserModel.mockReturnValue(Promise.resolve(null));
    
    // Create mock context for the first step
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    
    // Run the first step of the scene
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[0](ctx as unknown as MyContext);
    
    // Check that the correct error message was sent
    assertReplyContains(ctx, 'У вас нет обученных моделей');
    
    // Check that scene.leave was called
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizardV2: No Trained Models',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled case when user has no trained models'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_NoTrainedModels:', error);
    return {
      name: 'neuroPhotoWizardV2: No Trained Models',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling the case when user has a model but no subscription
 */
export async function testNeuroPhotoWizardV2_NoSubscription(): Promise<TestResult> {
  try {
    setupTest();
    
    // Change the mock to have a model but no subscription
    mockedGetLatestUserModel.mockReturnValue(Promise.resolve({
      finetune_id: TEST_FINETUNE_ID,
      trigger_word: TEST_TRIGGER_WORD
    }));
    mockedGetReferalsCountAndUserData.mockReturnValue(Promise.resolve({
      count: 5,
      subscription: null,
      level: 1
    }));
    
    // Create mock context for the first step
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    
    // Run the first step of the scene
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[0](ctx as unknown as MyContext);
    
    // Check that the correct error message was sent
    assertReplyContains(ctx, 'У вас нет обученных моделей');
    
    // Check that scene.leave was called
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizardV2: No Subscription',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled case when user has no subscription'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_NoSubscription:', error);
    return {
      name: 'neuroPhotoWizardV2: No Subscription',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test providing a text prompt
 */
export async function testNeuroPhotoWizardV2_ProvidePrompt(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 1 (prompt input)
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session = {
      ...ctx.session,
      userModel: {
        finetune_id: TEST_FINETUNE_ID,
        trigger_word: TEST_TRIGGER_WORD
      }
    };
    
    // Simulate a message with text prompt
    ctx.message = {
      message_id: 1,
      text: TEST_PROMPT
    } as any;
    
    // Run the second step of the scene (prompt input)
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[1](ctx as unknown as MyContext);
    
    // Check that the prompt was saved in the session
    expect(ctx.session.prompt).toBe(TEST_PROMPT);
    
    // Check that generateNeuroImageV2 was called with the correct parameters
    expect(mockedGenerateNeuroImageV2).toHaveBeenCalledWith(
      `${TEST_TRIGGER_WORD}, ${TEST_PROMPT}`,
      1,
      TEST_USER_ID.toString(),
      ctx,
      'test_bot'
    );
    
    // Check that wizard moves to next step
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizardV2: Provide Prompt',
      category: TestCategory.All,
      success: true,
      message: 'Successfully processed text prompt and generated image'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_ProvidePrompt:', error);
    return {
      name: 'neuroPhotoWizardV2: Provide Prompt',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test generating multiple images
 */
export async function testNeuroPhotoWizardV2_GenerateMultipleImages(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 2 (button interaction)
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.botInfo = { username: 'test_bot' } as any;
    ctx.session = {
      ...ctx.session,
      userModel: {
        finetune_id: TEST_FINETUNE_ID,
        trigger_word: TEST_TRIGGER_WORD
      },
      prompt: TEST_PROMPT
    };
    
    // Simulate button press for generating 4 images
    ctx.message = {
      message_id: 1,
      text: '4 фото'
    } as any;
    
    // Run the third step of the scene (button interaction)
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[2](ctx as unknown as MyContext);
    
    // Check that generateNeuroImageV2 was called with 4 as the count parameter
    expect(mockedGenerateNeuroImageV2).toHaveBeenCalledWith(
      `${TEST_TRIGGER_WORD}, ${TEST_PROMPT}`,
      4,
      TEST_USER_ID.toString(),
      ctx,
      'test_bot'
    );
    
    return {
      name: 'neuroPhotoWizardV2: Generate Multiple Images',
      category: TestCategory.All,
      success: true,
      message: 'Successfully generated multiple images'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_GenerateMultipleImages:', error);
    return {
      name: 'neuroPhotoWizardV2: Generate Multiple Images',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test clicking the "Improve Prompt" button
 */
export async function testNeuroPhotoWizardV2_ImprovePrompt(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 2 (button interaction)
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = {
      ...ctx.session,
      userModel: {
        finetune_id: TEST_FINETUNE_ID,
        trigger_word: TEST_TRIGGER_WORD
      },
      prompt: TEST_PROMPT
    };
    
    // Mock scene.enter
    (ctx as any).scene.enter = jest.fn().mockResolvedValue(undefined);
    
    // Simulate button press for improving prompt
    ctx.message = {
      message_id: 1,
      text: '⬆️ Улучшить промпт'
    } as any;
    
    // Run the third step of the scene (button interaction)
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[2](ctx as unknown as MyContext);
    
    // Check that the scene.enter method was called with correct scene name
    expect(ctx.scene.enter).toHaveBeenCalledWith('improvePromptWizard');
    
    return {
      name: 'neuroPhotoWizardV2: Improve Prompt',
      category: TestCategory.All,
      success: true,
      message: 'Successfully entered improve prompt wizard'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_ImprovePrompt:', error);
    return {
      name: 'neuroPhotoWizardV2: Improve Prompt',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test clicking the "Change Size" button
 */
export async function testNeuroPhotoWizardV2_ChangeSize(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 2 (button interaction)
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = {
      ...ctx.session,
      userModel: {
        finetune_id: TEST_FINETUNE_ID,
        trigger_word: TEST_TRIGGER_WORD
      },
      prompt: TEST_PROMPT
    };
    
    // Mock scene.enter
    (ctx as any).scene.enter = jest.fn().mockResolvedValue(undefined);
    
    // Simulate button press for changing size
    ctx.message = {
      message_id: 1,
      text: '📐 Изменить размер'
    } as any;
    
    // Run the third step of the scene (button interaction)
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[2](ctx as unknown as MyContext);
    
    // Check that the scene.enter method was called with correct scene name
    expect(ctx.scene.enter).toHaveBeenCalledWith('sizeWizard');
    
    return {
      name: 'neuroPhotoWizardV2: Change Size',
      category: TestCategory.All,
      success: true,
      message: 'Successfully entered size wizard'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_ChangeSize:', error);
    return {
      name: 'neuroPhotoWizardV2: Change Size',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test returning to main menu
 */
export async function testNeuroPhotoWizardV2_ReturnToMainMenu(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 2 (button interaction)
    const ctx = createMockWizardContext(2);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = {
      ...ctx.session,
      userModel: {
        finetune_id: TEST_FINETUNE_ID,
        trigger_word: TEST_TRIGGER_WORD
      },
      prompt: TEST_PROMPT
    };
    
    // Simulate button press for main menu
    ctx.message = {
      message_id: 1,
      text: '🏠 Главное меню'
    } as any;
    
    // Run the third step of the scene (button interaction)
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[2](ctx as unknown as MyContext);
    
    // Check that handleMenu was called
    expect(mockedHandleMenu).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizardV2: Return To Main Menu',
      category: TestCategory.All,
      success: true,
      message: 'Successfully returned to main menu'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_ReturnToMainMenu:', error);
    return {
      name: 'neuroPhotoWizardV2: Return To Main Menu',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling cancel/help commands
 */
export async function testNeuroPhotoWizardV2_HandleCancelHelp(): Promise<TestResult> {
  try {
    setupTest();
    
    // Set the handleHelpCancel mock to return true (cancel/help detected)
    mockedHandleHelpCancel.mockReturnValue(Promise.resolve(true));
    
    // Create mock context at step 1 (prompt input)
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    ctx.session = {
      ...ctx.session,
      userModel: {
        finetune_id: TEST_FINETUNE_ID,
        trigger_word: TEST_TRIGGER_WORD
      }
    };
    
    // Simulate message with cancel command
    ctx.message = {
      message_id: 1,
      text: '/cancel'
    } as any;
    
    // Run the second step of the scene (prompt input)
    const neuroPhotoWizardV2 = (await import('@/scenes/neuroPhotoWizardV2')).neuroPhotoWizardV2;
    await neuroPhotoWizardV2.steps[1](ctx as unknown as MyContext);
    
    // Check that handleHelpCancel was called
    expect(mockedHandleHelpCancel).toHaveBeenCalled();
    
    // Check that the scene was exited
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'neuroPhotoWizardV2: Handle Cancel/Help',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled cancel/help commands'
    };
  } catch (error) {
    logger.error('Error in testNeuroPhotoWizardV2_HandleCancelHelp:', error);
    return {
      name: 'neuroPhotoWizardV2: Handle Cancel/Help',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Run all tests for the neuroPhotoWizardV2 scene
 */
export async function runNeuroPhotoWizardV2Tests(): Promise<TestResult[]> {
  console.log('🧪 Running neuroPhotoWizardV2 tests...');
  
  const results: TestResult[] = [];
  
  try {
    results.push(await testNeuroPhotoWizardV2_EnterScene());
    results.push(await testNeuroPhotoWizardV2_NoTrainedModels());
    results.push(await testNeuroPhotoWizardV2_NoSubscription());
    results.push(await testNeuroPhotoWizardV2_ProvidePrompt());
    results.push(await testNeuroPhotoWizardV2_GenerateMultipleImages());
    results.push(await testNeuroPhotoWizardV2_ImprovePrompt());
    results.push(await testNeuroPhotoWizardV2_ChangeSize());
    results.push(await testNeuroPhotoWizardV2_ReturnToMainMenu());
    results.push(await testNeuroPhotoWizardV2_HandleCancelHelp());
  } catch (error) {
    logger.error('Error running neuroPhotoWizardV2 tests:', error);
    results.push({
      name: 'neuroPhotoWizardV2: Overall',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

/**
 * Helper function for assertions
 */
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
      if (!value || !value.mock) {
        throw new Error('Expected function to be a mock');
      }
      
      if (value.mock.calls.length === 0) {
        throw new Error('Expected function to have been called');
      }
      
      const lastCall = value.mock.calls[value.mock.calls.length - 1];
      
      for (let i = 0; i < args.length; i++) {
        if (args[i] !== lastCall[i]) {
          throw new Error(`Expected call argument ${i} to be ${args[i]} but got ${lastCall[i]}`);
        }
      }
    }
  };
}

export default runNeuroPhotoWizardV2Tests; 