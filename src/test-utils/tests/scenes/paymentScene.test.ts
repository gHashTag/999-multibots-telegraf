import { MyContext } from '@/interfaces';
import { getTestContext } from '@/test-utils/helpers/context';
import { initMockBot } from '@/test-utils/helpers/mockBot';
import mockApi from '@/test-utils/core/mock';
import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';
import { paymentScene } from '@/scenes/paymentScene';
import * as supabaseModule from '@/core/supabase';
import * as configModule from '@/config';
import * as invoiceHelper from '@/scenes/getRuBillWizard/helper';
import { ModeEnum } from '@/price/helpers/modelsCost';
import * as handleSelectStarsModule from '@/handlers/handleSelectStars';
import * as handleBuySubscriptionModule from '@/handlers/handleBuySubscription';

// Mock functions
let mockCreatePendingPayment: ReturnType<typeof mockApi.create>;
let mockGenerateUniqueShortInvId: ReturnType<typeof mockApi.create>;
let mockHandleSelectStars: ReturnType<typeof mockApi.create>;
let mockHandleBuySubscription: ReturnType<typeof mockApi.create>;

// Constants for testing
const TEST_USER_ID = 123456789;
const TEST_PAYMENT_AMOUNT = 999;
const TEST_STARS_AMOUNT = 433;
const TEST_INV_ID = '12345';
const TEST_URL = 'https://test-payment-url.com';

const setupTest = () => {
  // Reset and initialize mock bot
  initMockBot();
  
  // Mock createPendingPayment function
  mockCreatePendingPayment = mockApi.create({
    name: 'createPendingPayment',
    implementation: async () => ({ success: true })
  });
  Object.defineProperty(supabaseModule, 'createPendingPayment', {
    value: mockCreatePendingPayment,
    configurable: true
  });
  
  // Mock generateUniqueShortInvId function
  mockGenerateUniqueShortInvId = mockApi.create({
    name: 'generateUniqueShortInvId',
    implementation: async () => TEST_INV_ID
  });
  Object.defineProperty(invoiceHelper, 'generateUniqueShortInvId', {
    value: mockGenerateUniqueShortInvId,
    configurable: true
  });
  
  // Mock configuration values
  Object.defineProperty(configModule, 'MERCHANT_LOGIN', {
    value: 'test_merchant',
    configurable: true
  });
  Object.defineProperty(configModule, 'PASSWORD1', {
    value: 'test_password',
    configurable: true
  });
  
  // Mock handleSelectStars and handleBuySubscription
  mockHandleSelectStars = mockApi.create({
    name: 'handleSelectStars',
    implementation: async () => true
  });
  // Assuming handleSelectStars is exported as default or has a default property
  Object.defineProperty(handleSelectStarsModule, 'handleSelectStars', {
    value: mockHandleSelectStars,
    configurable: true
  });
  
  mockHandleBuySubscription = mockApi.create({
    name: 'handleBuySubscription',
    implementation: async () => true
  });
  // Assuming handleBuySubscription is exported as default or has a default property
  Object.defineProperty(handleBuySubscriptionModule, 'handleBuySubscription', {
    value: mockHandleBuySubscription, 
    configurable: true
  });
};

/**
 * Test for entering the payment scene
 */
export async function testPaymentScene_Enter(): Promise<TestResult> {
  const testName = 'paymentScene: Enter Scene';
  
  try {
    setupTest();
    
    // Create context with mocked reply function
    const ctx = getTestContext({
      from: {
        id: TEST_USER_ID,
        username: 'testuser',
        language_code: 'en'
      }
    });
    
    // Make reply a mock function that we can check
    const replyMock = mockApi.create({
      name: 'reply',
      implementation: async () => ({ message_id: 123 })
    });
    ctx.reply = replyMock as any;
    
    // Set session data
    ctx.session = {
      language: 'en',
      mode: ModeEnum.PaymentScene,
      // Add additional required properties for MySession
      email: '',
      selectedModel: '',
      audioToText: false,
      prompt: '',
      userId: '',
      telegramId: '',
      subscription: null,
      selectedPayment: null,
      discount: 0,
      ambassador: null,
      notificationSettings: null,
      trialEnded: false,
      __scenes: {
        current: 'payment',
        state: {}
      }
    };
    
    // Enter the scene
    await paymentScene.enter(ctx);
    
    // Check that the reply contains payment options
    if (!replyMock) {
      throw new Error('replyMock is not defined');
    }
    
    // Check the mock calls
    const replyCalls = replyMock.mock.calls || [];
    const hasPaymentOptions = replyCalls.some((call: any[]) => 
      call && 
      Array.isArray(call) && 
      call[0] && 
      typeof call[0] === 'string' && 
      call[0].includes('How do you want to pay?')
    );
    
    if (!hasPaymentOptions) {
      throw new Error('Payment options message was not found');
    }
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testPaymentScene_Enter.meta = { category: TestCategory.All };

/**
 * Test for the payment scene with a selected payment already in session
 */
export async function testPaymentScene_WithSelectedPayment(): Promise<TestResult> {
  const testName = 'paymentScene: With Selected Payment';
  
  try {
    setupTest();
    
    // Create context with mocked reply function
    const ctx = getTestContext({
      from: {
        id: TEST_USER_ID,
        username: 'testuser',
        language_code: 'en'
      }
    });
    
    // Make reply a mock function that we can check
    const replyMock = mockApi.create({
      name: 'reply',
      implementation: async () => ({ message_id: 123 })
    });
    ctx.reply = replyMock as any;
    
    // Set session data with selected payment
    ctx.session = {
      language: 'en',
      mode: ModeEnum.PaymentScene,
      // Add additional required properties for MySession
      email: '',
      selectedModel: '',
      audioToText: false,
      prompt: '',
      userId: '',
      telegramId: '',
      subscription: null,
      selectedPayment: {
        amount: TEST_PAYMENT_AMOUNT,
        stars: TEST_STARS_AMOUNT,
        subscription: null // Subscription should be a valid type or null
      },
      discount: 0,
      ambassador: null,
      notificationSettings: null,
      trialEnded: false,
      __scenes: {
        current: 'payment',
        state: {}
      }
    };
    
    // Mock getBotInfo to return username
    Object.defineProperty(ctx, 'botInfo', {
      value: {
        username: 'test_bot',
        id: 1234567890,
        is_bot: true,
        first_name: 'Test Bot'
      },
      configurable: true
    });
    
    // Enter the scene
    await paymentScene.enter(ctx);
    
    // Check that createPendingPayment was called
    const createPaymentCalls = mockCreatePendingPayment.mock.calls || [];
    if (createPaymentCalls.length === 0) {
      throw new Error('createPendingPayment was not called');
    }
    
    // Check the reply contains payment information
    const replyCalls = replyMock.mock.calls || [];
    const hasPaymentInfo = replyCalls.some((call: any[]) => 
      call &&
      Array.isArray(call) && 
      call[0] && 
      typeof call[0] === 'string' && 
      call[0].includes(`Payment ${TEST_PAYMENT_AMOUNT}`)
    );
    
    if (!hasPaymentInfo) {
      throw new Error('Payment information message was not found');
    }
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testPaymentScene_WithSelectedPayment.meta = { category: TestCategory.All };

/**
 * Test for paying with stars
 */
export async function testPaymentScene_PayWithStars(): Promise<TestResult> {
  const testName = 'paymentScene: Pay With Stars';
  
  try {
    setupTest();
    
    // Create a context that simulates a "⭐️ Stars" message
    const ctx = getTestContext({
      from: {
        id: TEST_USER_ID,
        username: 'testuser',
        language_code: 'en'
      },
      message: {
        text: '⭐️ Stars',
        message_id: 123,
        date: Date.now()
      }
    });
    
    // Set session data
    ctx.session = {
      language: 'en',
      mode: ModeEnum.PaymentScene,
      // Add additional required properties for MySession
      email: '',
      selectedModel: '',
      audioToText: false,
      prompt: '',
      userId: '',
      telegramId: '',
      subscription: null,
      selectedPayment: null,
      discount: 0,
      ambassador: null,
      notificationSettings: null,
      trialEnded: false,
      __scenes: {
        current: 'payment',
        state: {}
      }
    };
    
    // Manually call the hears handler to avoid middleware issues
    const hearsHandler = paymentScene._handlers?.hears?.find(h => 
      (h.triggers as string[]).includes('⭐️ Stars') || 
      (h.triggers as string[]).includes('⭐️ Звездами')
    );
    
    if (!hearsHandler || !hearsHandler.middleware) {
      throw new Error('Stars handler not found');
    }
    
    // Call the handler directly
    await hearsHandler.middleware(ctx, async () => {});
    
    // Check that handleSelectStars was called
    const handleStarsCalls = mockHandleSelectStars.mock.calls || [];
    if (handleStarsCalls.length === 0) {
      throw new Error('handleSelectStars was not called');
    }
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testPaymentScene_PayWithStars.meta = { category: TestCategory.All };

/**
 * Test for paying with subscription
 */
export async function testPaymentScene_PayWithSubscription(): Promise<TestResult> {
  const testName = 'paymentScene: Pay With Subscription';
  
  try {
    setupTest();
    
    // Create a context that simulates a "⭐️ Stars" message
    const ctx = getTestContext({
      from: {
        id: TEST_USER_ID,
        username: 'testuser',
        language_code: 'en'
      },
      message: {
        text: '⭐️ Stars',
        message_id: 123,
        date: Date.now()
      }
    });
    
    // Set session data with subscription
    ctx.session = {
      language: 'en',
      mode: ModeEnum.PaymentScene,
      // Add additional required properties for MySession
      email: '',
      selectedModel: '',
      audioToText: false,
      prompt: '',
      userId: '',
      telegramId: '',
      subscription: 'neurobase',
      selectedPayment: null,
      discount: 0,
      ambassador: null,
      notificationSettings: null,
      trialEnded: false,
      __scenes: {
        current: 'payment',
        state: {}
      }
    };
    
    // Manually call the hears handler to avoid middleware issues
    const hearsHandler = paymentScene._handlers?.hears?.find(h => 
      (h.triggers as string[]).includes('⭐️ Stars') || 
      (h.triggers as string[]).includes('⭐️ Звездами')
    );
    
    if (!hearsHandler || !hearsHandler.middleware) {
      throw new Error('Stars handler not found');
    }
    
    // Call the handler directly
    await hearsHandler.middleware(ctx, async () => {});
    
    // Check that handleBuySubscription was called
    const handleSubscriptionCalls = mockHandleBuySubscription.mock.calls || [];
    if (handleSubscriptionCalls.length === 0) {
      throw new Error('handleBuySubscription was not called');
    }
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testPaymentScene_PayWithSubscription.meta = { category: TestCategory.All };

/**
 * Test for paying with rubles
 */
export async function testPaymentScene_PayWithRubles(): Promise<TestResult> {
  const testName = 'paymentScene: Pay With Rubles';
  
  try {
    setupTest();
    
    // Create a context that simulates a "💳 In rubles" message
    const ctx = getTestContext({
      from: {
        id: TEST_USER_ID,
        username: 'testuser',
        language_code: 'en'
      },
      message: {
        text: '💳 In rubles',
        message_id: 123,
        date: Date.now()
      }
    });
    
    // Make reply a mock function that we can check
    const replyMock = mockApi.create({
      name: 'reply',
      implementation: async () => ({ message_id: 123 })
    });
    ctx.reply = replyMock as any;
    
    // Mock getBotInfo to return username
    Object.defineProperty(ctx, 'botInfo', {
      value: {
        username: 'test_bot',
        id: 1234567890,
        is_bot: true,
        first_name: 'Test Bot'
      },
      configurable: true
    });
    
    // Set session data with subscription
    ctx.session = {
      language: 'en',
      mode: ModeEnum.PaymentScene,
      // Add additional required properties for MySession
      email: '',
      selectedModel: '',
      audioToText: false,
      prompt: '',
      userId: '',
      telegramId: '',
      subscription: 'neurobase',
      selectedPayment: null,
      discount: 0,
      ambassador: null,
      notificationSettings: null,
      trialEnded: false,
      __scenes: {
        current: 'payment',
        state: {}
      }
    };
    
    // Manually call the hears handler to avoid middleware issues
    const hearsHandler = paymentScene._handlers?.hears?.find(h => 
      (h.triggers as string[]).includes('💳 In rubles') || 
      (h.triggers as string[]).includes('💳 Рублями')
    );
    
    if (!hearsHandler || !hearsHandler.middleware) {
      throw new Error('Rubles handler not found');
    }
    
    // Call the handler directly
    await hearsHandler.middleware(ctx, async () => {});
    
    // Check that createPendingPayment was called
    const createPaymentCalls = mockCreatePendingPayment.mock.calls || [];
    if (createPaymentCalls.length === 0) {
      throw new Error('createPendingPayment was not called');
    }
    
    // Check if reply contains payment URL
    const replyCalls = replyMock.mock.calls || [];
    const hasPaymentInfo = replyCalls.some((call: any[]) => 
      call &&
      Array.isArray(call) && 
      call[0] && 
      typeof call[0] === 'string' && 
      call[0].includes('Payment')
    );
    
    if (!hasPaymentInfo) {
      throw new Error('Payment information message was not found');
    }
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testPaymentScene_PayWithRubles.meta = { category: TestCategory.All };

/**
 * Test for returning to the main menu
 */
export async function testPaymentScene_ReturnToMainMenu(): Promise<TestResult> {
  const testName = 'paymentScene: Return To Main Menu';
  
  try {
    setupTest();
    
    // Create a context that simulates a "🏠 Main menu" message
    const ctx = getTestContext({
      from: {
        id: TEST_USER_ID,
        username: 'testuser',
        language_code: 'en'
      },
      message: {
        text: '🏠 Main menu',
        message_id: 123,
        date: Date.now()
      }
    });
    
    // Set session data
    ctx.session = {
      language: 'en',
      mode: ModeEnum.PaymentScene,
      // Add additional required properties for MySession
      email: '',
      selectedModel: '',
      audioToText: false,
      prompt: '',
      userId: '',
      telegramId: '',
      subscription: null,
      selectedPayment: null, 
      discount: 0,
      ambassador: null,
      notificationSettings: null,
      trialEnded: false,
      __scenes: {
        current: 'payment',
        state: {}
      }
    };
    
    // Mock scene.enter method
    const enterMock = mockApi.create({
      name: 'scene.enter',
      implementation: async () => true
    });
    
    ctx.scene = {
      enter: enterMock,
      leave: mockApi.create({
        name: 'scene.leave',
        implementation: async () => true
      })
    } as any;
    
    // Manually call the hears handler to avoid middleware issues
    const hearsHandler = paymentScene._handlers?.hears?.find(h => 
      (h.triggers as string[]).includes('🏠 Main menu') || 
      (h.triggers as string[]).includes('🏠 Главное меню')
    );
    
    if (!hearsHandler || !hearsHandler.middleware) {
      throw new Error('Main menu handler not found');
    }
    
    // Call the handler directly
    await hearsHandler.middleware(ctx, async () => {});
    
    // Check that scene.enter was called with menuScene
    const sceneEnterCalls = enterMock.mock.calls || [];
    const hasMenuScene = sceneEnterCalls.some((call: any[]) => 
      call && Array.isArray(call) && call[0] === 'menuScene'
    );
    
    if (!hasMenuScene) {
      throw new Error('scene.enter was not called with menuScene');
    }
    
    return {
      name: testName,
      success: true,
      message: 'Test passed successfully'
    };
  } catch (error) {
    console.error(`Error in ${testName}:`, error);
    return {
      name: testName,
      success: false,
      message: `Test failed: ${error}`
    };
  }
}
testPaymentScene_ReturnToMainMenu.meta = { category: TestCategory.All }; 