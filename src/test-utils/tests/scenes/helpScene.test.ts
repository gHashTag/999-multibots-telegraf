import { Context, Scenes } from 'telegraf';
import { createMockContext } from '../../core/mockContext';
import { helpScene } from '../../../scenes/helpScene';
import { mockFn } from '../../core/mockFunction';
import { TestResult } from '../../core/types';

// Create mock functions for the required services
const getUserIsPremiumMock = mockFn().mockResolvedValue(false);
const getReferalsCountAndUserDataMock = mockFn().mockResolvedValue({
  count: 0,
  isReferalFeatureEnabled: true
});
const logMock = {
  info: mockFn(),
  error: mockFn()
};

// Mock the required modules
jest.mock('../../../services/payments/common', () => ({
  getUserIsPremium: getUserIsPremiumMock
}));

jest.mock('../../../services/payments/referals', () => ({
  getReferalsCountAndUserData: getReferalsCountAndUserDataMock
}));

jest.mock('../../../services/log', () => ({
  log: logMock
}));

async function setupContext(language = 'ru') {
  const mockContext = createMockContext();
  
  // Set up session
  mockContext.session = {
    __scenes: {},
    user: {
      language,
      isReferalFeatureEnabled: true,
    },
  } as any;
  
  return mockContext;
}

// Test for entering the help scene
async function testEnterHelpScene(): Promise<TestResult> {
  try {
    const ctx = await setupContext();
    getUserIsPremiumMock.mockResolvedValue(false);
    getReferalsCountAndUserDataMock.mockResolvedValue({
      count: 0,
      isReferalFeatureEnabled: true,
    });
    
    // Trigger the enter handler
    await helpScene.middleware()(
      ctx as any,
      async () => {}
    );

    // Verify that the help message was sent
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Help Scene Entry Test',
        success: false,
        message: 'Reply method was not called'
      };
    }
    
    const replyArgs = ctx.reply.mock.calls[0][0];
    if (!replyArgs.includes('Привет!')) {
      return {
        name: 'Help Scene Entry Test',
        success: false,
        message: 'Russian help message not found in reply'
      };
    }
    
    return {
      name: 'Help Scene Entry Test',
      success: true,
      message: 'Help scene correctly displays Russian help message'
    };
  } catch (error: any) {
    return {
      name: 'Help Scene Entry Test',
      success: false,
      message: `Test failed with error: ${error.message}`
    };
  }
}

// Test for English language support
async function testEnterHelpSceneEnglish(): Promise<TestResult> {
  try {
    const ctx = await setupContext('en');
    
    // Trigger the enter handler
    await helpScene.middleware()(
      ctx as any,
      async () => {}
    );

    // Verify that the English help message was sent
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Help Scene English Language Test',
        success: false,
        message: 'Reply method was not called'
      };
    }
    
    const replyArgs = ctx.reply.mock.calls[0][0];
    if (!replyArgs.includes('Hello!')) {
      return {
        name: 'Help Scene English Language Test',
        success: false,
        message: 'English help message not found in reply'
      };
    }
    
    return {
      name: 'Help Scene English Language Test',
      success: true,
      message: 'Help scene correctly displays English help message'
    };
  } catch (error: any) {
    return {
      name: 'Help Scene English Language Test',
      success: false,
      message: `Test failed with error: ${error.message}`
    };
  }
}

// Error handling test
async function testErrorHandling(): Promise<TestResult> {
  try {
    const ctx = await setupContext();
    
    // Force an error
    getReferalsCountAndUserDataMock.mockRejectedValue(new Error('Test error'));
    
    // Clear previous calls to log.error
    logMock.error.mockClear();
    
    // Trigger the enter handler
    await helpScene.middleware()(
      ctx as any,
      async () => {}
    );

    // Verify error was logged
    if (logMock.error.mock.calls.length === 0) {
      return {
        name: 'Help Scene Error Handling Test',
        success: false,
        message: 'Error was not logged'
      };
    }
    
    // Verify fallback response was sent
    if (ctx.reply.mock.calls.length === 0) {
      return {
        name: 'Help Scene Error Handling Test',
        success: false,
        message: 'Reply method was not called during error handling'
      };
    }
    
    return {
      name: 'Help Scene Error Handling Test',
      success: true,
      message: 'Help scene correctly handles errors'
    };
  } catch (error: any) {
    return {
      name: 'Help Scene Error Handling Test',
      success: false,
      message: `Test failed with error: ${error.message}`
    };
  }
}

// Run all help scene tests
export async function runHelpSceneTests(): Promise<TestResult[]> {
  console.log('Running helpScene tests...');
  
  const results: TestResult[] = [];
  
  try {
    results.push(await testEnterHelpScene());
    results.push(await testEnterHelpSceneEnglish());
    results.push(await testErrorHandling());
    
    // Log results
    let passCount = 0;
    results.forEach(result => {
      if (result.success) {
        passCount++;
        console.log(`✅ ${result.name}: ${result.message}`);
      } else {
        console.error(`❌ ${result.name}: ${result.message}`);
      }
    });
    
    console.log(`Help scene tests: ${passCount}/${results.length} passed`);
    return results;
  } catch (error: any) {
    console.error('❌ helpScene tests failed:', error);
    results.push({
      name: 'Help Scene Tests',
      success: false,
      message: `Unexpected error: ${error.message}`
    });
    return results;
  }
}

// Run tests if this file is executed directly
if (typeof require !== 'undefined' && require.main === module) {
  runHelpSceneTests()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} 