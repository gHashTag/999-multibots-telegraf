import { updateUserSubscription } from '@/core/supabase/updateUserSubscription';
import { supabase as supabaseClient } from '@/core/supabase';
import { logger as loggerInstance } from '@/utils/logger';
import mockApi, { MockedFunction } from '@/test-utils/core/mock';
import assert from '@/test-utils/core/assert';
import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';

// --- Mocks ---

let mockSupabaseUpdate: MockedFunction<any>;
let mockSupabaseEq: MockedFunction<any>;
let mockSupabaseFrom: MockedFunction<any>;
let mockLoggerError: MockedFunction<any>;
let allMocks: Array<MockedFunction<any>> = [];

const setupMocks = () => {
  allMocks.forEach(m => m.mockReset());
  allMocks = [];

  // Mock Supabase
  mockSupabaseEq = mockApi.create();
  mockSupabaseUpdate = mockApi.create().mockReturnValue({ eq: mockSupabaseEq });
  mockSupabaseFrom = mockApi.create((tableName: string) => {
    if (tableName === 'users') {
      return { update: mockSupabaseUpdate };
    }
    return { update: mockApi.create() };
  });
  Object.defineProperty(supabaseClient, 'supabase', { value: { from: mockSupabaseFrom }, configurable: true });
  allMocks.push(mockSupabaseEq, mockSupabaseUpdate, mockSupabaseFrom);

  // Mock logger
  mockLoggerError = mockApi.create();
  const mockLoggerInfo = mockApi.create();
  const mockLoggerWarn = mockApi.create();
  const mockLoggerDebug = mockApi.create();
  allMocks.push(mockLoggerError, mockLoggerInfo, mockLoggerWarn, mockLoggerDebug);
  Object.defineProperty(loggerInstance, 'logger', {
    value: { error: mockLoggerError, info: mockLoggerInfo, warn: mockLoggerWarn, debug: mockLoggerDebug },
    configurable: true
  });
};

// --- Test Functions (Exported) ---

export async function testUpdateUserSubscription_Success(): Promise<TestResult> {
  const testName = 'updateUserSubscription: Success';
  setupMocks(); // Call setup
  try {
    const telegramId = '987654';
    const newSubscription = 'neurobase';
    mockSupabaseEq.mockResolvedValue({ error: null }); // Mock successful update

    await updateUserSubscription(telegramId, newSubscription);

    assert.isTrue(mockSupabaseFrom.mock.calls.length === 1, `${testName} - from called once`);
    assert.deepEqual(mockSupabaseFrom.mock.calls[0], ['users'], `${testName} - from args`);
    assert.isTrue(mockSupabaseUpdate.mock.calls.length === 1, `${testName} - update called once`);
    assert.deepEqual(mockSupabaseUpdate.mock.calls[0][0], { subscription: newSubscription }, `${testName} - update data`);
    assert.isTrue(mockSupabaseEq.mock.calls.length === 1, `${testName} - eq called once`);
    assert.deepEqual(mockSupabaseEq.mock.calls[0], ['telegram_id', telegramId], `${testName} - eq args`);
    assert.equal(mockLoggerError.mock.calls.length, 0, `${testName} - no error logged`);
    return { name: testName, success: true, message: 'Passed' };
  } catch (error: any) {
    return { name: testName, success: false, message: `Test failed: ${error.message}`, error };
  }
}
testUpdateUserSubscription_Success.meta = { category: TestCategory.Database }; // Add meta

export async function testUpdateUserSubscription_SupabaseError(): Promise<TestResult> {
  const testName = 'updateUserSubscription: Supabase Error';
  setupMocks(); // Call setup
  const dbError = new Error('Supabase DB Error');
  try {
    const telegramId = '112233';
    const newSubscription = 'neurophoto';
    mockSupabaseEq.mockResolvedValue({ error: dbError }); // Mock update error

    let thrownError: any;
    try {
      await updateUserSubscription(telegramId, newSubscription);
    } catch(err) {
      thrownError = err;
    }
    assert.ok(thrownError, `${testName} - should throw an error`);
    assert.ok(thrownError instanceof Error, `${testName} - thrown error should be an Error instance`);
    assert.equal(thrownError.message, 'Не удалось обновить подписку пользователя', `${testName} - error message mismatch`);

    assert.isTrue(mockLoggerError.mock.calls.length > 0, `${testName} - error logged`);
    assert.contains(mockLoggerError.mock.calls[0][0], 'Ошибка при обновлении подписки', `${testName} - log message`);
    return { name: testName, success: true, message: 'Passed (error caught)' };
  } catch (error: any) {
    return { name: testName, success: false, message: `Test failed unexpectedly: ${error.message}`, error };
  }
}
testUpdateUserSubscription_SupabaseError.meta = { category: TestCategory.Database }; // Add meta

// --- Test Runner Function ---

export async function runUpdateUserSubscriptionTests(options: { verbose?: boolean } = {}): Promise<TestResult[]> {
  const tests = [
    testUpdateUserSubscription_Success,
    testUpdateUserSubscription_SupabaseError,
  ];
  const results: TestResult[] = [];
  for (const test of tests) {
    results.push(await test());
  }
  return results;
} 