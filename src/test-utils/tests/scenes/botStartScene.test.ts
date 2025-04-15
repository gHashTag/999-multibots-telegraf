import { MyContext } from '@/interfaces';
import {
  createMockUser,
  createTypedContext,
  createMockFunction,
  runSceneStep,
  createMockSubscription
} from '../../core/mockHelper';
import { TestResult } from '../../core/types';
import {
  assertReplyContains,
  assertReplyMarkupContains,
  assertScene
} from '../../core/assertions';
import { create as mockFunction } from '../../core/mock';
import { logger } from '@/utils/logger';
import { TestCategory } from '../../core/categories';
import { getUserBalance, getUserByTelegramId } from '@/core/supabase';
import { getUserSub } from '@/libs/database';
import { 
  mockInngestSend, 
  verifyInngestEvent, 
  expect as testExpect,
  runTest 
} from '../../core/testHelpers';

// Mock functions
const mockedGetUserBalance = createMockFunction<typeof getUserBalance>();
const mockedGetUserByTelegramId = createMockFunction<typeof getUserByTelegramId>();
const mockedGetUserSub = createMockFunction<typeof getUserSub>();
const mockedIsAdmin = createMockFunction<(userId: string) => Promise<boolean>>();

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_USERNAME = 'test_user';
const TEST_FIRST_NAME = 'Test';
const TEST_BALANCE = 100;

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getUserBalance
  mockedGetUserBalance.mockReturnValue(Promise.resolve(TEST_BALANCE));
  
  // Mock getUserByTelegramId - using createMockUser for proper typing
  mockedGetUserByTelegramId.mockReturnValue(Promise.resolve(createMockUser({
    id: TEST_USER_ID.toString(),
    username: TEST_USERNAME,
    telegram_id: TEST_USER_ID.toString(),
    balance: TEST_BALANCE
  })));
  
  // Mock getUserSub
  mockedGetUserSub.mockReturnValue(Promise.resolve(null));
  
  // Mock isAdmin
  mockedIsAdmin.mockReturnValue(Promise.resolve(false));
  
  // Reset mocks between tests
  mockedGetUserBalance.mockClear();
  mockedGetUserByTelegramId.mockClear();
  mockedGetUserSub.mockClear();
  mockedIsAdmin.mockClear();
}

/**
 * Test entering the bot start scene with /start command
 */
export async function testBotStartScene_EnterWithStartCommand(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest();
      
      // Create properly typed mock context
      const ctx = createTypedContext({
        from: { 
          id: TEST_USER_ID, 
          is_bot: false, 
          first_name: TEST_FIRST_NAME, 
          language_code: 'en',
          username: TEST_USERNAME
        },
        session: {
          username: TEST_USERNAME
        },
        message: { text: '/start', message_id: 1 }
      });
      
      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene');
      // Use the first step of the scene directly with proper typing
      await runSceneStep(startScene.steps[0], ctx);
      
      // Check that the welcome message was sent
      assertReplyContains(ctx, 'Welcome');
      
      // Check that the main menu was displayed
      assertReplyMarkupContains(ctx, 'Main Menu');
      
      return {
        message: 'Successfully entered botStartScene with /start command'
      };
    },
    {
      name: 'botStartScene: Enter With /start Command',
      category: TestCategory.All
    }
  );
}

/**
 * Test entering the bot start scene with new user
 */
export async function testBotStartScene_NewUser(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest();
      
      // Mock getUserByTelegramId to return null (new user)
      mockedGetUserByTelegramId.mockReturnValue(Promise.resolve(null));
      
      // Create properly typed mock context
      const ctx = createTypedContext({
        from: { 
          id: TEST_USER_ID, 
          is_bot: false, 
          first_name: TEST_FIRST_NAME, 
          language_code: 'en',
          username: TEST_USERNAME
        },
        session: {
          username: TEST_USERNAME
        },
        message: { text: '/start', message_id: 1 }
      });
      
      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene');
      await runSceneStep(startScene.steps[0], ctx);
      
      // Check that the new user welcome message was sent
      assertReplyContains(ctx, 'new user');
      
      // Check that the scene was redirected to createUserScene
      if (!ctx.scene || !ctx.scene.enter) {
        throw new Error('Scene enter method should be defined');
      }
      testExpect(ctx.scene.enter).toHaveBeenCalled();
      
      return {
        message: 'Successfully handled new user in botStartScene'
      };
    },
    {
      name: 'botStartScene: New User',
      category: TestCategory.All
    }
  );
}

/**
 * Test handling user with referral parameter
 */
export async function testBotStartScene_WithReferralParameter(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest();
      
      // Create properly typed mock context with referral parameter
      const ctx = createTypedContext({
        from: { 
          id: TEST_USER_ID, 
          is_bot: false, 
          first_name: TEST_FIRST_NAME, 
          language_code: 'en',
          username: TEST_USERNAME
        },
        session: {
          username: TEST_USERNAME
        },
        message: { text: '/start ref123456', message_id: 1 }
      });
      
      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene');
      await runSceneStep(startScene.steps[0], ctx);
      
      // Check that referral was processed
      assertReplyContains(ctx, 'referral');
      
      // Check that the scene was redirected to createUserScene
      if (!ctx.scene || !ctx.scene.enter) {
        throw new Error('Scene enter method should be defined');
      }
      testExpect(ctx.scene.enter).toHaveBeenCalled();
      
      return {
        message: 'Successfully processed referral parameter in botStartScene'
      };
    },
    {
      name: 'botStartScene: With Referral Parameter',
      category: TestCategory.All
    }
  );
}

/**
 * Test handling language selection
 */
export async function testBotStartScene_LanguageSelection(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest();
      
      // Create properly typed mock context with Russian language
      const ctx = createTypedContext({
        from: { 
          id: TEST_USER_ID, 
          is_bot: false, 
          first_name: TEST_FIRST_NAME, 
          language_code: 'ru',
          username: TEST_USERNAME
        },
        session: {
          username: TEST_USERNAME
        },
        message: { text: '/start', message_id: 1 }
      });
      
      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene');
      await runSceneStep(startScene.steps[0], ctx);
      
      // Check that Russian language welcome message was sent
      assertReplyContains(ctx, 'Добро пожаловать');
      
      return {
        message: 'Successfully displayed proper language in botStartScene'
      };
    },
    {
      name: 'botStartScene: Language Selection',
      category: TestCategory.All
    }
  );
}

/**
 * Run all botStartScene tests
 */
export async function runBotStartSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = [];
  
  try {
    // Run each test and collect results
    results.push(await testBotStartScene_EnterWithStartCommand());
    results.push(await testBotStartScene_NewUser());
    results.push(await testBotStartScene_WithReferralParameter());
    results.push(await testBotStartScene_LanguageSelection());
  } catch (error) {
    logger.error('Error running botStartScene tests:', error);
    results.push({
      name: 'botStartScene tests',
      category: TestCategory.All,
      success: false,
      message: String(error)
    });
  }
  
  return results;
}

export default runBotStartSceneTests; 