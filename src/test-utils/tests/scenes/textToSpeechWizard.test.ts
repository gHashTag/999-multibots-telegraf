import { MyContext } from '@/interfaces';
import { createMockContext, createMockWizardContext } from '../../core/mockContext';
import { TestResult } from '../../core/types';
import { assertReplyContains, assertScene } from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { logger } from '@/utils/logger';
import { TestCategory } from '../../core/categories';
import { inngest } from '@/inngest-functions/clients';

// Mocked functions
const mockedGetVoiceId = mockFunction<typeof import('@/core/supabase').getVoiceId>();
const mockedHandleHelpCancel = mockFunction<typeof import('@/handlers/handleHelpCancel').handleHelpCancel>();
const mockedInngestSend = mockFunction<typeof inngest.send>();

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_VOICE_ID = 'voiceid_123456';
const TEST_TEXT = 'This is a test text for voice conversion';
const TEST_BOT_USERNAME = 'test_bot';

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getVoiceId
  mockedGetVoiceId.mockReturnValue(Promise.resolve(TEST_VOICE_ID));

  // Mock handleHelpCancel
  mockedHandleHelpCancel.mockReturnValue(Promise.resolve(false));

  // Mock inngest.send
  mockedInngestSend.mockReturnValue(Promise.resolve());

  // Reset mocks between tests
  mockedGetVoiceId.mockClear();
  mockedHandleHelpCancel.mockClear();
  mockedInngestSend.mockClear();
}

/**
 * Test entering the textToSpeechWizard scene
 */
export async function testTextToSpeechWizard_EnterScene(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context for the first step
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'en' };
    
    // Run the first step of the scene
    const textToSpeechWizard = (await import('@/scenes/textToSpeechWizard')).default;
    await textToSpeechWizard.steps[0](ctx as unknown as MyContext);
    
    // Check that the correct message was sent
    assertReplyContains(ctx, 'Send text, to convert it to voice');
    
    // Check that the wizard moved to the next step
    expect(ctx.wizard.next).toHaveBeenCalled();
    
    return {
      name: 'textToSpeechWizard: Enter Scene',
      category: TestCategory.All,
      success: true,
      message: 'Successfully entered textToSpeechWizard and displayed instructions'
    };
  } catch (error) {
    logger.error('Error in testTextToSpeechWizard_EnterScene:', error);
    return {
      name: 'textToSpeechWizard: Enter Scene',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test providing text for voice conversion
 */
export async function testTextToSpeechWizard_ProvideText(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 1 (text input)
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'en' };
    ctx.botInfo = { username: TEST_BOT_USERNAME } as any;
    
    // Simulate message with text
    ctx.message = {
      message_id: 1,
      text: TEST_TEXT
    } as any;
    
    // Run the text processing step
    const textToSpeechWizard = (await import('@/scenes/textToSpeechWizard')).default;
    await textToSpeechWizard.steps[1](ctx as unknown as MyContext);
    
    // Check that getVoiceId was called with the correct user ID
    if (mockedGetVoiceId.mock.calls.length === 0) {
      throw new Error('getVoiceId should have been called');
    }
    expect(mockedGetVoiceId.mock.calls[0][0]).toBe(TEST_USER_ID.toString());
    
    // Check that inngest.send was called with the correct parameters
    if (mockedInngestSend.mock.calls.length === 0) {
      throw new Error('inngest.send should have been called');
    }
    
    const inngestCallArg = mockedInngestSend.mock.calls[0][0];
    expect(inngestCallArg.name).toBe('text-to-speech.requested');
    expect(inngestCallArg.data.text).toBe(TEST_TEXT);
    expect(inngestCallArg.data.voice_id).toBe(TEST_VOICE_ID);
    expect(inngestCallArg.data.telegram_id).toBe(TEST_USER_ID.toString());
    expect(inngestCallArg.data.is_ru).toBe(false);
    expect(inngestCallArg.data.bot_name).toBe(TEST_BOT_USERNAME);
    
    // Check that the scene was left
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'textToSpeechWizard: Provide Text',
      category: TestCategory.All,
      success: true,
      message: 'Successfully processed text and sent text-to-speech request'
    };
  } catch (error) {
    logger.error('Error in testTextToSpeechWizard_ProvideText:', error);
    return {
      name: 'textToSpeechWizard: Provide Text',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test case when user doesn't have a voice ID
 */
export async function testTextToSpeechWizard_NoVoiceId(): Promise<TestResult> {
  try {
    setupTest();
    
    // Change the mock to return null (no voice ID)
    mockedGetVoiceId.mockReturnValue(Promise.resolve(null));
    
    // Create mock context at step 1 (text input)
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'en' };
    
    // Simulate message with text
    ctx.message = {
      message_id: 1,
      text: TEST_TEXT
    } as any;
    
    // Run the text processing step
    const textToSpeechWizard = (await import('@/scenes/textToSpeechWizard')).default;
    await textToSpeechWizard.steps[1](ctx as unknown as MyContext);
    
    // Check that the correct error message was sent
    assertReplyContains(ctx, 'train the avatar using');
    
    // Check that inngest.send was NOT called
    if (mockedInngestSend.mock.calls.length > 0) {
      throw new Error('inngest.send should NOT have been called when user has no voice ID');
    }
    
    // Check that the scene was left
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    return {
      name: 'textToSpeechWizard: No Voice ID',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled case when user has no voice ID'
    };
  } catch (error) {
    logger.error('Error in testTextToSpeechWizard_NoVoiceId:', error);
    return {
      name: 'textToSpeechWizard: No Voice ID',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling non-text messages
 */
export async function testTextToSpeechWizard_NonTextMessage(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context at step 1 (text input)
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'en' };
    
    // Simulate message without text (e.g., photo message)
    ctx.message = {
      message_id: 1,
      photo: [{ file_id: 'test_file', file_unique_id: 'unique_id', width: 100, height: 100, file_size: 1000 }]
    } as any;
    
    // Run the text processing step
    const textToSpeechWizard = (await import('@/scenes/textToSpeechWizard')).default;
    await textToSpeechWizard.steps[1](ctx as unknown as MyContext);
    
    // Check that the correct error message was sent
    assertReplyContains(ctx, 'Please send text');
    
    // Check that inngest.send was NOT called
    if (mockedInngestSend.mock.calls.length > 0) {
      throw new Error('inngest.send should NOT have been called for non-text messages');
    }
    
    return {
      name: 'textToSpeechWizard: Non-Text Message',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled non-text message'
    };
  } catch (error) {
    logger.error('Error in testTextToSpeechWizard_NonTextMessage:', error);
    return {
      name: 'textToSpeechWizard: Non-Text Message',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test handling cancel/help commands
 */
export async function testTextToSpeechWizard_HandleCancelHelp(): Promise<TestResult> {
  try {
    setupTest();
    
    // Change handleHelpCancel to return true (cancel)
    mockedHandleHelpCancel.mockReturnValue(Promise.resolve(true));
    
    // Create mock context at step 1 (text input)
    const ctx = createMockWizardContext(1);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'en' };
    
    // Simulate message with /cancel
    ctx.message = {
      message_id: 1,
      text: '/cancel'
    } as any;
    
    // Run the text processing step
    const textToSpeechWizard = (await import('@/scenes/textToSpeechWizard')).default;
    await textToSpeechWizard.steps[1](ctx as unknown as MyContext);
    
    // Check that scene.leave was called
    expect(ctx.scene.leave).toHaveBeenCalled();
    
    // Check that inngest.send was NOT called
    if (mockedInngestSend.mock.calls.length > 0) {
      throw new Error('inngest.send should NOT have been called when command is canceled');
    }
    
    return {
      name: 'textToSpeechWizard: Handle Cancel/Help',
      category: TestCategory.All,
      success: true,
      message: 'Successfully handled cancel/help commands'
    };
  } catch (error) {
    logger.error('Error in testTextToSpeechWizard_HandleCancelHelp:', error);
    return {
      name: 'textToSpeechWizard: Handle Cancel/Help',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Test localization (Russian language)
 */
export async function testTextToSpeechWizard_Localization(): Promise<TestResult> {
  try {
    setupTest();
    
    // Create mock context for the first step with Russian language
    const ctx = createMockWizardContext(0);
    ctx.from = { id: TEST_USER_ID, is_bot: false, first_name: 'Test', username: TEST_USERNAME, language_code: 'ru' };
    
    // Run the first step of the scene
    const textToSpeechWizard = (await import('@/scenes/textToSpeechWizard')).default;
    await textToSpeechWizard.steps[0](ctx as unknown as MyContext);
    
    // Check that the message is in Russian
    assertReplyContains(ctx, 'Отправьте текст, для преобразования его в голос');
    
    return {
      name: 'textToSpeechWizard: Localization',
      category: TestCategory.All,
      success: true,
      message: 'Successfully displayed instructions in Russian'
    };
  } catch (error) {
    logger.error('Error in testTextToSpeechWizard_Localization:', error);
    return {
      name: 'textToSpeechWizard: Localization',
      category: TestCategory.All,
      success: false,
      message: String(error)
    };
  }
}

/**
 * Run all tests for the textToSpeechWizard scene
 */
export async function runTextToSpeechWizardTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    results.push(await testTextToSpeechWizard_EnterScene());
    results.push(await testTextToSpeechWizard_ProvideText());
    results.push(await testTextToSpeechWizard_NoVoiceId());
    results.push(await testTextToSpeechWizard_NonTextMessage());
    results.push(await testTextToSpeechWizard_HandleCancelHelp());
    results.push(await testTextToSpeechWizard_Localization());
  } catch (error) {
    results.push({
      name: 'textToSpeechWizard: Overall',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

// Helper functions for assertions
function expect(value: any): { toBe: (expected: any) => void; toHaveBeenCalled: () => void; toHaveBeenCalledWith: (...args: any[]) => void; toBeGreaterThan: (expected: number) => void } {
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
    },
    toBeGreaterThan: (expected: number) => {
      if (value <= expected) {
        throw new Error(`Expected ${value} to be greater than ${expected}`);
      }
    }
  };
} 