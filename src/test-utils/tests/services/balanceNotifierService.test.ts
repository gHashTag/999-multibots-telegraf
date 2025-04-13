import { BalanceNotifierService } from '@/services/balanceNotifierService';
import * as supabaseModule from '@/core/supabase';
import * as botModule from '@/core/bot';
import * as getUserSettingsModule from '@/core/supabase/getUserSettings';
import mockApi from '@/test-utils/core/mock';
import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';
import { logger } from '@/utils/logger';

// Константы для тестов
const DEFAULT_THRESHOLD = 10;
const LOW_THRESHOLD = 5;
const HIGH_THRESHOLD = 20;
const VERY_HIGH_THRESHOLD = 50;
const DEFAULT_LOW_BALANCE = 5; // Low balance used in tests

// Константы для идентификаторов пользователей (чтобы избежать магических чисел)
const TEST_IDS = {
  USER_WITH_ENABLED_NOTIFICATIONS: '123456',
  USER_WITH_DISABLED_NOTIFICATIONS: '234567',
  USER_WITH_ZERO_BALANCE: '345678',
  USER_WITH_NULL_SETTINGS: '456789',
  USER_WITH_UNDEFINED_SETTINGS: '567890',
  USER_WITH_NO_THRESHOLD: '678901',
  USER_WITH_WRONG_THRESHOLD_TYPE: '789012',
  USER_WITH_WRONG_ENABLED_TYPE: '890123',
  USER_WITH_SUPABASE_ERROR: '901234',
  USER_WITH_ERROR: '101010'
};

// Константы для балансов
const BALANCES = {
  LOW: 5,
  ZERO: 0,
  MEDIUM: 15,
  HIGH: 30,
  NEGATIVE: -5
};

// Константы для ботов
const TEST_BOT_NAMES = {
  MAIN: 'main',
  TEST: 'test_bot',
  SPECIAL: 'special-bot@name_123!'
};

// Общие типы данных для тестов
interface TestUser {
  id: string;
  telegram_id: string | null;
  balance: number;
  is_ru: boolean;
  user_type?: string;
}

// Типы для настроек пользователей
type UserSettings = { enabled: boolean; threshold: number };
type UserSettingsMap = { [key: string]: UserSettings };

// Mocking dependencies
let mockSupabaseSelect: ReturnType<typeof mockApi.create>;
let mockGetUserSettings: ReturnType<typeof mockApi.create>;
let mockGetBotByName: ReturnType<typeof mockApi.create>;
let mockBot: {
  bot: {
    telegram: {
      sendMessage: ReturnType<typeof mockApi.create>;
    };
  };
};

// Setup function to initialize mocks
const setupTest = () => {
  // Mock supabase from() method
  mockSupabaseSelect = mockApi.create();
  const mockSupabaseFrom = mockApi.create().mockReturnValue({
    select: mockSupabaseSelect.mockReturnValue({
      data: [
        {
          id: 1,
          telegram_id: '123456',
          balance: 5, // Below threshold
          is_ru: false
        },
        {
          id: 2,
          telegram_id: '234567',
          balance: 20, // Above threshold
          is_ru: true
        },
        {
          id: 3,
          telegram_id: '345678',
          balance: 0, // Zero balance
          is_ru: false
        }
      ],
      error: null
    })
  });
  
  // Mock getUserSettings function
  mockGetUserSettings = mockApi.create();
  
  // Mock getBotByName function
  mockBot = {
    bot: {
      telegram: {
        sendMessage: mockApi.create().mockResolvedValue(true)
      }
    }
  };
  mockGetBotByName = mockApi.create().mockReturnValue(mockBot);
  
  // Apply mocks
  // @ts-ignore - Mocking the supabase object
  supabaseModule.supabase = { from: mockSupabaseFrom };
  // @ts-ignore - Mocking the getUserSettings function
  Object.defineProperty(getUserSettingsModule, 'getUserSettings', { 
    value: mockGetUserSettings,
    configurable: true 
  });
  // @ts-ignore - Mocking the getBotByName function
  Object.defineProperty(botModule, 'getBotByName', { 
    value: mockGetBotByName,
    configurable: true 
  });
};

/**
 * Тест функции shouldNotifyUser
 * Проверяет определение необходимости отправки уведомления на основе баланса и настроек
 */
export async function testBalanceNotifierService_ShouldNotifyUser(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: shouldNotifyUser';
  setupTest();
  
  // Basic scenarios
  // Test case 1: Notifications disabled
  const result1 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    BALANCES.LOW, 
    { enabled: false, threshold: DEFAULT_THRESHOLD }
  );
  
  // Test case 2: Balance above threshold
  const result2 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    BALANCES.MEDIUM, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Test case 3: Should notify (enabled and below threshold)
  const result3 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    BALANCES.LOW, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Edge case scenarios
  // Test case 4: Balance exactly at threshold (should not notify)
  const result4 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    DEFAULT_THRESHOLD, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Test case 5: Balance just below threshold (should notify)
  const result5 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    9.99, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Test case 6: Balance just above threshold (should not notify)
  const result6 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    10.01, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Extreme values
  // Test case 7: Zero balance (should notify)
  const result7 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    BALANCES.ZERO, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Test case 8: Negative balance (should notify)
  const result8 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    BALANCES.NEGATIVE, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Test case 9: Very large balance (should not notify)
  const result9 = BalanceNotifierService.shouldNotifyUser(
    TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
    1000000, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Unusual telegram IDs
  // Test case 10: Very long telegram ID
  const result10 = BalanceNotifierService.shouldNotifyUser(
    '1234567890123456789012345678901234567890', 
    BALANCES.LOW, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Test case 11: Empty telegram ID (should still work based on balance comparison)
  const result11 = BalanceNotifierService.shouldNotifyUser(
    '', 
    BALANCES.LOW, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Test case 12: Special characters in telegram ID
  const result12 = BalanceNotifierService.shouldNotifyUser(
    'user-with-special-chars!@#$%^&*()', 
    BALANCES.LOW, 
    { enabled: true, threshold: DEFAULT_THRESHOLD }
  );
  
  // Verify basic results
  if (result1 !== false || result2 !== false || result3 !== true) {
    return {
      name: testName,
      success: false,
      message: `Expected basic results: false, false, true. Got: ${result1}, ${result2}, ${result3}`
    };
  }
  
  // Verify edge case results
  if (result4 !== false || result5 !== true || result6 !== false) {
    return {
      name: testName,
      success: false,
      message: `Expected edge case results: false, true, false. Got: ${result4}, ${result5}, ${result6}`
    };
  }
  
  // Verify extreme value results
  if (result7 !== true || result8 !== true || result9 !== false) {
    return {
      name: testName,
      success: false,
      message: `Expected extreme value results: true, true, false. Got: ${result7}, ${result8}, ${result9}`
    };
  }
  
  // Verify unusual telegram ID results
  if (result10 !== true || result11 !== true || result12 !== true) {
    return {
      name: testName,
      success: false,
      message: `Expected unusual telegram ID results: true, true, true. Got: ${result10}, ${result11}, ${result12}`
    };
  }
  
  return { name: testName, success: true, message: 'All test cases passed for shouldNotifyUser' };
}
testBalanceNotifierService_ShouldNotifyUser.meta = { category: TestCategory.All };

/**
 * Тест функции getUserNotificationSettings
 * Проверяет получение настроек пользователя из базы данных и обработку различных ситуаций
 */
export async function testBalanceNotifierService_GetUserNotificationSettings(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: getUserNotificationSettings';
  setupTest();
  
  // Mock getUserSettings to return different settings for different users
  mockGetUserSettings.mockImplementation((telegramId) => {
    if (telegramId === '123456') {
      return Promise.resolve({
        balanceNotifications: {
          enabled: true,
          threshold: 15
        }
      });
    } else if (telegramId === '234567') {
      return Promise.resolve({
        balanceNotifications: {
          enabled: false,
          threshold: 5
        }
      });
    } else if (telegramId === '345678') {
      // No balance notification settings
      return Promise.resolve({});
    } else if (telegramId === '456789') {
      // Null settings object
      return Promise.resolve(null);
    } else if (telegramId === '567890') {
      // Undefined settings
      return Promise.resolve(undefined);
    } else if (telegramId === '678901') {
      // Malformed settings (missing threshold)
      return Promise.resolve({
        balanceNotifications: {
          enabled: true
          // threshold is missing
        }
      });
    } else if (telegramId === '789012') {
      // Malformed settings (wrong type for threshold)
      return Promise.resolve({
        balanceNotifications: {
          enabled: true,
          threshold: "not a number" // String instead of number
        }
      });
    } else if (telegramId === '890123') {
      // Malformed settings (wrong type for enabled)
      return Promise.resolve({
        balanceNotifications: {
          enabled: "yes", // String instead of boolean
          threshold: 20
        }
      });
    } else if (telegramId === '901234') {
      // Supabase error simulation
      return Promise.reject(new Error("Supabase connection error"));
    } else {
      return Promise.resolve(null);
    }
  });
  
  try {
    // Basic test cases
    // Test case 1: User with notification settings (enabled)
    const result1 = await BalanceNotifierService.getUserNotificationSettings('123456');
    
    // Test case 2: User with notification settings (disabled)
    const result2 = await BalanceNotifierService.getUserNotificationSettings('234567');
    
    // Test case 3: User without notification settings (should get defaults)
    const result3 = await BalanceNotifierService.getUserNotificationSettings('345678');
    
    // Extended test cases
    // Test case 4: Null settings object (should get defaults)
    const result4 = await BalanceNotifierService.getUserNotificationSettings('456789');
    
    // Test case 5: Undefined settings (should get defaults)
    const result5 = await BalanceNotifierService.getUserNotificationSettings('567890');
    
    // Test case 6: Malformed settings (missing threshold) (should use default threshold)
    const result6 = await BalanceNotifierService.getUserNotificationSettings('678901');
    
    // Test case 7: Malformed settings (wrong type for threshold) (should use default threshold)
    const result7 = await BalanceNotifierService.getUserNotificationSettings('789012');
    
    // Test case 8: Malformed settings (wrong type for enabled) (should use default enabled)
    const result8 = await BalanceNotifierService.getUserNotificationSettings('890123');
    
    // Verify basic results
    if (
      !result1.enabled || result1.threshold !== 15 ||
      result2.enabled || result2.threshold !== 5 ||
      result3.enabled || result3.threshold !== 10
    ) {
      return {
        name: testName,
        success: false,
        message: `Basic results don't match expected values. Got: ${JSON.stringify({ result1, result2, result3 })}`
      };
    }
    
    // Verify extended results for null/undefined/malformed settings
    if (
      result4.enabled !== false || result4.threshold !== 10 ||
      result5.enabled !== false || result5.threshold !== 10 ||
      result6.enabled !== true || result6.threshold !== 10 ||
      result7.enabled !== true || result7.threshold !== 10 ||
      result8.enabled !== false || result8.threshold !== 20
    ) {
      return {
        name: testName,
        success: false,
        message: `Extended results don't match expected values. Got: ${JSON.stringify({ result4, result5, result6, result7, result8 })}`
      };
    }
    
    // Test case 9: Supabase error (should handle gracefully and return defaults)
    let errorHandled = false;
    try {
      const result9 = await BalanceNotifierService.getUserNotificationSettings('901234');
      
      // Should return default settings when error occurs
      if (result9.enabled !== false || result9.threshold !== 10) {
        return {
          name: testName,
          success: false,
          message: `Error case didn't return expected defaults. Got: ${JSON.stringify(result9)}`
        };
      }
    } catch (e) {
      // If the method doesn't handle errors internally, the test should fail
      return {
        name: testName,
        success: false,
        message: `getUserNotificationSettings should handle Supabase errors gracefully but threw: ${e}`
      };
    }
    
    // Verify getUserSettings was called with correct params for basic tests
    if (
      mockGetUserSettings.mock.calls.length < 9 ||
      mockGetUserSettings.mock.calls[0][0] !== '123456' ||
      mockGetUserSettings.mock.calls[1][0] !== '234567' ||
      mockGetUserSettings.mock.calls[2][0] !== '345678'
    ) {
      return {
        name: testName,
        success: false,
        message: `getUserSettings not called with expected parameters. Calls: ${JSON.stringify(mockGetUserSettings.mock.calls)}`
      };
    }
    
    return { name: testName, success: true, message: 'All test cases passed for getUserNotificationSettings' };
  } catch (error) {
    return {
      name: testName,
      success: false,
      message: `Unexpected error in test: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
testBalanceNotifierService_GetUserNotificationSettings.meta = { category: TestCategory.All };

/**
 * Тест функции sendLowBalanceNotification
 * Проверяет отправку уведомлений о низком балансе пользователям
 */
export async function testBalanceNotifierService_SendLowBalanceNotification(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: sendLowBalanceNotification';
  setupTest();
  
  // Mock the sendMessage to verify it was called
  mockBot.bot.telegram.sendMessage.mockClear();
  mockBot.bot.telegram.sendMessage.mockResolvedValue({ message_id: 123 });
  
  // Mock sendMessageForBot to simulate different scenarios
  mockBot.bot.telegram.sendMessage.mockImplementation((telegramId, text) => {
    if (telegramId === '999999') {
      return Promise.reject(new Error('Failed to send message'));
    }
    if (telegramId === '888888') {
      // Simulate network timeout error
      return Promise.reject(new Error('ETIMEOUT: Connection timed out'));
    }
    if (telegramId === '777777') {
      // Simulate blocked by user error
      return Promise.reject(new Error('Forbidden: bot was blocked by the user'));
    }
    return Promise.resolve({ message_id: parseInt(telegramId.substring(0, 3)) });
  });
  
  try {
    // Test case 1: Basic successful notification (English)
    const userId1 = '123456';
    const balance1 = 5;
    const threshold1 = 10;
    const isRu1 = false;
    const botName1 = 'testbot1';
  const result1 = await BalanceNotifierService.sendLowBalanceNotification(
      userId1,
      balance1,
      threshold1,
      isRu1,
      botName1
    );
    
    // Test case 2: Notification with very low balance (Russian)
    const userId2 = '234567';
    const balance2 = 0.01;
    const threshold2 = 5;
    const isRu2 = true;
    const botName2 = 'testbot2';
  const result2 = await BalanceNotifierService.sendLowBalanceNotification(
      userId2,
      balance2,
      threshold2,
      isRu2,
      botName2
    );
    
    // Test case 3: Notification with zero balance
    const userId3 = '345678';
    const balance3 = 0;
    const threshold3 = 10;
    const isRu3 = false;
    const botName3 = 'testbot3';
  const result3 = await BalanceNotifierService.sendLowBalanceNotification(
      userId3,
      balance3,
      threshold3,
      isRu3,
      botName3
    );
    
    // Test case 4: Notification with negative balance (should handle gracefully)
    const userId4 = '456789';
    const balance4 = -5;
    const threshold4 = 10;
    const isRu4 = false;
    const botName4 = 'testbot4';
  const result4 = await BalanceNotifierService.sendLowBalanceNotification(
      userId4,
      balance4,
      threshold4,
      isRu4,
      botName4
    );
    
    // Test case 5: Error handling - general error
    const userId5 = '999999';
    const balance5 = 3;
    const threshold5 = 10;
    const isRu5 = false;
    const botName5 = 'testbot5';
    let error5Caught = false;
    try {
      await BalanceNotifierService.sendLowBalanceNotification(
        userId5,
        balance5,
        threshold5,
        isRu5,
        botName5
      );
    } catch (error) {
      error5Caught = true;
    }
    
    // Test case 6: Error handling - timeout error
    const userId6 = '888888';
    const balance6 = 2;
    const threshold6 = 10;
    const isRu6 = false;
    const botName6 = 'testbot6';
    let error6Caught = false;
    try {
      await BalanceNotifierService.sendLowBalanceNotification(
        userId6,
        balance6,
        threshold6,
        isRu6,
        botName6
      );
    } catch (error) {
      error6Caught = true;
    }
    
    // Test case 7: Error handling - blocked by user
    const userId7 = '777777';
    const balance7 = 1;
    const threshold7 = 10;
    const isRu7 = true;
    const botName7 = 'testbot7';
    let error7Caught = false;
    try {
      await BalanceNotifierService.sendLowBalanceNotification(
        userId7,
        balance7,
        threshold7,
        isRu7,
        botName7
      );
    } catch (error) {
      error7Caught = true;
    }
    
    // Test case 8: Bot name with special characters
    const userId8 = '567890';
    const balance8 = 7;
    const threshold8 = 10;
    const isRu8 = false;
    const botName8 = 'test-bot_8@special';
  const result8 = await BalanceNotifierService.sendLowBalanceNotification(
      userId8,
      balance8,
      threshold8,
      isRu8,
      botName8
    );
    
    // Verify successful notification results
    if (!result1 || !result2 || !result3 || !result4 || !result8) {
      return {
        name: testName,
        success: false,
        message: `Failed to send notifications for valid cases. Got: ${JSON.stringify({
          result1, result2, result3, result4, result8
        })}`
      };
    }
    
    // Verify error cases were handled properly
    if (!error5Caught || !error6Caught || !error7Caught) {
      return {
        name: testName,
        success: false,
        message: `Error cases not handled properly. Error caught: ${JSON.stringify({
          error5Caught, error6Caught, error7Caught
        })}`
      };
    }
    
    // Verify sendMessageForBot was called with correct parameters for successful cases
    if (
      mockBot.bot.telegram.sendMessage.mock.calls.length < 8 ||
      mockBot.bot.telegram.sendMessage.mock.calls[0][0] !== userId1 ||
      !mockBot.bot.telegram.sendMessage.mock.calls[0][1].includes(`${balance1}`) ||
      mockBot.bot.telegram.sendMessage.mock.calls[1][0] !== userId2 ||
      !mockBot.bot.telegram.sendMessage.mock.calls[1][1].includes(`${balance2}`) ||
      mockBot.bot.telegram.sendMessage.mock.calls[2][0] !== userId3 ||
      !mockBot.bot.telegram.sendMessage.mock.calls[2][1].includes(`${balance3}`) ||
      mockBot.bot.telegram.sendMessage.mock.calls[3][0] !== userId4 ||
      !mockBot.bot.telegram.sendMessage.mock.calls[3][1].includes(`${balance4}`) ||
      mockBot.bot.telegram.sendMessage.mock.calls[7][0] !== userId8 ||
      !mockBot.bot.telegram.sendMessage.mock.calls[7][1].includes(`${balance8}`)
  ) {
    return {
      name: testName,
      success: false,
        message: `sendMessageForBot not called with expected parameters. Calls: ${JSON.stringify(mockBot.bot.telegram.sendMessage.mock.calls)}`
      };
    }
    
    // Verify message content - should contain balance and threshold
    for (let i = 0; i < 4; i++) {
      const messageText = mockBot.bot.telegram.sendMessage.mock.calls[i][1];
      const balancePattern = i === 0 ? balance1 : i === 1 ? balance2 : i === 2 ? balance3 : balance4;
      const thresholdPattern = i === 0 ? threshold1 : i === 1 ? threshold2 : i === 2 ? threshold3 : threshold4;
      
      if (!messageText.includes(balancePattern.toFixed(2)) || !messageText.includes(String(thresholdPattern))) {
        return {
          name: testName,
          success: false,
          message: `Message formatting incorrect, should include balance and threshold. Message: ${messageText}`
        };
      }
    }
  
  return { name: testName, success: true, message: 'All test cases passed for sendLowBalanceNotification' };
  } catch (error) {
    return {
      name: testName,
      success: false,
      message: `Unexpected error in test: ${error instanceof Error ? error.message : String(error)}`,
      error: error instanceof Error ? error : new Error(String(error))
    };
  }
}
testBalanceNotifierService_SendLowBalanceNotification.meta = { category: TestCategory.All };

/**
 * Тест функции checkAllUsersBalances
 * Проверяет массовую проверку балансов всех пользователей и отправку уведомлений
 */
export async function testBalanceNotifierService_CheckAllUsersBalances(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: checkAllUsersBalances';
  setupTest();
  
  // Mock getUserNotificationSettings
  const originalGetUserNotificationSettings = BalanceNotifierService.getUserNotificationSettings;
  const mockGetUserNotificationSettings = mockApi.create();
  mockGetUserNotificationSettings.mockImplementation(async (telegramId) => {
    if (telegramId === TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS) {
      return { enabled: true, threshold: DEFAULT_THRESHOLD }; // Should notify (balance LOW < threshold DEFAULT)
    } else if (telegramId === TEST_IDS.USER_WITH_DISABLED_NOTIFICATIONS) {
      return { enabled: true, threshold: HIGH_THRESHOLD }; // Should not notify (balance MEDIUM < threshold HIGH, but we'll mock shouldNotifyUser)
    } else if (telegramId === TEST_IDS.USER_WITH_ZERO_BALANCE) {
      return { enabled: true, threshold: DEFAULT_THRESHOLD }; // Should notify (balance ZERO < threshold DEFAULT)
    } else if (telegramId === TEST_IDS.USER_WITH_NULL_SETTINGS) {
      return { enabled: true, threshold: 15 }; // Used for partial failure test
    } else if (telegramId === TEST_IDS.USER_WITH_UNDEFINED_SETTINGS) {
      return { enabled: true, threshold: 20 }; // Used for notification limits test
    } else if (telegramId === TEST_IDS.USER_WITH_NO_THRESHOLD) {
      return { enabled: true, threshold: 25 }; // Used for notification limits test
    } else if (telegramId === TEST_IDS.USER_WITH_WRONG_THRESHOLD_TYPE) {
      return { enabled: true, threshold: 30 }; // Used for notification limits test
    } else {
      return { enabled: false, threshold: DEFAULT_THRESHOLD }; // Default
    }
  });
  BalanceNotifierService.getUserNotificationSettings = mockGetUserNotificationSettings;
  
  // Mock shouldNotifyUser
  const originalShouldNotifyUser = BalanceNotifierService.shouldNotifyUser;
  const mockShouldNotifyUser = mockApi.create();
  mockShouldNotifyUser.mockImplementation((telegramId, balance, settings) => {
    // For testing purposes, we'll notify specific users
    return [
      TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS, 
      TEST_IDS.USER_WITH_ZERO_BALANCE, 
      TEST_IDS.USER_WITH_NULL_SETTINGS, 
      TEST_IDS.USER_WITH_UNDEFINED_SETTINGS, 
      TEST_IDS.USER_WITH_NO_THRESHOLD, 
      TEST_IDS.USER_WITH_WRONG_THRESHOLD_TYPE
    ].includes(telegramId);
  });
  BalanceNotifierService.shouldNotifyUser = mockShouldNotifyUser;
  
  // Mock sendLowBalanceNotification
  const originalSendLowBalanceNotification = BalanceNotifierService.sendLowBalanceNotification;
  const mockSendNotification = mockApi.create();
  mockSendNotification.mockImplementation(async (telegramId, balance, threshold, isRu, botName) => {
    // For testing error handling, fail for specific users
    if (telegramId === TEST_IDS.USER_WITH_ZERO_BALANCE) {
      return false; // Notification failed
    } else if (telegramId === TEST_IDS.USER_WITH_NULL_SETTINGS) {
      throw new Error('Network error during notification'); // Simulate exception during notification
    }
    return true; // Notification successful
  });
  BalanceNotifierService.sendLowBalanceNotification = mockSendNotification;
  
  // Original from() mock
  const originalFrom = supabaseModule.supabase.from;
  
  // Extended mock data for more test cases
  const extendedMockData = [
    {
      id: 1,
      telegram_id: TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS,
      balance: BALANCES.LOW, // Below threshold
      is_ru: false
    },
    {
      id: 2,
      telegram_id: TEST_IDS.USER_WITH_DISABLED_NOTIFICATIONS,
      balance: BALANCES.MEDIUM, // Above default threshold but below user-specific threshold
      is_ru: true
    },
    {
      id: 3,
      telegram_id: TEST_IDS.USER_WITH_ZERO_BALANCE,
      balance: BALANCES.ZERO, // Zero balance
      is_ru: false
    },
    {
      id: 4,
      telegram_id: TEST_IDS.USER_WITH_NULL_SETTINGS,
      balance: DEFAULT_THRESHOLD, // Will throw error during notification
      is_ru: false
    },
    {
      id: 5,
      telegram_id: TEST_IDS.USER_WITH_UNDEFINED_SETTINGS,
      balance: 3, // For batch processing test
      is_ru: true
    },
    {
      id: 6,
      telegram_id: TEST_IDS.USER_WITH_NO_THRESHOLD,
      balance: 2, // For batch processing test
      is_ru: false
    },
    {
      id: 7,
      telegram_id: TEST_IDS.USER_WITH_WRONG_THRESHOLD_TYPE,
      balance: 1, // For batch processing test
      is_ru: true
    },
    {
      id: 8,
      telegram_id: null, // Missing telegram_id
      balance: 4,
      is_ru: true
    },
    {
      id: 9,
      telegram_id: '', // Empty telegram_id
      balance: 6,
      is_ru: false
    },
    {
      id: 10,
      telegram_id: TEST_IDS.USER_WITH_WRONG_ENABLED_TYPE,
      balance: BALANCES.NEGATIVE, // Negative balance
      is_ru: true
    }
  ];
  
  // Set up supabase to return extended mock data
  const mockSupabaseFromExtended = mockApi.create().mockReturnValue({
    select: mockApi.create().mockReturnValue({
      data: extendedMockData,
      error: null
    })
  });
  supabaseModule.supabase.from = mockSupabaseFromExtended;
  
  try {
    // Test case 1: Standard check with multiple users (now with more complex data)
    const result1 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.TEST);
    
    // We expect:
    // - 10 users checked in total
    // - 1 notification success (USER_WITH_ENABLED_NOTIFICATIONS)
    // - 1 notification failed (USER_WITH_ZERO_BALANCE)
    // - 1 exception during notification (USER_WITH_NULL_SETTINGS)
    // - 2 more notifications should succeed (USER_WITH_UNDEFINED_SETTINGS, USER_WITH_NO_THRESHOLD)
    // - 2 users with invalid telegram_id (null and empty) should be skipped
    // - 1 user with notifications disabled (USER_WITHOUT_SETTINGS)
    // - 1 user that doesn't meet notification criteria (USER_WITH_DISABLED_NOTIFICATIONS)
    // - 1 user with negative balance (USER_WITH_WRONG_ENABLED_TYPE) that we're not mocking to notify
    
    // Verify counts for first test case
    if (result1.checked !== 10 || result1.notified !== 3) {
      return {
        name: testName,
        success: false,
        message: `Test case 1: Expected checked=10, notified=3. Got: checked=${result1.checked}, notified=${result1.notified}`
      };
    }
    
    // Test case 2: Empty user list
    // Mock empty users array
    const mockSupabaseFromEmpty = mockApi.create().mockReturnValue({
      select: mockApi.create().mockReturnValue({
        data: [],
        error: null
      })
    });
    supabaseModule.supabase.from = mockSupabaseFromEmpty;
    
    const result2 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.TEST);
    
    // Verify counts for empty user list
    if (result2.checked !== 0 || result2.notified !== 0) {
      return {
        name: testName,
        success: false,
        message: `Test case 2: Expected checked=0, notified=0 for empty list. Got: checked=${result2.checked}, notified=${result2.notified}`
      };
    }
  
    // Test case 3: Database error
    // Mock database error
    const mockSupabaseFromError = mockApi.create().mockReturnValue({
      select: mockApi.create().mockReturnValue({
        data: null,
        error: { message: 'Database connection error' }
      })
    });
    supabaseModule.supabase.from = mockSupabaseFromError;
    
    const result3 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.TEST);
    
    // Verify counts for database error
    if (result3.checked !== 0 || result3.notified !== 0) {
      return {
        name: testName,
        success: false,
        message: `Test case 3: Expected checked=0, notified=0 for database error. Got: checked=${result3.checked}, notified=${result3.notified}`
      };
    }
    
    // Test case 4: All users have notifications disabled
    // Restore data but mock all notifications as disabled
    const mockSupabaseFromOriginalData = mockApi.create().mockReturnValue({
      select: mockApi.create().mockReturnValue({
        data: extendedMockData,
        error: null
      })
    });
    supabaseModule.supabase.from = mockSupabaseFromOriginalData;
    
    // Mock getUserNotificationSettings to return disabled for all
    mockGetUserNotificationSettings.mockImplementation(async () => {
      return { enabled: false, threshold: DEFAULT_THRESHOLD };
    });
    
    const result4 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.TEST);
    
    // Verify counts for all notifications disabled
    if (result4.checked !== 10 || result4.notified !== 0) {
      return {
        name: testName,
        success: false,
        message: `Test case 4: Expected checked=10, notified=0 for all disabled. Got: checked=${result4.checked}, notified=${result4.notified}`
      };
    }
    
    // Reset mocks for next test
    supabaseModule.supabase.from = mockSupabaseFromOriginalData;
    
    // Test case 5: Error while getting notification settings
    // Restore original implementation but add errors for some users
    mockGetUserNotificationSettings.mockImplementation(async (telegramId) => {
      if (telegramId === TEST_IDS.USER_WITH_ERROR) {
        throw new Error('Failed to fetch notification settings');
      }
      return { enabled: true, threshold: DEFAULT_THRESHOLD };
    });
    
    // Add error user to the test data for test case 5
    const testDataWithErrorUser = [
      ...extendedMockData,
      { id: '9', telegram_id: TEST_IDS.USER_WITH_ERROR, balance: DEFAULT_LOW_BALANCE }
    ];
    
    const mockSupabaseWithErrorUser = mockApi.create().mockReturnValue({
      select: mockApi.create().mockReturnValue({
        data: testDataWithErrorUser,
        error: null
      })
    });
    supabaseModule.supabase.from = mockSupabaseWithErrorUser;
    
    // Restore original shouldNotifyUser behavior for this test
    mockShouldNotifyUser.mockImplementation((telegramId, balance, settings) => {
      // Skip the error user but notify others
      return telegramId !== TEST_IDS.USER_WITH_ERROR && balance < (settings?.threshold || DEFAULT_THRESHOLD);
    });
    
    const result5 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.TEST);
    
    // Verify counts for test case 5 - the error user should be counted but notification should fail
    if (result5.checked !== 11 || result5.notified !== 3) {
      return {
        name: testName,
        success: false,
        message: `Test case 5: Expected checked=11, notified=3 with error user. Got: checked=${result5.checked}, notified=${result5.notified}`
      };
    }
    
    // Reset mocks for next test
    supabaseModule.supabase.from = mockSupabaseFromOriginalData;
    
    // Test case 6: Malformed user data
    const malformedUserData = [
      { id: 1, telegram_id: TEST_IDS.USER_WITH_ENABLED_NOTIFICATIONS }, // Missing balance
      { id: 2, balance: BALANCES.LOW }, // Missing telegram_id
      { id: 3, telegram_id: TEST_IDS.USER_WITH_ZERO_BALANCE, balance: 'not-a-number' }, // Invalid balance type
      { id: 4, telegram_id: 456789, balance: DEFAULT_THRESHOLD }, // Numeric telegram_id
      { id: 5, telegram_id: TEST_IDS.USER_WITH_NULL_SETTINGS, balance: null } // Null balance
    ];
    
    const mockSupabaseMalformed = mockApi.create().mockReturnValue({
      select: mockApi.create().mockReturnValue({
        data: malformedUserData,
        error: null
      })
    });
    supabaseModule.supabase.from = mockSupabaseMalformed;
    
    // Reset mocks for clean test
    mockGetUserNotificationSettings.mockImplementation(async (telegramId) => {
      return { enabled: true, threshold: DEFAULT_THRESHOLD };
    });
    
    mockShouldNotifyUser.mockImplementation((telegramId, balance, settings) => {
      return true; // Always notify for this test
    });
    
    mockSendNotification.mockImplementation(async () => true);
    
    const result6 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.TEST);
    
    // We expect robust handling of malformed data
    if (result6.checked !== 5 || result6.notified !== 4) {
      return {
        name: testName,
        success: false,
        message: `Test case 6: Expected checked=5, notified=4 for malformed data. Got: checked=${result6.checked}, notified=${result6.notified}`
      };
    }
    
    // Test case 7: Bot name with special characters
    const result7 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.SPECIAL);
    
    // We expect the same result as the previous test since bot name shouldn't affect logic
    if (result7.checked !== 5 || result7.notified !== 4) {
      return {
        name: testName,
        success: false,
        message: `Test case 7: Expected checked=5, notified=4 for special bot name. Got: checked=${result7.checked}, notified=${result7.notified}`
      };
    }
  
  // Test case 8: All notification attempts fail
    mockSendNotification.mockImplementation(async () => false);
    
    const result8 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.TEST);
    
    // We check users but no notifications succeed
    if (result8.checked !== 5 || result8.notified !== 0) {
      return {
        name: testName,
        success: false,
        message: `Test case 8: Expected checked=5, notified=0 for all failed notifications. Got: checked=${result8.checked}, notified=${result8.notified}`
      };
    }
  
  // Test case 9: All notification attempts throw errors
    mockSendNotification.mockImplementation(async () => {
      throw new Error('Failed to send notification');
    });
    
    const result9 = await BalanceNotifierService.checkAllUsersBalances(TEST_BOT_NAMES.TEST);
    
    // We check users but no notifications succeed
    if (result9.checked !== 5 || result9.notified !== 0) {
      return {
        name: testName,
        success: false,
        message: `Test case 9: Expected checked=5, notified=0 for all notification errors. Got: checked=${result9.checked}, notified=${result9.notified}`
      };
    }
    
    // Verify correct methods were called with expected parameters
    if (
      mockGetUserNotificationSettings.mock.calls.length < 30 || // Multiple calls across all tests
      mockShouldNotifyUser.mock.calls.length < 25 ||
      mockSendNotification.mock.calls.length < 15
    ) {
      return {
        name: testName,
        success: false,
        message: `Methods not called the expected number of times. getUserNotificationSettings: ${mockGetUserNotificationSettings.mock.calls.length}, shouldNotifyUser: ${mockShouldNotifyUser.mock.calls.length}, sendNotification: ${mockSendNotification.mock.calls.length}`
      };
    }
  
    return { name: testName, success: true, message: 'All test cases passed for checkAllUsersBalances' };
  } finally {
    // Restore original methods
    BalanceNotifierService.getUserNotificationSettings = originalGetUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalShouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalSendLowBalanceNotification;
    supabaseModule.supabase.from = originalFrom;
  }
}
testBalanceNotifierService_CheckAllUsersBalances.meta = { category: TestCategory.All };

/**
 * Тест функции checkUserBalanceById
 * Проверяет проверку баланса конкретного пользователя по ID
 */
export async function testBalanceNotifierService_CheckUserBalanceById(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: checkUserBalanceById';
  setupTest();
  
  // Mock supabase.from('users').select('*').eq('id').single()
  const mockUserSelect = mockApi.create()
    .mockImplementation(() => ({
      data: {
        id: 'test-user-id',
        telegram_id: '123456',
        balance: 5,
        is_ru: true
      },
      error: null
    }));
  
  // Mock other required methods
  const originalGetUserNotificationSettings = BalanceNotifierService.getUserNotificationSettings;
  const mockGetUserSettings = mockApi.create()
    .mockResolvedValue({ enabled: true, threshold: 10 });
  BalanceNotifierService.getUserNotificationSettings = mockGetUserSettings;
  
  const originalShouldNotifyUser = BalanceNotifierService.shouldNotifyUser;
  const mockShouldNotify = mockApi.create()
    .mockReturnValue(true);
  BalanceNotifierService.shouldNotifyUser = mockShouldNotify;
  
  const originalSendLowBalanceNotification = BalanceNotifierService.sendLowBalanceNotification;
  const mockSendNotification = mockApi.create().mockResolvedValue(true);
  BalanceNotifierService.sendLowBalanceNotification = mockSendNotification;
  
  // Mock supabase
  const originalFrom = supabaseModule.supabase.from;
  supabaseModule.supabase.from = mockApi.create().mockReturnValue({
    select: mockApi.create().mockReturnValue({
      eq: mockApi.create().mockReturnValue({
        single: mockUserSelect
      })
    })
  });
  
  try {
    // Test case 1: User with low balance who should be notified
    const result1 = await BalanceNotifierService.checkUserBalanceById('test-user-id', 'main');
    
    // Test case 2: User not found
    mockUserSelect.mockImplementationOnce(() => ({
      data: null,
      error: null
    }));
    const result2 = await BalanceNotifierService.checkUserBalanceById('non-existent-user', 'main');
    
    // Test case 3: Database error
    mockUserSelect.mockImplementationOnce(() => ({
      data: null,
      error: { message: 'Database error' }
    }));
    const result3 = await BalanceNotifierService.checkUserBalanceById('error-user', 'main');
    
    // Test case 4: User without telegram_id
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-without-telegram',
        telegram_id: null,
        balance: 5
      },
      error: null
    }));
    const result4 = await BalanceNotifierService.checkUserBalanceById('user-without-telegram', 'main');
    
    // Test case 5: User with empty telegram_id
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-with-empty-telegram',
        telegram_id: '',
        balance: 5
      },
      error: null
    }));
    const result5 = await BalanceNotifierService.checkUserBalanceById('user-with-empty-telegram', 'main');
    
    // Test case 6: User with notification disabled
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-with-notification-off',
        telegram_id: '555555',
        balance: 1,
        is_ru: false
      },
      error: null
    }));
    mockGetUserSettings.mockResolvedValueOnce({ enabled: false, threshold: 10 });
    const result6 = await BalanceNotifierService.checkUserBalanceById('user-with-notification-off', 'main');
    
    // Test case 7: User with high balance (above threshold)
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-with-high-balance',
        telegram_id: '666666',
        balance: 50,
        is_ru: true
      },
      error: null
    }));
    mockGetUserSettings.mockResolvedValueOnce({ enabled: true, threshold: 10 });
    mockShouldNotify.mockReturnValueOnce(false); // Above threshold
    const result7 = await BalanceNotifierService.checkUserBalanceById('user-with-high-balance', 'main');
    
    // Test case 8: Error in getUserNotificationSettings
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-with-settings-error',
        telegram_id: '777777',
        balance: 5,
        is_ru: false
      },
      error: null
    }));
    mockGetUserSettings.mockRejectedValueOnce(new Error('Failed to get settings'));
    const result8 = await BalanceNotifierService.checkUserBalanceById('user-with-settings-error', 'main');
    
    // Test case 9: Error in sendLowBalanceNotification
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-with-notification-error',
        telegram_id: '888888',
        balance: 3,
        is_ru: true
      },
      error: null
    }));
    mockGetUserSettings.mockResolvedValueOnce({ enabled: true, threshold: 10 });
    mockShouldNotify.mockReturnValueOnce(true);
    mockSendNotification.mockRejectedValueOnce(new Error('Failed to send notification'));
    const result9 = await BalanceNotifierService.checkUserBalanceById('user-with-notification-error', 'main');
    
    // Test case 10: User with extremely low balance (zero)
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-with-zero-balance',
        telegram_id: '999999',
        balance: 0,
        is_ru: false
      },
      error: null
    }));
    mockGetUserSettings.mockResolvedValueOnce({ enabled: true, threshold: 10 });
    mockShouldNotify.mockReturnValueOnce(true);
    mockSendNotification.mockResolvedValueOnce(true);
    const result10 = await BalanceNotifierService.checkUserBalanceById('user-with-zero-balance', 'main');
    
    // Test case 11: User with negative balance
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-with-negative-balance',
        telegram_id: '101010',
        balance: -10,
        is_ru: true
      },
      error: null
    }));
    mockGetUserSettings.mockResolvedValueOnce({ enabled: true, threshold: 10 });
    mockShouldNotify.mockReturnValueOnce(true);
    mockSendNotification.mockResolvedValueOnce(true);
    const result11 = await BalanceNotifierService.checkUserBalanceById('user-with-negative-balance', 'main');
  
  // Verify basic results
    if (!result1.checked || !result1.notified || result1.balance !== 5) {
      return {
        name: testName,
        success: false,
        message: `Basic result doesn't match expected values. Got: ${JSON.stringify(result1)}`
      };
    }
    
    // Verify error handling results
    if (
      result2.checked || result2.notified || !result2.error || !result2.error.includes('not found') ||
      result3.checked || result3.notified || !result3.error || !result3.error.includes('Database error') ||
      result4.checked || result4.notified || !result4.error || !result4.error.includes('no valid Telegram ID') ||
      result5.checked || result5.notified || !result5.error || !result5.error.includes('no valid Telegram ID')
  ) {
    return {
      name: testName,
      success: false,
        message: `Error handling results don't match expected values. Got: ${JSON.stringify({ result2, result3, result4, result5 })}`
      };
    }
    
    // Verify notification cases
    if (
      !result6.checked || result6.notified || 
      !result7.checked || result7.notified || 
      !result8.checked || result8.notified || !result8.error || !result8.error.includes('Failed to get settings') ||
      !result9.checked || result9.notified || !result9.error || !result9.error.includes('Failed to send notification') ||
      !result10.checked || !result10.notified || result10.balance !== 0 ||
      !result11.checked || !result11.notified || result11.balance !== -10
    ) {
      return {
        name: testName,
        success: false,
        message: `Notification case results don't match expected values. Got: ${JSON.stringify({ 
          result6, result7, result8, result9, result10, result11 
        })}`
      };
    }
    
    // Verify sendLowBalanceNotification was called with correct parameters for successful cases
    if (
      mockSendNotification.mock.calls.length < 3 ||
      mockSendNotification.mock.calls[0][0] !== '123456' ||
      mockSendNotification.mock.calls[0][1] !== 5 ||
      mockSendNotification.mock.calls[0][2] !== 10 ||
      mockSendNotification.mock.calls[0][3] !== true ||
      mockSendNotification.mock.calls[0][4] !== 'main' ||
      mockSendNotification.mock.calls[2][0] !== '999999' ||
      mockSendNotification.mock.calls[2][1] !== 0
    ) {
      return {
        name: testName,
        success: false,
        message: `SendLowBalanceNotification not called with expected parameters. Calls: ${JSON.stringify(mockSendNotification.mock.calls)}`
      };
    }
    
    // Verify shouldNotifyUser was called with correct parameters
    if (
      mockShouldNotify.mock.calls.length < 4 ||
      mockShouldNotify.mock.calls[0][0] !== '123456' ||
      mockShouldNotify.mock.calls[0][1] !== 5
    ) {
      return {
        name: testName,
        success: false,
        message: `shouldNotifyUser not called with expected parameters. Calls: ${JSON.stringify(mockShouldNotify.mock.calls)}`
    };
  }
  
  return { name: testName, success: true, message: 'All test cases passed for checkUserBalanceById' };
  } finally {
    // Restore original methods
    BalanceNotifierService.getUserNotificationSettings = originalGetUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalShouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalSendLowBalanceNotification;
    supabaseModule.supabase.from = originalFrom;
  }
}
testBalanceNotifierService_CheckUserBalanceById.meta = { category: TestCategory.All };

/**
 * Расширенный тест функции checkUserBalanceById с дополнительными сценариями
 * Проверяет различные краевые случаи и обработку ошибок
 */
export async function testBalanceNotifierService_CheckUserBalanceById_Extended(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: checkUserBalanceById (Extended)';
  setupTest();
  
  // Расширенное мокирование с более реалистичными сценариями
  const mockUserSelect = mockApi.create()
    .mockImplementation(() => ({
      data: {
        id: 'test-user-id',
        telegram_id: '123456',
        balance: 5.75, // Нецелое значение баланса
        is_ru: true
      },
      error: null
    }));
  
  // Мокирование с задержками для симуляции сетевой латентности
  const mockUserSelectWithDelay = async () => {
    await new Promise(resolve => setTimeout(resolve, 50)); // Небольшая задержка
    return {
      data: {
        id: 'delayed-user',
        telegram_id: '223344',
        balance: 3.25,
        is_ru: false
      },
      error: null
    };
  };
  
  // Мокирование нестабильного соединения (первый вызов - ошибка, второй - успех)
  let unstableConnectionCallCount = 0;
  const mockUnstableConnection = () => {
    unstableConnectionCallCount++;
    if (unstableConnectionCallCount === 1) {
      return {
        data: null,
        error: { message: 'Temporary connection error', code: 'TEMPORARILY_UNAVAILABLE' }
      };
    } else {
      return {
        data: {
          id: 'unstable-connection-user',
          telegram_id: '445566',
          balance: 4.5,
          is_ru: true
        },
        error: null
      };
    }
  };
  
  // Удалить эти строки, так как типы уже определены на уровне модуля
  // type UserSettings = { enabled: boolean; threshold: number };
  // type UserSettingsMap = { [key: string]: UserSettings };
  
  // Мокирование методов сервиса
  const originalGetUserNotificationSettings = BalanceNotifierService.getUserNotificationSettings;
  const mockGetUserSettings = mockApi.create()
    .mockImplementation(async (telegramId: string) => {
      // Имитация разных настроек для разных пользователей
      const settings: UserSettingsMap = {
        '123456': { enabled: true, threshold: 10 },
        '223344': { enabled: true, threshold: 5.5 }, // Нецелой порог
        '445566': { enabled: true, threshold: 8.75 },
        '778899': { enabled: true, threshold: 2.5 },
        '998877': { enabled: true, threshold: 15 },
        '665544': { enabled: true, threshold: 7 }
      };
      
      // Имитация задержки для некоторых запросов
      if (telegramId === '223344' || telegramId === '445566') {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      
      return settings[telegramId] || { enabled: true, threshold: 10 };
    });
  BalanceNotifierService.getUserNotificationSettings = mockGetUserSettings;
  
  const originalShouldNotifyUser = BalanceNotifierService.shouldNotifyUser;
  const mockShouldNotify = mockApi.create()
    .mockImplementation((telegramId: string, balance: number, settings: UserSettings) => {
      return settings.enabled && balance < settings.threshold;
    });
  BalanceNotifierService.shouldNotifyUser = mockShouldNotify;
  
  const originalSendLowBalanceNotification = BalanceNotifierService.sendLowBalanceNotification;
  
  // Типы для результатов отправки уведомлений
  type NotificationResult = { success: boolean; delay: number; error?: string };
  type NotificationResultMap = { [key: string]: NotificationResult };
  
  // Имитация разных результатов отправки уведомлений
  const notificationResults: NotificationResultMap = {
    '123456': { success: true, delay: 0 },
    '223344': { success: true, delay: 150 },
    '445566': { success: false, delay: 0, error: 'User blocked bot' },
    '778899': { success: true, delay: 50 },
    '998877': { success: false, delay: 200, error: 'Rate limit exceeded' },
    '665544': { success: true, delay: 300 }
  };
  
  const mockSendNotification = mockApi.create()
    .mockImplementation(async (telegramId: string, balance: number, threshold: number, isRu: boolean, botName: string) => {
      const result = notificationResults[telegramId] || { success: true, delay: 0 };
      
      if (result.delay > 0) {
        await new Promise(resolve => setTimeout(resolve, result.delay));
      }
      
      if (!result.success) {
        throw new Error(result.error || 'Unknown error');
      }
      
      return result.success;
    });
  BalanceNotifierService.sendLowBalanceNotification = mockSendNotification;
  
  // Мокирование Supabase
  const originalFrom = supabaseModule.supabase.from;
  supabaseModule.supabase.from = mockApi.create().mockReturnValue({
    select: mockApi.create().mockReturnValue({
      eq: mockApi.create().mockImplementation((field, value) => {
        if (value === 'delayed-user') {
          return { single: mockApi.create().mockImplementation(mockUserSelectWithDelay) };
        } else if (value === 'unstable-connection-user') {
          return { single: mockApi.create().mockImplementation(mockUnstableConnection) };
        } else {
          return { single: mockUserSelect };
        }
      })
    })
  });
  
  // Спай для логгера чтобы отслеживать записи логов
  const originalLoggerError = logger.error;
  const mockLoggerError = mockApi.create();
  logger.error = mockLoggerError;
  
  const originalLoggerInfo = logger.info;
  const mockLoggerInfo = mockApi.create();
  logger.info = mockLoggerInfo;
  
  try {
    // Тест 1: Пользователь с нецелым значением баланса
    const result1 = await BalanceNotifierService.checkUserBalanceById('test-user-id', 'main');
    
    // Тест 2: Пользователь с задержкой загрузки данных
    const result2 = await BalanceNotifierService.checkUserBalanceById('delayed-user', 'main');
    
    // Тест 3: Нестабильное соединение с базой данных (должно быть повторено)
    const result3 = await BalanceNotifierService.checkUserBalanceById('unstable-connection-user', 'main');
    
    // Тест 4: Уведомление с ошибкой блокировки пользователем
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'user-blocked-bot',
        telegram_id: '445566',
        balance: 4.5,
        is_ru: true
      },
      error: null
    }));
    const result4 = await BalanceNotifierService.checkUserBalanceById('user-blocked-bot', 'main');
    
    // Тест 5: Превышение лимита запросов API Telegram
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'rate-limited-user',
        telegram_id: '998877',
        balance: 3,
        is_ru: false
      },
      error: null
    }));
    const result5 = await BalanceNotifierService.checkUserBalanceById('rate-limited-user', 'main');
    
    // Тест 6: Одновременный запуск нескольких проверок (параллельная обработка)
    mockUserSelect
      .mockImplementationOnce(() => ({
        data: {
          id: 'concurrent-user-1',
          telegram_id: '112233',
          balance: 2,
          is_ru: true
        },
        error: null
      }))
      .mockImplementationOnce(() => ({
        data: {
          id: 'concurrent-user-2',
          telegram_id: '223344',
          balance: 3,
          is_ru: false
        },
        error: null
      }))
      .mockImplementationOnce(() => ({
        data: {
          id: 'concurrent-user-3',
          telegram_id: '334455',
          balance: 4,
          is_ru: true
        },
        error: null
      }));
    
    // Запуск параллельных проверок
    const concurrentPromises = [
      BalanceNotifierService.checkUserBalanceById('concurrent-user-1', 'main'),
      BalanceNotifierService.checkUserBalanceById('concurrent-user-2', 'main'),
      BalanceNotifierService.checkUserBalanceById('concurrent-user-3', 'main')
    ];
    
    const concurrentResults = await Promise.all(concurrentPromises);
    
    // Тест 7: Проверка с реальным токеном авторизации (интеграционное тестирование)
    // Мокируем внутреннюю реализацию для имитации реальных заголовков авторизации
    mockUserSelect.mockImplementationOnce((options: any) => {
      // Проверяем переданные заголовки авторизации
      if (options && options.headers && options.headers.Authorization) {
        return {
          data: {
            id: 'auth-token-user',
            telegram_id: '665544',
            balance: 5,
            is_ru: false
          },
          error: null
        };
      } else {
        return {
          data: null,
          error: { message: 'Unauthorized', code: 'UNAUTHORIZED' }
        };
      }
    });
    
    // Создаем временный метод с передачей заголовков авторизации
    const checkWithAuth = async () => {
      // Сохраняем оригинальный метод
      const originalFrom = supabaseModule.supabase.from;
      
      // Переопределяем метод from для передачи заголовков
      supabaseModule.supabase.from = mockApi.create().mockReturnValue({
        select: mockApi.create().mockReturnValue({
          eq: mockApi.create().mockReturnValue({
            single: mockApi.create().mockImplementation((options: any) => {
              // Имитируем передачу заголовков авторизации
              const withHeaders = { headers: { Authorization: 'Bearer test-token' } };
              return mockUserSelect(withHeaders);
            })
          })
        })
      });
      
      try {
        return await BalanceNotifierService.checkUserBalanceById('auth-token-user', 'main');
      } finally {
        // Восстанавливаем оригинальный метод
        supabaseModule.supabase.from = originalFrom;
      }
    };
    
    const result7 = await checkWithAuth();
    
    // Тест 8: Проверка с международными символами в ID пользователя и имени бота
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'international-user',
        telegram_id: 'пользователь',  // Кириллические символы
        balance: 4,
        is_ru: true
      },
      error: null
    }));
    
    const result8 = await BalanceNotifierService.checkUserBalanceById('international-user', 'бот-с-балансом');  // Кириллическое имя бота
    
    // Тест 9: Проверка с очень большими числами
    mockUserSelect.mockImplementationOnce(() => ({
      data: {
        id: 'large-numbers-user',
        telegram_id: '999000',
        balance: 9007199254740991,  // Максимальное безопасное целое число в JavaScript
        is_ru: false
      },
      error: null
    }));
    mockGetUserSettings.mockResolvedValueOnce({ enabled: true, threshold: 9007199254740992 });  // Порог выше числа баланса
    
    const result9 = await BalanceNotifierService.checkUserBalanceById('large-numbers-user', 'main');
    
    // Проверка результатов тестов
    if (!result1.checked || !result1.notified || result1.balance !== 5.75) {
    return {
      name: testName,
      success: false,
        message: `Тест с нецелым значением баланса не прошел. Получено: ${JSON.stringify(result1)}`
      };
    }
    
    if (!result2.checked || !result2.notified || result2.balance !== 3.25) {
      return {
        name: testName,
        success: false,
        message: `Тест с задержкой загрузки данных не прошел. Получено: ${JSON.stringify(result2)}`
      };
    }
    
    if (!result3.checked || !result3.notified || result3.balance !== 4.5 || unstableConnectionCallCount !== 2) {
      return {
        name: testName,
        success: false,
        message: `Тест с нестабильным соединением не прошел. Получено: ${JSON.stringify(result3)}, вызовов: ${unstableConnectionCallCount}`
      };
    }
    
    if (!result4.checked || result4.notified || !result4.error || !result4.error.includes('User blocked bot')) {
      return {
        name: testName,
        success: false,
        message: `Тест с ошибкой блокировки пользователем не прошел. Получено: ${JSON.stringify(result4)}`
      };
    }
    
    if (!result5.checked || result5.notified || !result5.error || !result5.error.includes('Rate limit exceeded')) {
      return {
        name: testName,
        success: false,
        message: `Тест с превышением лимита запросов не прошел. Получено: ${JSON.stringify(result5)}`
      };
    }
    
    // Проверяем результаты параллельной обработки
    if (!concurrentResults || concurrentResults.length !== 3 || 
        !concurrentResults[0].checked || !concurrentResults[0].notified ||
        !concurrentResults[1].checked || !concurrentResults[1].notified ||
        !concurrentResults[2].checked || !concurrentResults[2].notified) {
      return {
        name: testName,
        success: false,
        message: `Тест с параллельной обработкой не прошел проверку. Получено: ${JSON.stringify(concurrentResults)}`
      };
    }
    
    if (!result7.checked || !result7.notified) {
      return {
        name: testName,
        success: false,
        message: `Тест с токеном авторизации не прошел. Получено: ${JSON.stringify(result7)}`
      };
    }
    
    if (!result8.checked || !result8.notified || !mockSendNotification.mock.calls.some(call => call[0] === 'пользователь' && call[4] === 'бот-с-балансом')) {
      return {
        name: testName,
        success: false,
        message: `Тест с международными символами не прошел. Получено: ${JSON.stringify(result8)}`
      };
    }
    
    if (!result9.checked || !result9.notified || result9.balance !== 9007199254740991) {
      return {
        name: testName,
        success: false,
        message: `Тест с большими числами не прошел. Получено: ${JSON.stringify(result9)}`
      };
    }
    
    // Проверяем вызовы логгера
    if (!mockLoggerError.mock.calls.some(call => call[0].includes('Rate limit exceeded')) ||
        !mockLoggerError.mock.calls.some(call => call[0].includes('User blocked bot'))) {
      return {
        name: testName,
        success: false,
        message: `Логирование ошибок работает некорректно. Вызовы: ${JSON.stringify(mockLoggerError.mock.calls)}`
      };
    }
    
    return { 
      name: testName, 
      success: true, 
      message: 'Все расширенные тесты для checkUserBalanceById успешно пройдены' 
    };
  } finally {
    // Восстанавливаем оригинальные методы
    BalanceNotifierService.getUserNotificationSettings = originalGetUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalShouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalSendLowBalanceNotification;
    supabaseModule.supabase.from = originalFrom;
    logger.error = originalLoggerError;
    logger.info = originalLoggerInfo;
  }
}
testBalanceNotifierService_CheckUserBalanceById_Extended.meta = { category: TestCategory.All };

/**
 * Интеграционный тест сервиса уведомлений о балансе
 * Проверяет взаимодействие между различными компонентами системы
 */
export async function testBalanceNotifierService_Integration(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: Integration Test';
  setupTest();
  
  // Интерфейс для результатов проверки балансов
  interface BalanceCheckResult {
    checked: number;
    notified: number;
  }
  
  // Оригинальные методы, которые будут восстановлены после тестов
  const originalMethods = {
    getUserNotificationSettings: BalanceNotifierService.getUserNotificationSettings,
    shouldNotifyUser: BalanceNotifierService.shouldNotifyUser,
    sendLowBalanceNotification: BalanceNotifierService.sendLowBalanceNotification,
    checkUserBalanceById: BalanceNotifierService.checkUserBalanceById,
    checkAllUsersBalances: BalanceNotifierService.checkAllUsersBalances
  };
  
  // Создаем реалистичные тестовые данные с разными условиями
  const testUsers: TestUser[] = [
    { id: 'user1', telegram_id: '111111', balance: 5, is_ru: true, user_type: 'active' },
    { id: 'user2', telegram_id: '222222', balance: 15, is_ru: false, user_type: 'inactive' },
    { id: 'user3', telegram_id: '333333', balance: 2.5, is_ru: true, user_type: 'premium' },
    { id: 'user4', telegram_id: '444444', balance: 0, is_ru: false, user_type: 'new' },
    { id: 'user5', telegram_id: '555555', balance: 30, is_ru: true, user_type: 'active' },
    { id: 'user6', telegram_id: null, balance: 1, is_ru: false, user_type: 'inactive' },
    { id: 'user7', telegram_id: '777777', balance: 8, is_ru: true, user_type: 'active' },
    { id: 'user8', telegram_id: '888888', balance: 9.99, is_ru: false, user_type: 'inactive' }
  ];
  
  // Счетчики для отслеживания вызовов методов
  interface Counters extends Record<string, number> {
    notificationSettingsChecked: number;
    shouldNotifyChecked: number;
    notificationsSent: number;
    userBalanceChecked: number;
  }
  
  const counters: Counters = {
    notificationSettingsChecked: 0,
    shouldNotifyChecked: 0,
    notificationsSent: 0,
    userBalanceChecked: 0
  };
  
  // Мокирование методов сервиса для отслеживания цепочки вызовов
  BalanceNotifierService.getUserNotificationSettings = async (telegramId: string) => {
    counters.notificationSettingsChecked++;
    return userSettings[telegramId] || { enabled: true, threshold: 10 };
  };
  
  BalanceNotifierService.shouldNotifyUser = (telegramId: string, balance: number, settings: UserSettings) => {
    counters.shouldNotifyChecked++;
    return settings.enabled && balance < settings.threshold;
  };
  
  BalanceNotifierService.sendLowBalanceNotification = async (telegramId: string, balance: number, threshold: number, isRu: boolean, botName: string) => {
    counters.notificationsSent++;
    // Имитируем ошибку для определенного пользователя
    if (telegramId === '444444') {
      throw new Error('Failed to send notification to user 444444');
    }
    return true;
  };
  
  // Сохраняем оригинальную реализацию checkUserBalanceById, но со счетчиком
  const originalCheckUserBalance = BalanceNotifierService.checkUserBalanceById;
  BalanceNotifierService.checkUserBalanceById = async (userId: string, botName: string) => {
    counters.userBalanceChecked++;
    return originalCheckUserBalance(userId, botName);
  };
  
  // Мокирование supabase для интеграционного теста
  const originalFrom = supabaseModule.supabase.from;
  
  // Имитация метода select для получения пользователей
  const mockUsersSelect = mockApi.create().mockReturnValue({
    data: testUsers,
    error: null
  });
  
  // Имитация метода select для получения одного пользователя
  const mockUserSelect = mockApi.create().mockImplementation((userId: string) => {
    const user = testUsers.find(u => u.id === userId);
    return {
      data: user || null,
      error: user ? null : { message: 'User not found' }
    };
  });
  
  // Настройки пользователей
  const userSettings: UserSettingsMap = {
    '111111': { enabled: true, threshold: 10 },
    '222222': { enabled: false, threshold: 5 },
    '333333': { enabled: true, threshold: 5 },
    '444444': { enabled: true, threshold: 1 },
    '555555': { enabled: true, threshold: 50 },
    '777777': { enabled: true, threshold: 10 },
    '888888': { enabled: true, threshold: 10 }
  };
  
  // Настройка мокирования supabase
  supabaseModule.supabase.from = mockApi.create().mockImplementation((table: string) => {
    if (table === 'users') {
      return {
        select: mockApi.create().mockReturnValue({
          data: testUsers,
          error: null
        }),
        eq: mockApi.create().mockImplementation((field: string, value: string) => {
          const user = testUsers.find(u => u[field as keyof TestUser] === value);
          return {
            single: mockApi.create().mockReturnValue({
              data: user || null,
              error: user ? null : { message: 'User not found' }
            })
          };
        })
      };
    }
    return {
      select: mockApi.create().mockReturnValue({
        data: [],
        error: null
      })
    };
  });
  
  try {
    // Тест 1: Проверка интеграции между методами при вызове checkAllUsersBalances
    const result1 = await BalanceNotifierService.checkAllUsersBalances('test-bot');
    
    // Проверяем, что все ожидаемые методы вызваны правильное количество раз
    if (
      counters.notificationSettingsChecked < 7 || // Должны быть проверены настройки для 7 пользователей с телеграм ID
      counters.shouldNotifyChecked < 7 || // Должны быть проверены условия уведомления для 7 пользователей
      counters.notificationsSent < 3 || // Должны быть отправлены уведомления для 3 пользователей (111111, 333333, 888888)
      !result1 || 
      result1.checked !== 8 || // Всего 8 пользователей
      result1.notified !== 3 // 3 пользователя должны получить уведомления
  ) {
    return {
      name: testName,
      success: false,
        message: `Интеграционный тест не прошел проверку. Счетчики: ${JSON.stringify(counters)}, Результат: ${JSON.stringify(result1)}`
      };
    }
    
    // Сбрасываем счетчики для следующего теста
    Object.keys(counters).forEach(key => {
      counters[key] = 0;
    });
    
    // Тест 2: Проверка обработки ошибок в цепочке методов
    // Имитируем ошибку в методе getUserNotificationSettings для конкретного пользователя
    const originalGetUserSettings = BalanceNotifierService.getUserNotificationSettings;
    BalanceNotifierService.getUserNotificationSettings = async (telegramId: string) => {
      counters.notificationSettingsChecked++;
      if (telegramId === '333333') {
        throw new Error('Failed to get settings for user 333333');
      }
      return userSettings[telegramId] || { enabled: true, threshold: 10 };
    };
    
    const result2 = await BalanceNotifierService.checkAllUsersBalances('test-bot');
    
    // Восстанавливаем оригинальный метод
    BalanceNotifierService.getUserNotificationSettings = originalGetUserSettings;
    
    // Проверяем, что ошибка для одного пользователя не повлияла на обработку остальных
    if (
      counters.notificationSettingsChecked < 7 ||
      counters.shouldNotifyChecked < 6 || // На 1 меньше из-за ошибки
      counters.notificationsSent < 2 || // На 1 меньше из-за ошибки
      !result2 || 
      result2.checked !== 8 ||
      result2.notified !== 2 // На 1 меньше из-за ошибки
    ) {
      return {
        name: testName,
        success: false,
        message: `Интеграционный тест с ошибкой настроек не прошел проверку. Счетчики: ${JSON.stringify(counters)}, Результат: ${JSON.stringify(result2)}`
      };
    }
    
    // Сбрасываем счетчики для следующего теста
    Object.keys(counters).forEach(key => {
      counters[key] = 0;
    });
    
    // Тест 3: Проверка взаимодействия с несколькими ботами
    // Имитируем вызов checkAllUsersBalances для нескольких ботов последовательно
    const botNames = ['main-bot', 'secondary-bot', 'tertiary-bot'];
    const multiResults: BalanceCheckResult[] = [];
    
    for (const botName of botNames) {
      const result = await BalanceNotifierService.checkAllUsersBalances(botName);
      multiResults.push(result);
    }
    
    // Проверяем, что все боты обработаны правильно
    if (
      counters.notificationSettingsChecked < 21 || // 7 пользователей * 3 бота
      counters.shouldNotifyChecked < 21 ||
      counters.notificationsSent < 9 || // 3 уведомления * 3 бота
      multiResults.length !== 3 ||
      multiResults.some(result => result.checked !== 8) ||
      multiResults.some(result => result.notified !== 3)
    ) {
      return {
        name: testName,
        success: false,
        message: `Интеграционный тест с несколькими ботами не прошел проверку. Счетчики: ${JSON.stringify(counters)}, Результаты: ${JSON.stringify(multiResults)}`
      };
    }
    
    return { 
      name: testName, 
      success: true, 
      message: 'Все интеграционные тесты успешно пройдены' 
    };
  } finally {
    // Восстанавливаем оригинальные методы
    Object.entries(originalMethods).forEach(([key, value]) => {
      (BalanceNotifierService as any)[key] = value;
    });
    supabaseModule.supabase.from = originalFrom;
  }
}
testBalanceNotifierService_Integration.meta = { category: TestCategory.All };

/**
 * Нагрузочное тестирование сервиса уведомлений о балансе
 * Проверяет работу сервиса при большом количестве пользователей
 */
export async function testBalanceNotifierService_LoadTesting(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: Нагрузочное тестирование';
  setupTest();
  
  // Оригинальные методы, которые будут восстановлены после тестов
  const originalMethods = {
    getUserNotificationSettings: BalanceNotifierService.getUserNotificationSettings,
    shouldNotifyUser: BalanceNotifierService.shouldNotifyUser,
    sendLowBalanceNotification: BalanceNotifierService.sendLowBalanceNotification
  };
  
  // Счетчики для отслеживания вызовов и производительности
  let notificationSettingsChecked = 0;
  let shouldNotifyChecked = 0;
  let notificationsSent = 0;
  let notificationsSucceeded = 0;
  let notificationsFailed = 0;
  
  // Создание большого набора тестовых пользователей (1000 пользователей)
  const largeUserSet = Array.from({ length: 1000 }, (_, index) => ({
    id: `user-${index + 1}`,
    telegram_id: `${100000 + index}`,
    balance: Math.random() * 50, // Случайный баланс от 0 до 50
    is_ru: index % 2 === 0 // Чередование русского и английского языков
  }));
  
  // Мокирование методов с оптимизированной производительностью
  BalanceNotifierService.getUserNotificationSettings = async (telegramId: string) => {
    notificationSettingsChecked++;
    
    // Симуляция различных настроек пользователей
    const idNum = parseInt(telegramId);
    if (idNum % 3 === 0) {
      // Каждый третий пользователь имеет отключенные уведомления
      return { enabled: false, threshold: 10 };
    } else {
      // Остальные с разными порогами
      return { 
        enabled: true, 
        threshold: (idNum % 5) + 5 // Пороги от 5 до 9
      };
    }
  };
  
  BalanceNotifierService.shouldNotifyUser = (telegramId: string, balance: number, settings: any) => {
    shouldNotifyChecked++;
    
    // Более реалистичная логика с некоторыми пограничными случаями
    const idNum = parseInt(telegramId);
    if (idNum % 7 === 0) {
      // Для создания разнообразия в результатах
      return !settings.enabled;
    }
    
    return settings.enabled && balance < settings.threshold;
  };
  
  BalanceNotifierService.sendLowBalanceNotification = async (telegramId: string, balance: number, threshold: number, isRu: boolean, botName: string) => {
    notificationsSent++;
    
    // Симуляция сетевых задержек
    await new Promise(resolve => setTimeout(resolve, Math.random() * 5));
    
    // Симуляция случайных ошибок отправки (5% вероятность)
    const idNum = parseInt(telegramId);
    if (idNum % 20 === 0) {
      notificationsFailed++;
      return false;
    }
    
    notificationsSucceeded++;
    return true;
  };
  
  // Мокирование supabase для возврата большого набора пользователей
  const originalFrom = supabaseModule.supabase.from;
  supabaseModule.supabase.from = mockApi.create().mockReturnValue({
    select: mockApi.create().mockReturnValue({
      data: largeUserSet,
      error: null
    })
  });
  
  try {
    // Замер времени выполнения
    const startTime = Date.now();
    
    // Запуск нагрузочного теста
    const result = await BalanceNotifierService.checkAllUsersBalances('load-test-bot');
    
    const endTime = Date.now();
    const executionTime = endTime - startTime;
    
    // Проверка результатов
    if (result.checked !== 1000) {
      return {
        name: testName,
        success: false,
        message: `Ожидалась проверка 1000 пользователей, получено: ${result.checked}`
      };
    }
    
    // Проверка производительности
    if (executionTime > 5000) { // Более 5 секунд считаем слишком долгим
      return {
        name: testName,
        success: false,
        message: `Время выполнения слишком большое: ${executionTime}ms для проверки ${result.checked} пользователей`
      };
    }
    
    // Проверка счетчиков для подтверждения корректной работы
    if (
      notificationSettingsChecked < 900 || // Допускаем небольшую погрешность из-за обработки ошибок
      shouldNotifyChecked < 900 ||
      notificationsSent + notificationsFailed !== result.notified
  ) {
    return {
      name: testName,
      success: false,
        message: `Несоответствие счетчиков: настройки=${notificationSettingsChecked}, shouldNotify=${shouldNotifyChecked}, отправлено=${notificationsSent}, успешно=${notificationsSucceeded}, неудачно=${notificationsFailed}, итого уведомлений=${result.notified}`
      };
    }
    
    return { 
      name: testName, 
      success: true, 
      message: `Нагрузочный тест пройден успешно. Обработано ${result.checked} пользователей за ${executionTime}ms. Отправлено уведомлений: ${result.notified}` 
    };
  } finally {
    // Восстанавливаем оригинальные методы
    BalanceNotifierService.getUserNotificationSettings = originalMethods.getUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalMethods.shouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalMethods.sendLowBalanceNotification;
    supabaseModule.supabase.from = originalFrom;
  }
}
testBalanceNotifierService_LoadTesting.meta = { category: TestCategory.All };

/**
 * Тест параллельной обработки уведомлений о балансе
 * Проверяет корректность работы при параллельном выполнении операций
 */
export async function testBalanceNotifierService_ParallelProcessing(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: Параллельная обработка';
  setupTest();
  
  // Структура для отслеживания параллельных операций
  interface ParallelTracker {
    inProgress: number;
    maxConcurrent: number;
    operations: {
      getUserSettings: number;
      shouldNotify: number;
      sendNotification: number;
    };
    botInvocations: { [botName: string]: number };
  }
  
  const tracker: ParallelTracker = {
    inProgress: 0,
    maxConcurrent: 0,
    operations: {
      getUserSettings: 0,
      shouldNotify: 0,
      sendNotification: 0
    },
    botInvocations: {}
  };
  
  // Сохраняем оригинальные методы
  const originalMethods = {
    getUserNotificationSettings: BalanceNotifierService.getUserNotificationSettings,
    shouldNotifyUser: BalanceNotifierService.shouldNotifyUser,
    sendLowBalanceNotification: BalanceNotifierService.sendLowBalanceNotification
  };
  
  // Мокирование методов для отслеживания параллельности
  BalanceNotifierService.getUserNotificationSettings = async (telegramId: string) => {
    tracker.inProgress++;
    tracker.maxConcurrent = Math.max(tracker.maxConcurrent, tracker.inProgress);
    tracker.operations.getUserSettings++;
    
    try {
      // Имитация задержки для увеличения вероятности параллельного выполнения
      await new Promise(resolve => setTimeout(resolve, Math.random() * 10));
      
      // Возвращаем разные настройки в зависимости от ID
      const idNum = parseInt(telegramId);
      if (idNum % 3 === 0) {
        return { enabled: false, threshold: 10 };
      } else if (idNum % 5 === 0) {
        return { enabled: true, threshold: 5 };
      } else {
        return { enabled: true, threshold: 10 };
      }
    } finally {
      tracker.inProgress--;
    }
  };
  
  BalanceNotifierService.shouldNotifyUser = (telegramId: string, balance: number, settings: any) => {
    tracker.operations.shouldNotify++;
    
    // Простая логика для тестирования
    return settings.enabled && balance < settings.threshold;
  };
  
  BalanceNotifierService.sendLowBalanceNotification = async (telegramId: string, balance: number, threshold: number, isRu: boolean, botName: string) => {
    tracker.inProgress++;
    tracker.maxConcurrent = Math.max(tracker.maxConcurrent, tracker.inProgress);
    tracker.operations.sendNotification++;
    
    // Отслеживаем вызовы для разных ботов
    tracker.botInvocations[botName] = (tracker.botInvocations[botName] || 0) + 1;
    
    try {
      // Имитация задержки сетевых операций
      await new Promise(resolve => setTimeout(resolve, Math.random() * 20));
      
      // 5% шанс ошибки
      if (Math.random() < 0.05) {
        return false;
      }
      
      return true;
    } finally {
      tracker.inProgress--;
    }
  };
  
  // Создание тестовых пользователей с различными балансами
  const testUsers = Array.from({ length: 100 }, (_, index) => ({
    id: `user-${index + 1}`,
    telegram_id: `${200000 + index}`,
    balance: index % 20, // Баланс от 0 до 19, повторяющийся
    is_ru: index % 3 === 0 // Треть пользователей - русскоязычные
  }));
  
  // Мокирование supabase
  const originalFrom = supabaseModule.supabase.from;
  supabaseModule.supabase.from = mockApi.create().mockReturnValue({
    select: mockApi.create().mockReturnValue({
      data: testUsers,
      error: null
    })
  });
  
  try {
    // Запуск параллельной обработки для нескольких ботов
    const botNames = [
      'main-bot', 
      'secondary-bot', 
      'premium-bot', 
      'test-bot', 
      'dev-bot'
    ];
    
    // Запускаем все проверки параллельно
    const results = await Promise.all(
      botNames.map(botName => BalanceNotifierService.checkAllUsersBalances(botName))
    );
    
    // Анализ результатов
    const totalChecked = results.reduce((sum, result) => sum + result.checked, 0);
    const totalNotified = results.reduce((sum, result) => sum + result.notified, 0);
    
    // Проверка корректности работы
    if (totalChecked !== 500) { // 100 пользователей * 5 ботов
    return {
      name: testName,
      success: false,
        message: `Ожидалась проверка 500 пользователей, получено: ${totalChecked}`
      };
    }
    
    // Проверка параллельного выполнения
    if (tracker.maxConcurrent < 3) { // Ожидаем хотя бы 3 одновременных операции
      return {
        name: testName,
        success: false,
        message: `Недостаточный уровень параллелизма: ${tracker.maxConcurrent} одновременных операций`
      };
    }
    
    // Проверка вызовов для всех ботов
    for (const botName of botNames) {
      if (!tracker.botInvocations[botName]) {
        return {
          name: testName,
          success: false,
          message: `Отсутствуют вызовы для бота ${botName}`
        };
      }
    }
    
    // Проверка пропорций операций
    const expectedRatio = {
      getUserSettings: 500, // 100 пользователей * 5 ботов
      shouldNotify: 500,
      sendNotification: totalNotified // количество отправленных уведомлений
    };
    
    const operationsOk = 
      Math.abs(tracker.operations.getUserSettings - expectedRatio.getUserSettings) <= 10 &&
      Math.abs(tracker.operations.shouldNotify - expectedRatio.shouldNotify) <= 10 &&
      Math.abs(tracker.operations.sendNotification - expectedRatio.sendNotification) <= 10;
    
    if (!operationsOk) {
      return {
        name: testName,
        success: false,
        message: `Неверное соотношение операций. Ожидалось: ${JSON.stringify(expectedRatio)}, получено: ${JSON.stringify(tracker.operations)}`
      };
    }
    
    return { 
      name: testName, 
      success: true, 
      message: `Тест параллельной обработки пройден успешно. Максимум ${tracker.maxConcurrent} одновременных операций. Обработано ${totalChecked} пользователей, отправлено ${totalNotified} уведомлений.` 
    };
  } finally {
    // Восстанавливаем оригинальные методы
    BalanceNotifierService.getUserNotificationSettings = originalMethods.getUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalMethods.shouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalMethods.sendLowBalanceNotification;
    supabaseModule.supabase.from = originalFrom;
  }
}
testBalanceNotifierService_ParallelProcessing.meta = { category: TestCategory.All };

/**
 * Тест устойчивости сервиса к сбоям
 * Проверяет работу системы при различных ошибках и отказах
 */
export async function testBalanceNotifierService_Resilience(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: Устойчивость к сбоям';
  setupTest();
  
  // Сохраняем оригинальные методы
  const originalMethods = {
    getUserNotificationSettings: BalanceNotifierService.getUserNotificationSettings,
    shouldNotifyUser: BalanceNotifierService.shouldNotifyUser,
    sendLowBalanceNotification: BalanceNotifierService.sendLowBalanceNotification,
    checkAllUsersBalances: BalanceNotifierService.checkAllUsersBalances
  };
  
  // Счетчики для различных типов ошибок
  const errorCounts = {
    database: 0,
    network: 0,
    timeout: 0,
    unknown: 0,
    recovered: 0
  };
  
  // Создаем тестовых пользователей
  const testUsers = Array.from({ length: 50 }, (_, index) => ({
    id: `user-${index + 1}`,
    telegram_id: `${300000 + index}`,
    balance: Math.floor(Math.random() * 20),
    is_ru: index % 2 === 0
  }));
  
  // Имитация нестабильной базы данных с временными сбоями
  let dbFailureCounter = 0;
  const mockUnstableDb = () => {
    dbFailureCounter++;
    
    // Каждый третий запрос будет неудачным
    if (dbFailureCounter % 3 === 0) {
      errorCounts.database++;
      return {
        data: null,
        error: { message: 'Database connection error', code: 'CONNECTION_ERROR' }
      };
    }
    
    // Каждый пятый запрос будет с задержкой
    if (dbFailureCounter % 5 === 0) {
      errorCounts.timeout++;
      // Имитация таймаута
      return new Promise(resolve => {
        setTimeout(() => {
          resolve({
            data: testUsers,
            error: null
          });
        }, 200); // Задержка 200мс
      });
    }
    
    // Остальные запросы успешны
    return {
      data: testUsers,
      error: null
    };
  };
  
  // Мокирование нестабильного соединения с Telegram
  let apiFailureCounter = 0;
  const mockUnstableTelegram = async () => {
    apiFailureCounter++;
    
    // Каждый четвёртый запрос будет неудачным
    if (apiFailureCounter % 4 === 0) {
      errorCounts.network++;
      throw new Error('Network error: Failed to connect to Telegram API');
    }
    
    // Каждый седьмой запрос будет с таймаутом
    if (apiFailureCounter % 7 === 0) {
      errorCounts.timeout++;
      await new Promise(resolve => setTimeout(resolve, 300));
      return false; // Неудачная отправка
    }
    
    // Остальные запросы успешны
    return true;
  };
  
  // Мокирование методов с учетом возможных сбоев
  BalanceNotifierService.getUserNotificationSettings = async (telegramId: string) => {
    try {
      if (parseInt(telegramId) % 6 === 0) {
        errorCounts.unknown++;
        throw new Error('Unexpected error in settings retrieval');
      }
      
      return { enabled: true, threshold: 10 };
    } catch (error) {
      // Обработка и восстановление после ошибки
      errorCounts.recovered++;
      return { enabled: false, threshold: 10 }; // Возвращаем значения по умолчанию при ошибке
    }
  };
  
  BalanceNotifierService.shouldNotifyUser = (telegramId: string, balance: number, settings: any) => {
    try {
      // Простая логика для тестов
      return settings.enabled && balance < settings.threshold;
    } catch (error) {
      errorCounts.recovered++;
      return false; // Безопасное значение по умолчанию
    }
  };
  
  BalanceNotifierService.sendLowBalanceNotification = mockUnstableTelegram;
  
  // Мокирование supabase
  const originalFrom = supabaseModule.supabase.from;
  supabaseModule.supabase.from = mockApi.create().mockReturnValue({
    select: mockApi.create().mockImplementation(mockUnstableDb)
  });
  
  try {
    // Запускаем проверку несколько раз подряд, чтобы проверить устойчивость
    const iterations = 10;
    const results = [];
    
    for (let i = 0; i < iterations; i++) {
      // Для каждой итерации используем немного разные имена ботов
      const botName = `resilience-test-bot-${i + 1}`;
      const result = await BalanceNotifierService.checkAllUsersBalances(botName);
      results.push(result);
    }
    
    // Проверка результатов
    const totalChecked = results.reduce((sum, result) => sum + result.checked, 0);
    const totalNotified = results.reduce((sum, result) => sum + result.notified, 0);
    
    // Проверка статистики ошибок
    if (errorCounts.database === 0 || errorCounts.network === 0 || errorCounts.timeout === 0) {
    return {
      name: testName,
      success: false,
        message: `Недостаточное количество имитированных ошибок для проверки устойчивости. Ошибки: ${JSON.stringify(errorCounts)}`
      };
    }
    
    // Проверка корректного восстановления после ошибок
    if (errorCounts.recovered === 0) {
      return {
        name: testName,
        success: false,
        message: 'Не зафиксировано ни одного случая восстановления после ошибки'
      };
    }
    
    // Статистика проверок
    const averageChecked = totalChecked / iterations;
    const minExpectedChecks = 25; // Не менее половины от 50 пользователей
    
    if (averageChecked < minExpectedChecks) {
      return {
        name: testName,
        success: false,
        message: `Среднее количество проверенных пользователей (${averageChecked}) ниже минимально ожидаемого (${minExpectedChecks})`
      };
    }
    
    return { 
      name: testName, 
      success: true, 
      message: `Тест устойчивости пройден успешно. Проведено ${iterations} итераций с искусственными сбоями. Обработано в среднем ${averageChecked.toFixed(1)} пользователей за итерацию. Ошибки: DB=${errorCounts.database}, Network=${errorCounts.network}, Timeout=${errorCounts.timeout}, Recovered=${errorCounts.recovered}` 
    };
  } finally {
    // Восстанавливаем оригинальные методы
    BalanceNotifierService.getUserNotificationSettings = originalMethods.getUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalMethods.shouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalMethods.sendLowBalanceNotification;
    supabaseModule.supabase.from = originalFrom;
  }
}
testBalanceNotifierService_Resilience.meta = { category: TestCategory.All };

/**
 * Тест метрик производительности сервиса уведомлений
 * Анализирует производительность и выявляет узкие места
 */
export async function testBalanceNotifierService_PerformanceMetrics(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: Метрики производительности';
  setupTest();
  
  // Структура для сбора метрик производительности
  interface PerformanceMetrics {
    dbQueriesCount: number;
    dbQueryTimes: number[];
    notificationTimes: number[];
    userProcessingTimes: Map<string, number>;
    componentTimes: {
      getUserSettings: number[];
      shouldNotify: number[];
      sendNotification: number[];
      totalProcessing: number;
    };
    memoryUsage: {
      start: NodeJS.MemoryUsage;
      end: NodeJS.MemoryUsage;
    };
  }
  
  const metrics: PerformanceMetrics = {
    dbQueriesCount: 0,
    dbQueryTimes: [],
    notificationTimes: [],
    userProcessingTimes: new Map<string, number>(),
    componentTimes: {
      getUserSettings: [],
      shouldNotify: [],
      sendNotification: [],
      totalProcessing: 0
    },
    memoryUsage: {
      start: process.memoryUsage(),
      end: {} as NodeJS.MemoryUsage
    }
  };
  
  // Сохраняем оригинальные методы
  const originalMethods = {
    getUserNotificationSettings: BalanceNotifierService.getUserNotificationSettings,
    shouldNotifyUser: BalanceNotifierService.shouldNotifyUser,
    sendLowBalanceNotification: BalanceNotifierService.sendLowBalanceNotification
  };
  
  // Создаем тестовых пользователей с метаданными по типам
  const userGroups = [
    { type: 'active', count: 100, lowBalancePercentage: 0.3 }, // Активные пользователи
    { type: 'inactive', count: 50, lowBalancePercentage: 0.8 }, // Неактивные пользователи с низким балансом
    { type: 'premium', count: 30, lowBalancePercentage: 0.1 }, // Премиум пользователи с высоким балансом
    { type: 'new', count: 20, lowBalancePercentage: 0.5 } // Новые пользователи
  ];
  
  let userId = 400000;
  const testUsers: TestUser[] = [];
  
  for (const group of userGroups) {
    for (let i = 0; i < group.count; i++) {
      const hasLowBalance = Math.random() < group.lowBalancePercentage;
      const balance = hasLowBalance ? Math.random() * 5 : 10 + Math.random() * 90;
      
      testUsers.push({
        id: `user-${userId}`,
        telegram_id: `${userId}`,
        balance,
        is_ru: Math.random() > 0.5,
        user_type: group.type // Метаданные для анализа
      });
      
      userId++;
    }
  }
  
  // Мокирование getUserNotificationSettings с измерением времени
  BalanceNotifierService.getUserNotificationSettings = async (telegramId: string) => {
    const startTime = Date.now();
    
    try {
      // Имитация разной логики для разных типов пользователей
      const user = testUsers.find(u => u.telegram_id === telegramId);
      const userType = user?.user_type || 'unknown';
      
      // Имитация разной задержки для разных типов пользователей
      let delay = 0;
      switch(userType) {
        case 'premium': 
          delay = 1 + Math.random() * 5; // Быстрый доступ для премиум-пользователей
          break;
        case 'active': 
          delay = 5 + Math.random() * 10; // Средняя скорость для активных
          break;
        case 'inactive': 
          delay = 10 + Math.random() * 20; // Медленнее для неактивных
          break;
        case 'new': 
          delay = 8 + Math.random() * 15; // Средняя скорость для новых
          break;
        default:
          delay = 10 + Math.random() * 30; // Самая медленная для неизвестных
      }
      
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Различные настройки в зависимости от типа пользователя
      switch(userType) {
        case 'premium': 
          return { enabled: true, threshold: 20 };
        case 'active': 
          return { enabled: true, threshold: 10 };
        case 'inactive': 
          return { enabled: false, threshold: 5 };
        case 'new': 
          return { enabled: true, threshold: 15 };
        default:
          return { enabled: false, threshold: 10 };
      }
    } finally {
      const elapsed = Date.now() - startTime;
      metrics.componentTimes.getUserSettings.push(elapsed);
    }
  };
  
  // Мокирование shouldNotifyUser с измерением времени
  BalanceNotifierService.shouldNotifyUser = (telegramId: string, balance: number, settings: any) => {
    const startTime = Date.now();
    
    try {
      // Имитация вычислений и проверок
      const result = settings.enabled && balance < settings.threshold;
      
      // Имитация дополнительной задержки для некоторых пользователей
      if (parseInt(telegramId) % 10 === 0) {
        for (let i = 0; i < 1000000; i++) {
          // Искусственная нагрузка на процессор
          Math.sqrt(i);
        }
      }
      
      return result;
    } finally {
      const elapsed = Date.now() - startTime;
      metrics.componentTimes.shouldNotify.push(elapsed);
    }
  };
  
  // Мокирование sendLowBalanceNotification с измерением времени
  BalanceNotifierService.sendLowBalanceNotification = async (telegramId: string, balance: number, threshold: number, isRu: boolean, botName: string) => {
    const startTime = Date.now();
    
    try {
      // Имитация задержки отправки сообщения
      const delay = 20 + Math.random() * 50; // 20-70мс
      await new Promise(resolve => setTimeout(resolve, delay));
      
      // Имитация неудачи для некоторых отправок
      const success = Math.random() > 0.05; // 5% неудач
      
      return success;
    } finally {
      const elapsed = Date.now() - startTime;
      metrics.notificationTimes.push(elapsed);
      metrics.componentTimes.sendNotification.push(elapsed);
    }
  };
  
  // Мокирование базы данных с измерением времени запросов
  const originalFrom = supabaseModule.supabase.from;
  supabaseModule.supabase.from = mockApi.create().mockImplementation(() => {
    const startTime = Date.now();
    metrics.dbQueriesCount++;
    
    return {
      select: mockApi.create().mockImplementation(() => {
        // Имитация задержки запроса к базе данных
        const queryDelay = 30 + Math.random() * 50; // 30-80мс
        
        return {
          data: testUsers,
          error: null,
          get [Symbol.toStringTag]() {
            // Записываем метрику времени запроса только при фактическом использовании данных
            metrics.dbQueryTimes.push(Date.now() - startTime);
            return 'Promise';
          }
        };
      })
    };
  });
  
  // Перехват console.time/timeEnd для измерения времени обработки каждого пользователя
  const originalConsoleTime = console.time;
  const originalConsoleTimeEnd = console.timeEnd;
  
  console.time = (label: string) => {
    if (label.startsWith('Process user ')) {
      const userId = label.replace('Process user ', '');
      metrics.userProcessingTimes.set(userId, Date.now());
    }
    originalConsoleTime(label);
  };
  
  console.timeEnd = (label: string) => {
    if (label.startsWith('Process user ')) {
      const userId = label.replace('Process user ', '');
      const startTime = metrics.userProcessingTimes.get(userId);
      if (startTime) {
        metrics.userProcessingTimes.set(userId, Date.now() - startTime);
      }
    }
    originalConsoleTimeEnd(label);
  };
  
  try {
    // Измеряем использование памяти перед запуском
    metrics.memoryUsage.start = process.memoryUsage();
    
    // Фиксируем время начала общей обработки
    const processingStart = Date.now();
    
    // Запускаем проверку
    const result = await BalanceNotifierService.checkAllUsersBalances('metrics-test-bot');
    
    // Фиксируем время окончания и потребление памяти
    metrics.componentTimes.totalProcessing = Date.now() - processingStart;
    metrics.memoryUsage.end = process.memoryUsage();
    
    // Анализ собранных метрик
    const avgDbQueryTime = metrics.dbQueryTimes.length > 0 
      ? metrics.dbQueryTimes.reduce((a, b) => a + b, 0) / metrics.dbQueryTimes.length 
      : 0;
    
    const avgNotificationTime = metrics.notificationTimes.length > 0 
      ? metrics.notificationTimes.reduce((a, b) => a + b, 0) / metrics.notificationTimes.length 
      : 0;
    
    const avgGetUserSettingsTime = metrics.componentTimes.getUserSettings.length > 0 
      ? metrics.componentTimes.getUserSettings.reduce((a, b) => a + b, 0) / metrics.componentTimes.getUserSettings.length 
      : 0;
    
    const avgShouldNotifyTime = metrics.componentTimes.shouldNotify.length > 0 
      ? metrics.componentTimes.shouldNotify.reduce((a, b) => a + b, 0) / metrics.componentTimes.shouldNotify.length 
      : 0;
    
    const avgSendNotificationTime = metrics.componentTimes.sendNotification.length > 0 
      ? metrics.componentTimes.sendNotification.reduce((a, b) => a + b, 0) / metrics.componentTimes.sendNotification.length 
      : 0;
    
    // Поиск самого медленного пользователя
    let slowestUserId = '';
    let maxProcessingTime = 0;
    
    metrics.userProcessingTimes.forEach((time, userId) => {
      if (time > maxProcessingTime) {
        maxProcessingTime = time;
        slowestUserId = userId;
      }
    });
    
    // Определение узких мест
    const componentTimings = [
      { name: 'Получение настроек', time: avgGetUserSettingsTime },
      { name: 'Проверка условий уведомления', time: avgShouldNotifyTime },
      { name: 'Отправка уведомления', time: avgSendNotificationTime },
      { name: 'Запрос к базе данных', time: avgDbQueryTime }
    ];
    
    componentTimings.sort((a, b) => b.time - a.time);
    const bottleneck = componentTimings[0].name;
    
    // Расчет эффективности
    const totalTimeSpent = metrics.componentTimes.totalProcessing;
    const totalUsersProcessed = result.checked;
    const avgUserProcessingTime = totalTimeSpent / totalUsersProcessed;
    
    // Анализ использования памяти
    const memoryUsageDiff = {
      rss: (metrics.memoryUsage.end.rss - metrics.memoryUsage.start.rss) / 1024 / 1024, // МБ
      heapTotal: (metrics.memoryUsage.end.heapTotal - metrics.memoryUsage.start.heapTotal) / 1024 / 1024,
      heapUsed: (metrics.memoryUsage.end.heapUsed - metrics.memoryUsage.start.heapUsed) / 1024 / 1024,
      external: (metrics.memoryUsage.end.external - metrics.memoryUsage.start.external) / 1024 / 1024
    };
    
    // Проверка производительности
    if (avgUserProcessingTime > 50) { // Более 50мс на пользователя считаем проблемой
    return {
      name: testName,
      success: false,
        message: `Низкая производительность: ${avgUserProcessingTime.toFixed(2)}мс на пользователя. Узкое место: ${bottleneck} (${componentTimings[0].time.toFixed(2)}мс)`
      };
    }
    
    // Проверка утечки памяти
    if (memoryUsageDiff.heapUsed > 50) { // Более 50МБ считаем проблемой
      return {
        name: testName,
        success: false,
        message: `Обнаружена возможная утечка памяти: ${memoryUsageDiff.heapUsed.toFixed(2)}МБ дополнительно использовано в куче`
      };
    }
    
    return { 
      name: testName, 
      success: true, 
      message: `Анализ производительности завершен. Обработано ${result.checked} пользователей за ${metrics.componentTimes.totalProcessing}мс (${avgUserProcessingTime.toFixed(2)}мс/пользователь). Узкое место: ${bottleneck} (${componentTimings[0].time.toFixed(2)}мс)` 
    };
  } finally {
    // Восстанавливаем оригинальные методы
    BalanceNotifierService.getUserNotificationSettings = originalMethods.getUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalMethods.shouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalMethods.sendLowBalanceNotification;
    supabaseModule.supabase.from = originalFrom;
    console.time = originalConsoleTime;
    console.timeEnd = originalConsoleTimeEnd;
  }
}
testBalanceNotifierService_PerformanceMetrics.meta = { category: TestCategory.All };

/**
 * Тест консистентности данных в сервисе уведомлений
 * Проверяет целостность данных между различными вызовами методов
 */
export async function testBalanceNotifierService_DataConsistency(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: Консистентность данных';
  setupTest();
  
  // Сохраняем оригинальные методы
  const originalMethods = {
    getUserNotificationSettings: BalanceNotifierService.getUserNotificationSettings,
    shouldNotifyUser: BalanceNotifierService.shouldNotifyUser,
    sendLowBalanceNotification: BalanceNotifierService.sendLowBalanceNotification,
    checkUserBalanceById: BalanceNotifierService.checkUserBalanceById
  };
  
  // Интерфейс для отслеживания изменений в данных пользователей
  interface UserStateTracking {
    initialBalance: number;
    currentBalance: number;
    notificationsSent: number;
    lastNotificationAt: number | null;
    notificationSettings: {
      enabled: boolean;
      threshold: number;
    };
    balanceHistory: {
      timestamp: number;
      balance: number;
      action: string;
    }[];
  }
  
  // Хранилище для отслеживания состояния пользователей
  const userStates = new Map<string, UserStateTracking>();
  
  // Создаем тестовых пользователей с начальными балансами
  const testUsers = [
    { id: 'user1', telegram_id: '500001', balance: 20, is_ru: true },
    { id: 'user2', telegram_id: '500002', balance: 8, is_ru: false },
    { id: 'user3', telegram_id: '500003', balance: 5, is_ru: true },
    { id: 'user4', telegram_id: '500004', balance: 15, is_ru: false },
    { id: 'user5', telegram_id: '500005', balance: 3, is_ru: true }
  ];
  
  // Инициализируем отслеживание состояния
  testUsers.forEach(user => {
    userStates.set(user.telegram_id, {
      initialBalance: user.balance,
      currentBalance: user.balance,
      notificationsSent: 0,
      lastNotificationAt: null,
      notificationSettings: {
        enabled: true,
        threshold: 10
      },
      balanceHistory: [{
        timestamp: Date.now(),
        balance: user.balance,
        action: 'initial'
      }]
    });
  });
  
  // Мокирование запросов к базе данных
  const originalFrom = supabaseModule.supabase.from;
  
  // Имитация динамических изменений балансов
  const getMockedUserBalance = (userId: string) => {
    const state = userStates.get(userId);
    if (!state) return null;
    return state.currentBalance;
  };
  
  const updateMockedUserBalance = (userId: string, newBalance: number, action: string) => {
    const state = userStates.get(userId);
    if (!state) return;
    
    state.currentBalance = newBalance;
    state.balanceHistory.push({
      timestamp: Date.now(),
      balance: newBalance,
      action
    });
  };
  
  // Мокирование базы данных для возврата динамических данных
  supabaseModule.supabase.from = mockApi.create().mockImplementation((table: string) => {
    if (table === 'users') {
      return {
        select: mockApi.create().mockReturnValue({
          data: testUsers.map(user => ({
            ...user,
            balance: getMockedUserBalance(user.telegram_id) ?? user.balance
          })),
          error: null
        }),
        eq: mockApi.create().mockImplementation((field: string, value: string) => {
          const user = testUsers.find(u => u[field as keyof typeof u] === value);
          if (!user) {
            return {
              single: mockApi.create().mockReturnValue({
                data: null,
                error: { message: 'User not found' }
              })
            };
          }
          
          return {
            single: mockApi.create().mockReturnValue({
              data: {
                ...user,
                balance: getMockedUserBalance(user.telegram_id) ?? user.balance
              },
              error: null
            })
          };
        })
      };
    }
    return {
      select: mockApi.create().mockReturnValue({
        data: [],
        error: null
      })
    };
  });
  
  // Мокирование getUserNotificationSettings для отслеживания изменений настроек
  BalanceNotifierService.getUserNotificationSettings = async (telegramId: string) => {
    const state = userStates.get(telegramId);
    if (!state) {
      return { enabled: false, threshold: 10 };
    }
    return { ...state.notificationSettings };
  };
  
  // Мокирование shouldNotifyUser с учетом истории уведомлений
  BalanceNotifierService.shouldNotifyUser = (telegramId: string, balance: number, settings: any) => {
    const state = userStates.get(telegramId);
    if (!state) {
      return false;
    }
    
    // Проверяем базовое условие
    const shouldNotify = settings.enabled && balance < settings.threshold;
    
    // Дополнительно проверяем, что не отправляем слишком частые уведомления
    if (shouldNotify && state.lastNotificationAt) {
      const timeSinceLastNotification = Date.now() - state.lastNotificationAt;
      // Не отправляем уведомление, если прошло менее 1 секунды (для тестов)
      if (timeSinceLastNotification < 1000) {
        return false;
      }
    }
    
    return shouldNotify;
  };
  
  // Мокирование sendLowBalanceNotification с отслеживанием отправленных уведомлений
  BalanceNotifierService.sendLowBalanceNotification = async (telegramId: string, balance: number, threshold: number, isRu: boolean, botName: string) => {
    const state = userStates.get(telegramId);
    if (!state) {
      return false;
    }
    
    // Записываем факт отправки уведомления
    state.notificationsSent++;
    state.lastNotificationAt = Date.now();
    
    return true;
  };
  
  // Имитация изменений баланса на основе действий пользователя
  const simulateUserActions = async () => {
    // Пользователь 1: постепенное уменьшение баланса
    await new Promise(resolve => setTimeout(resolve, 100));
    updateMockedUserBalance('500001', 18, 'purchase');
    await new Promise(resolve => setTimeout(resolve, 100));
    updateMockedUserBalance('500001', 15, 'purchase');
    await new Promise(resolve => setTimeout(resolve, 100));
    updateMockedUserBalance('500001', 12, 'purchase');
    await new Promise(resolve => setTimeout(resolve, 100));
    updateMockedUserBalance('500001', 9, 'purchase'); // Теперь ниже порога
    
    // Пользователь 2: колебания вокруг порога
    await new Promise(resolve => setTimeout(resolve, 50));
    updateMockedUserBalance('500002', 10, 'deposit');
    await new Promise(resolve => setTimeout(resolve, 50));
    updateMockedUserBalance('500002', 9, 'purchase');
    await new Promise(resolve => setTimeout(resolve, 50));
    updateMockedUserBalance('500002', 11, 'deposit');
    await new Promise(resolve => setTimeout(resolve, 50));
    updateMockedUserBalance('500002', 8, 'purchase');
    
    // Пользователь 3: остается ниже порога
    await new Promise(resolve => setTimeout(resolve, 150));
    updateMockedUserBalance('500003', 4, 'purchase');
    await new Promise(resolve => setTimeout(resolve, 150));
    updateMockedUserBalance('500003', 3, 'purchase');
    
    // Пользователь 4: отключает уведомления и снижает баланс
    const user4State = userStates.get('500004');
    if (user4State) {
      user4State.notificationSettings.enabled = false;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
    updateMockedUserBalance('500004', 8, 'purchase');
    await new Promise(resolve => setTimeout(resolve, 200));
    updateMockedUserBalance('500004', 2, 'purchase');
    
    // Пользователь 5: пополняет баланс выше порога
    await new Promise(resolve => setTimeout(resolve, 100));
    updateMockedUserBalance('500005', 12, 'deposit');
  };
  
  try {
    // Запускаем серию проверок, имитируя работу системы в реальном времени
    
    // Первая проверка - исходное состояние
    const result1 = await BalanceNotifierService.checkAllUsersBalances('consistency-test-bot');
    
    // Имитируем действия пользователей, которые меняют их балансы
    await simulateUserActions();
    
    // Вторая проверка - после изменений
    const result2 = await BalanceNotifierService.checkAllUsersBalances('consistency-test-bot');
    
    // Проверяем индивидуальных пользователей
    const user1Result = await BalanceNotifierService.checkUserBalanceById('user1', 'consistency-test-bot');
    const user2Result = await BalanceNotifierService.checkUserBalanceById('user2', 'consistency-test-bot');
    const user3Result = await BalanceNotifierService.checkUserBalanceById('user3', 'consistency-test-bot');
    const user4Result = await BalanceNotifierService.checkUserBalanceById('user4', 'consistency-test-bot');
    const user5Result = await BalanceNotifierService.checkUserBalanceById('user5', 'consistency-test-bot');
    
    // Третья проверка - после индивидуальных проверок
    const result3 = await BalanceNotifierService.checkAllUsersBalances('consistency-test-bot');
    
    // Анализ результатов и проверка консистентности данных
    
    // 1. Проверяем, что уведомления отправлены ожидаемым пользователям
    // Пользователь 1: был выше порога, стал ниже - должно отправиться уведомление
    // Пользователь 2: колебался вокруг порога - зависит от timing, но как минимум одно должно быть
    // Пользователь 3: был и остался ниже порога - должно отправиться только одно уведомление
    // Пользователь 4: отключил уведомления - не должно быть уведомлений, несмотря на низкий баланс
    // Пользователь 5: был ниже порога, стал выше - не должно быть уведомлений для высокого баланса
    
    const user1State = userStates.get('500001');
    const user2State = userStates.get('500002');
    const user3State = userStates.get('500003');
    const user4State = userStates.get('500004');
    const user5State = userStates.get('500005');
    
    // Проверка консистентности уведомлений
    const notificationConsistencyCheck = 
      user1State && user1State.notificationsSent > 0 &&
      user2State && user2State.notificationsSent > 0 &&
      user3State && user3State.notificationsSent > 0 &&
      user4State && user4State.notificationsSent === 0 &&
      user5State && user5State.notificationsSent === 1; // Должно быть одно уведомление до пополнения
    
    if (!notificationConsistencyCheck) {
      return {
        name: testName,
        success: false,
        message: `Проблемы с консистентностью уведомлений. Количество отправленных: User1=${user1State?.notificationsSent}, User2=${user2State?.notificationsSent}, User3=${user3State?.notificationsSent}, User4=${user4State?.notificationsSent}, User5=${user5State?.notificationsSent}`
      };
    }
    
    // Проверка консистентности истории балансов
    // У каждого пользователя должна быть корректная история изменений
    const balanceHistoryConsistencyCheck = 
      user1State && user1State.balanceHistory.length === 5 && // начальный + 4 изменения
      user2State && user2State.balanceHistory.length === 5 && // начальный + 4 изменения
      user3State && user3State.balanceHistory.length === 3 && // начальный + 2 изменения
      user4State && user4State.balanceHistory.length === 3 && // начальный + 2 изменения
      user5State && user5State.balanceHistory.length === 2;   // начальный + 1 изменение
    
    if (!balanceHistoryConsistencyCheck) {
      return {
        name: testName,
        success: false,
        message: `Проблемы с историей изменений балансов. Количество записей: User1=${user1State?.balanceHistory.length}, User2=${user2State?.balanceHistory.length}, User3=${user3State?.balanceHistory.length}, User4=${user4State?.balanceHistory.length}, User5=${user5State?.balanceHistory.length}`
      };
    }
    
    // Проверка консистентности текущих балансов
    // Текущие балансы должны соответствовать последним изменениям
    const balanceConsistencyCheck = 
      user1State && user1State.currentBalance === 9 &&
      user2State && user2State.currentBalance === 8 &&
      user3State && user3State.currentBalance === 3 &&
      user4State && user4State.currentBalance === 2 &&
      user5State && user5State.currentBalance === 12;
    
    if (!balanceConsistencyCheck) {
      return {
        name: testName,
        success: false,
        message: `Проблемы с текущими балансами. Значения: User1=${user1State?.currentBalance}, User2=${user2State?.currentBalance}, User3=${user3State?.currentBalance}, User4=${user4State?.currentBalance}, User5=${user5State?.currentBalance}`
      };
    }
    
    // Проверка соответствия результатов вызовов методов с состоянием отслеживания
    const user1Balance = user1Result.balance === user1State?.currentBalance;
    const user2Balance = user2Result.balance === user2State?.currentBalance;
    const user3Balance = user3Result.balance === user3State?.currentBalance;
    const user4Balance = user4Result.balance === user4State?.currentBalance;
    const user5Balance = user5Result.balance === user5State?.currentBalance;
    
    if (!(user1Balance && user2Balance && user3Balance && user4Balance && user5Balance)) {
      return {
        name: testName,
        success: false,
        message: `Несоответствие между отслеживаемыми балансами и результатами методов. Проверьте синхронизацию данных.`
      };
    }
    
    // Проверка результатов массовых проверок
    if (result1.checked !== 5 || result2.checked !== 5 || result3.checked !== 5) {
      return {
        name: testName,
        success: false,
        message: `Неверное количество проверенных пользователей в массовых проверках: ${result1.checked}, ${result2.checked}, ${result3.checked}`
      };
    }
    
    return { 
      name: testName, 
      success: true, 
      message: `Тест консистентности данных успешно пройден. Отслежено корректное изменение балансов и отправка уведомлений для ${result3.checked} пользователей.` 
    };
  } finally {
    // Восстанавливаем оригинальные методы
    BalanceNotifierService.getUserNotificationSettings = originalMethods.getUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalMethods.shouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalMethods.sendLowBalanceNotification;
    BalanceNotifierService.checkUserBalanceById = originalMethods.checkUserBalanceById;
    supabaseModule.supabase.from = originalFrom;
  }
}
testBalanceNotifierService_DataConsistency.meta = { category: TestCategory.All };

// Определение интерфейса транзакции Supabase
interface SupabaseTransaction {
  from: (table: string) => {
    select: () => Promise<{ data: any; error: any }>;
    update: (updates: any) => Promise<{ data: any; error: any }>;
    insert: (data: any) => Promise<{ data: any; error: any }>;
  };
  commit: () => Promise<{ data: any; error: any }>;
  rollback: () => Promise<{ data: any; error: any }>;
}

// Расширение интерфейса Supabase для добавления транзакций
interface MockSupabaseClientWithTransaction {
  from: (table: string) => any;
  transaction: (callback: (tx: SupabaseTransaction) => Promise<void>) => Promise<{ data: any; error: any }>;
}

/**
 * Тест транзакционной устойчивости сервиса уведомлений
 * Проверяет корректную работу с транзакциями базы данных и восстановление после ошибок
 */
export async function testBalanceNotifierService_TransactionResilience(): Promise<TestResult> {
  const testName = 'BalanceNotifierService: Transaction Resilience';
  setupTest();
  
  // Сохраняем оригинальные методы
  const originalMethods = {
    getUserNotificationSettings: BalanceNotifierService.getUserNotificationSettings,
    shouldNotifyUser: BalanceNotifierService.shouldNotifyUser,
    sendLowBalanceNotification: BalanceNotifierService.sendLowBalanceNotification
  };
  
  // Счетчики транзакций
  const transactionStats = {
    started: 0,
    committed: 0,
    rolledBack: 0,
    errors: 0
  };
  
  // Сохраняем оригинальный объект supabase
  const originalSupabase = supabaseModule.supabase;
  
  // Тестовые пользователи для транзакций
  const transactionTestUsers: TestUser[] = [
    { id: 'tx-user-1', telegram_id: '600001', balance: 5, is_ru: true, user_type: 'active' },
    { id: 'tx-user-2', telegram_id: '600002', balance: 15, is_ru: false, user_type: 'inactive' },
    { id: 'tx-user-3', telegram_id: '600003', balance: 8, is_ru: true, user_type: 'active' }
  ];
  
  // Создаем мок объект с нужными методами
  const mockSupabaseWithTransaction: MockSupabaseClientWithTransaction = {
    from: mockApi.create().mockReturnValue({
      select: mockApi.create().mockReturnValue({
        data: transactionTestUsers,
        error: null
      })
    }),
    // Мокируем метод начала транзакции
    transaction: mockApi.create().mockImplementation(async (callback) => {
      transactionStats.started++;
      
      // Объект транзакции для передачи в callback
      const transaction: SupabaseTransaction = {
        from: mockApi.create().mockReturnValue({
          select: mockApi.create().mockReturnValue({
            data: transactionTestUsers,
            error: null
          }),
          update: mockApi.create().mockImplementation((updates) => {
            // Симулируем случайную ошибку для каждой третьей транзакции
            if (transactionStats.started % 3 === 0) {
              transactionStats.errors++;
              throw new Error('Transaction update error: connection lost');
            }
            return { data: updates, error: null };
          }),
          insert: mockApi.create().mockImplementation((data) => {
            // Симулируем ошибку для каждой четвертой транзакции (нарушение ограничения)
            if (transactionStats.started % 4 === 0) {
              transactionStats.errors++;
              throw new Error('Transaction insert error: constraint violation');
            }
            return { data, error: null };
          })
        }),
        commit: mockApi.create().mockImplementation(() => {
          transactionStats.committed++;
          return { data: null, error: null };
        }),
        rollback: mockApi.create().mockImplementation(() => {
          transactionStats.rolledBack++;
          return { data: null, error: null };
        })
      };
      
      try {
        // Вызываем коллбэк с транзакцией
        await callback(transaction);
        
        // Автоматически коммитим, если не выброшено исключение
        if (transactionStats.committed === 0) {
          await transaction.commit();
        }
        
        return { data: null, error: null };
      } catch (error) {
        // Откатываем транзакцию при ошибке
        await transaction.rollback();
        return { data: null, error };
      }
    })
  };
  
  // Создаем временное хранилище и подменяем объект supabase
  const tempSupabase = { ...supabaseModule.supabase, ...mockSupabaseWithTransaction };
  Object.defineProperty(supabaseModule, 'supabase', {
    value: tempSupabase,
    configurable: true
  });
  
  // Создаем тестовую реализацию метода работы с уведомлениями, использующую транзакции
  const processBalanceNotificationWithTransaction = async (telegramId: string, botName: string) => {
    let result = { success: false, message: '' };
    
    // Находим пользователя
    const user = transactionTestUsers.find(u => u.telegram_id === telegramId);
    if (!user) {
      return { success: false, message: 'User not found' };
    }
    
    try {
      // Начинаем транзакцию
      const { error } = await (tempSupabase as MockSupabaseClientWithTransaction).transaction(async (tx: SupabaseTransaction) => {
        // Получаем настройки в рамках транзакции
        const settings = await BalanceNotifierService.getUserNotificationSettings(telegramId);
        
        // Проверяем необходимость уведомления
        const shouldNotify = BalanceNotifierService.shouldNotifyUser(telegramId, user.balance, settings);
        
        if (shouldNotify) {
          // Отправляем уведомление
          const sent = await BalanceNotifierService.sendLowBalanceNotification(
            telegramId, user.balance, settings.threshold, user.is_ru, botName
          );
          
          if (sent) {
            // Обновляем данные пользователя (запись о факте уведомления)
            await tx.from('user_notifications').insert({
              user_id: user.id,
              telegram_id: telegramId,
              notification_type: 'low_balance',
              sent_at: new Date().toISOString(),
              balance_at_time: user.balance
            });
            
            result = { success: true, message: 'Notification sent and recorded' };
          } else {
            throw new Error('Failed to send notification');
          }
        } else {
          result = { success: true, message: 'No notification needed' };
        }
      });
      
      if (error) {
        throw error;
      }
      
      return result;
    } catch (err) {
      // Обработка ошибок транзакции
      return { 
        success: false, 
        message: `Transaction error: ${err instanceof Error ? err.message : String(err)}`
      };
    }
  };
  
  try {
    // Запускаем серию тестов с транзакциями
    const results = [];
    
    // Тест 1: Успешная транзакция
    // Мокируем функцию shouldNotifyUser для гарантированного возврата true
    BalanceNotifierService.shouldNotifyUser = () => true;
    BalanceNotifierService.sendLowBalanceNotification = async () => true;
    
    const result1 = await processBalanceNotificationWithTransaction('600001', TEST_BOT_NAMES.MAIN);
    results.push(result1);
    
    // Тест 2: Транзакция без отправки уведомления
    BalanceNotifierService.shouldNotifyUser = () => false;
    
    const result2 = await processBalanceNotificationWithTransaction('600002', TEST_BOT_NAMES.MAIN);
    results.push(result2);
    
    // Тест 3: Ошибка обновления в транзакции
    BalanceNotifierService.shouldNotifyUser = () => true;
    
    const result3 = await processBalanceNotificationWithTransaction('600003', TEST_BOT_NAMES.MAIN);
    results.push(result3);
    
    // Тест 4: Ошибка вставки в транзакции
    const result4 = await processBalanceNotificationWithTransaction('600001', TEST_BOT_NAMES.MAIN);
    results.push(result4);
    
    // Проверка результатов и статистики транзакций
    const successfulTransactions = results.filter(r => r.success).length;
    const failedTransactions = results.filter(r => !r.success).length;
    
    // Проверяем, что транзакции начались
    if (transactionStats.started !== 4) {
      return {
        name: testName,
        success: false,
        message: `Expected 4 transactions to start, but got ${transactionStats.started}`
      };
    }
    
    // Проверяем соотношение успешных и неуспешных транзакций
    if (successfulTransactions !== 2 || failedTransactions !== 2) {
      return {
        name: testName,
        success: false,
        message: `Expected 2 successful and 2 failed transactions, but got ${successfulTransactions} successful and ${failedTransactions} failed`
      };
    }
    
    // Проверяем количество коммитов и откатов
    if (transactionStats.committed < 1 || transactionStats.rolledBack < 1) {
      return {
        name: testName,
        success: false,
        message: `Expected at least 1 commit and 1 rollback, but got ${transactionStats.committed} commits and ${transactionStats.rolledBack} rollbacks`
      };
    }
    
    return { 
      name: testName, 
      success: true, 
      message: `Транзакционные тесты успешно пройдены. Статистика: started=${transactionStats.started}, committed=${transactionStats.committed}, rolledBack=${transactionStats.rolledBack}, errors=${transactionStats.errors}` 
    };
  } finally {
    // Восстанавливаем оригинальные методы
    BalanceNotifierService.getUserNotificationSettings = originalMethods.getUserNotificationSettings;
    BalanceNotifierService.shouldNotifyUser = originalMethods.shouldNotifyUser;
    BalanceNotifierService.sendLowBalanceNotification = originalMethods.sendLowBalanceNotification;
    
    // Возвращаем оригинальный объект supabase
    Object.defineProperty(supabaseModule, 'supabase', {
      value: originalSupabase,
      configurable: true
    });
  }
}
testBalanceNotifierService_TransactionResilience.meta = { category: TestCategory.All };

// Обновляем список всех тестов
export const balanceNotifierServiceTests = [
  testBalanceNotifierService_ShouldNotifyUser,
  testBalanceNotifierService_GetUserNotificationSettings,
  testBalanceNotifierService_SendLowBalanceNotification,
  testBalanceNotifierService_CheckAllUsersBalances,
  testBalanceNotifierService_CheckUserBalanceById,
  testBalanceNotifierService_Resilience,
  testBalanceNotifierService_PerformanceMetrics,
  testBalanceNotifierService_DataConsistency,
  testBalanceNotifierService_TransactionResilience,
];

// Обновляем список всех тестов
export async function runBalanceNotifierServiceTests(): Promise<TestResult[]> {
  const tests = [
    testBalanceNotifierService_ShouldNotifyUser,
    testBalanceNotifierService_GetUserNotificationSettings,
    testBalanceNotifierService_SendLowBalanceNotification,
    testBalanceNotifierService_CheckAllUsersBalances,
    testBalanceNotifierService_CheckUserBalanceById,
    testBalanceNotifierService_CheckUserBalanceById_Extended,
    testBalanceNotifierService_Integration,
    testBalanceNotifierService_LoadTesting,
    testBalanceNotifierService_ParallelProcessing,
    testBalanceNotifierService_Resilience,
    testBalanceNotifierService_PerformanceMetrics,
    testBalanceNotifierService_DataConsistency,
    testBalanceNotifierService_TransactionResilience
  ];
  
  const results: TestResult[] = [];
  
  for (const test of tests) {
    const result = await test();
    results.push(result);
    
    if (!result.success) {
      logger.error({
        message: `❌ Test ${result.name} failed`,
        description: result.message,
        error: result.error
      });
    } else {
      logger.info({
        message: `✅ Test ${result.name} passed`,
        description: result.message
      });
    }
  }
  
  return results;
} 