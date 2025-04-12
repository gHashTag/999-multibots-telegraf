import { createUser, CreateUserParams } from '@/core/supabase/createUser';
import { supabase as supabaseClient } from '@/core/supabase'; // Импортируем для мокирования
import { logger as loggerInstance } from '@/utils/logger'; // Импортируем для мокирования
import mockApi from '@/test-utils/core/mock';
import assert from '@/test-utils/core/assert';
import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';
import { MockedFunction } from '@/test-utils/core/mock';

// --- Моки и Хелперы --- 

// Переменные для моков
let mockSupabaseSelect: MockedFunction<any>;
let mockSupabaseEq: MockedFunction<any>;
let mockSupabaseSingle: MockedFunction<any>;
let mockSupabaseInsert: MockedFunction<any>;
let mockSupabaseFrom: MockedFunction<any>;
let mockLoggerError: MockedFunction<any>;
let mockLoggerInfo: MockedFunction<any>;
let allMocks: Array<MockedFunction<any>> = [];

const setupMocks = () => {
  allMocks.forEach(m => m.mockReset());
  allMocks = [];

  // Мокируем Supabase клиент chaining
  mockSupabaseSingle = mockApi.create();
  mockSupabaseEq = mockApi.create().mockReturnValue({ single: mockSupabaseSingle });
  mockSupabaseSelect = mockApi.create().mockReturnValue({ eq: mockSupabaseEq });
  // Мок для insert().select().single()
  const insertSelectSingleMock = mockApi.create(); 
  const insertSelectMock = mockApi.create().mockReturnValue({ single: insertSelectSingleMock });
  mockSupabaseInsert = mockApi.create().mockReturnValue({ select: insertSelectMock }); 
  
  mockSupabaseFrom = mockApi.create((tableName: string) => {
    if (tableName === 'users') {
      return {
        select: mockSupabaseSelect,
        insert: mockSupabaseInsert,
      };
    }
    return { select: mockApi.create(), insert: mockApi.create() };
  });
  // Мокируем сам клиент supabase
  Object.defineProperty(supabaseClient, 'supabase', { value: { from: mockSupabaseFrom }, configurable: true });
  allMocks.push(mockSupabaseSingle, mockSupabaseEq, mockSupabaseSelect, mockSupabaseInsert, mockSupabaseFrom, insertSelectMock, insertSelectSingleMock);

  // Мокируем логгер
  mockLoggerError = mockApi.create();
  mockLoggerInfo = mockApi.create();
  const mockLoggerWarn = mockApi.create();
  const mockLoggerDebug = mockApi.create();
  allMocks.push(mockLoggerError, mockLoggerInfo, mockLoggerWarn, mockLoggerDebug);
  Object.defineProperty(loggerInstance, 'logger', {
    value: { error: mockLoggerError, info: mockLoggerInfo, warn: mockLoggerWarn, debug: mockLoggerDebug },
    configurable: true
  });
};

// --- Тестовые данные --- 
const testUserData: CreateUserParams = {
    telegram_id: '123456789',
    username: 'testuser',
    first_name: 'Test',
    last_name: 'User',
    bot_name: 'test_bot',
};

const existingUserData = {
    ...testUserData,
    id: 1,
    created_at: new Date().toISOString(),
    level: 1,
    telegram_id: '123456789', // Убедимся, что ID совпадает
};

const newUserDataResponse = [{
    ...testUserData,
    id: 2,
    created_at: new Date().toISOString(),
    level: 1,
    telegram_id: '123456789',
    chat_id: '123456789', // Значения по умолчанию
    mode: 'clean',
    model: 'gpt-4-turbo',
    count: 0,
    aspect_ratio: '9:16',
    photo_url: '',
    is_bot: false,
    language_code: 'ru',
}];

// --- Тестовые функции --- 

export async function testCreateUser_SuccessNew(): Promise<TestResult> {
  const testName = 'createUser: Success New User';
  setupMocks();
  try {
    mockSupabaseSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } }); 
    // Настраиваем мок для insert().select().single() -> возвращает нового пользователя
    const insertSelectSingleMock = mockSupabaseInsert.mock.results[0]?.value?.select?.mock?.results[0]?.value?.single; 
    if (insertSelectSingleMock) {
        insertSelectSingleMock.mockResolvedValueOnce({ data: newUserDataResponse[0], error: null });
    } else {
        // Если цепочка моков не создалась как ожидалось, добавляем мок напрямую
         mockSupabaseInsert.mockReturnValueOnce({ select: mockApi.create().mockReturnValue({ single: mockApi.create().mockResolvedValueOnce({ data: newUserDataResponse[0], error: null}) }) });
    }
   
    const result = await createUser(testUserData);

    assert.deepEqual(result, newUserDataResponse, `${testName} - should return new user data array`);
    assert.isTrue(mockSupabaseFrom.mock.calls.length >= 2, `${testName} - supabase.from called check and insert`);
    assert.isTrue(mockSupabaseInsert.mock.calls.length === 1, `${testName} - insert called once`);
    // Проверяем, что insert был вызван с правильными данными (учитывая значения по умолчанию)
    assert.deepEqual(mockSupabaseInsert.mock.calls[0][0][0], { 
        ...testUserData, 
        chat_id: '123456789', 
        mode: 'clean', 
        model: 'gpt-4-turbo', 
        count: 0, 
        aspect_ratio: '9:16',
        photo_url: '',
        is_bot: false,
        language_code: 'ru',
        level: 1
     }, `${testName} - insert args check`);
    assert.isTrue(mockLoggerInfo.mock.calls.length > 0, `${testName} - logger.info called`);
    assert.contains(mockLoggerInfo.mock.calls[mockLoggerInfo.mock.calls.length - 1][0], 'Пользователь успешно создан', `${testName} - success log`);
    return { name: testName, success: true, message: 'Passed' };
  } catch (error: any) {
    return { name: testName, success: false, message: error.message, error };
  }
}
testCreateUser_SuccessNew.meta = { category: TestCategory.Database };

export async function testCreateUser_ExistingUser(): Promise<TestResult> {
  const testName = 'createUser: Existing User';
  setupMocks();
  try {
    mockSupabaseSingle.mockResolvedValueOnce({ data: existingUserData, error: null }); 
    const result = await createUser(testUserData);

    assert.deepEqual(result, existingUserData, `${testName} - should return existing user data`);
    assert.isTrue(mockSupabaseFrom.mock.calls.length === 1, `${testName} - supabase.from called once`);
    assert.deepEqual(mockSupabaseFrom.mock.calls[0], ['users'], `${testName} - from args check`);
    assert.equal(mockSupabaseInsert.mock.calls.length, 0, `${testName} - insert should not be called`);
    assert.isTrue(mockLoggerInfo.mock.calls.length > 0, `${testName} - logger.info called`);
    assert.contains(mockLoggerInfo.mock.calls[0][0], 'Пользователь уже существует', `${testName} - existing user log`);
    return { name: testName, success: true, message: 'Passed' };
  } catch (error: any) {
    return { name: testName, success: false, message: error.message, error };
  }
}
testCreateUser_ExistingUser.meta = { category: TestCategory.Database };

export async function testCreateUser_CheckError(): Promise<TestResult> {
  const testName = 'createUser: Check Error';
  setupMocks();
  const checkError = { message: 'DB check error', code: 'OTHER_ERROR' };
  try {
    mockSupabaseSingle.mockResolvedValueOnce({ data: null, error: checkError });

    let thrownError: any;
    try {
      await createUser(testUserData);
    } catch (err) {
      thrownError = err;
    }
    assert.ok(thrownError, `${testName} - should throw an error`);
    assert.ok(thrownError instanceof Error, `${testName} - thrown error should be an Error instance`);
    assert.equal(thrownError.message, checkError.message, `${testName} - error message should match`);

    assert.isTrue(mockLoggerError.mock.calls.length > 0, `${testName} - logger.error called`);
    assert.equal(mockLoggerError.mock.calls[0][0], '❌ Ошибка при проверке существующего пользователя:', `${testName} - error log message`);
    return { name: testName, success: true, message: 'Passed (error caught)' };
  } catch (error: any) {
    return { name: testName, success: false, message: `Test failed unexpectedly: ${error?.message}`, error };
  }
}
testCreateUser_CheckError.meta = { category: TestCategory.Database };

export async function testCreateUser_InsertError(): Promise<TestResult> {
  const testName = 'createUser: Insert Error';
  setupMocks();
  const insertError = new Error('DB insert error');
  try {
    mockSupabaseSingle.mockResolvedValueOnce({ data: null, error: { code: 'PGRST116' } });
    mockSupabaseInsert.mockRejectedValueOnce(insertError);

    let thrownError: any;
    try {
      await createUser(testUserData);
    } catch (err) {
      thrownError = err;
    }
    assert.ok(thrownError, `${testName} - should throw an error`);
    assert.ok(thrownError instanceof Error, `${testName} - thrown error should be an Error instance`);
    assert.strictEqual(thrownError, insertError, `${testName} - thrown error should be the exact error object`);

    assert.isTrue(mockLoggerError.mock.calls.length > 0, `${testName} - logger.error called`);
    assert.equal(mockLoggerError.mock.calls[0][0], '❌ Ошибка при создании пользователя:', `${testName} - error log message`);
    return { name: testName, success: true, message: 'Passed (error caught)' };
  } catch (error: any) {
    return { name: testName, success: false, message: `Test failed unexpectedly: ${error?.message}`, error };
  }
}
testCreateUser_InsertError.meta = { category: TestCategory.Database };

// Функция для запуска всех тестов этого модуля\nexport async function runCreateUserTests(options: { verbose?: boolean } = {}): Promise<TestResult[]> {\n  const tests = [\n    testCreateUser_SuccessNew,\n    testCreateUser_ExistingUser,\n    testCreateUser_CheckError,\n    testCreateUser_InsertError,\n  ];\n  const results: TestResult[] = [];\n  for (const test of tests) {\n    allMocks.forEach(m => m.mockReset()); // Сброс моков перед каждым тестом\n    results.push(await test());\n  }\n  return results;\n} 