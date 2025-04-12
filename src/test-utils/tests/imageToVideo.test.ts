import { imageToVideoFunction, ImageToVideoResult, ImageToVideoEvent } from '@/inngest-functions/imageToVideo.inngest';
import { MyContext, Subscription } from '@/interfaces';
import { User } from '../mocks/types';
import { ModeEnum } from '@/interfaces/payments.interface';
// import { VIDEO_MODELS_CONFIG } from '@/menu/videoModelMenu'; // Пока не используем мок для этого
import { Telegraf } from 'telegraf';
import * as botCore from '@/core/bot';
import * as modelsCost from '@/price/helpers/modelsCost';
import * as finalPrice from '@/price/helpers/calculateFinalPrice';
import { supabase } from '@/core/supabase';
import mockApi from '@/test-utils/core/mock';
import assert from '@/test-utils/core/assert';
import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';
// Используем InngestTestEngine
import { InngestTestEngine } from '@/test-utils/inngest/inngest-test-engine'; 
import { MockedFunction } from '@/test-utils/core/mock';

// --- Моки и Хелперы --- 

const mockFetch = mockApi.create().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ output: ['https://example.com/video.mp4'] })
});
// @ts-ignore
global.fetch = mockFetch;

const mockGetModelPrice = mockApi.create().mockReturnValue(100);
Object.defineProperty(modelsCost, 'getModelPrice', { value: mockGetModelPrice, configurable: true });

const mockCalculateFinalPrice = mockApi.create().mockReturnValue(100);
Object.defineProperty(finalPrice, 'calculateFinalPrice', { value: mockCalculateFinalPrice, configurable: true });

const mockGetBotByName = mockApi.create().mockReturnValue({
    success: true,
    bot: { telegram: { sendMessage: mockApi.create() }} as unknown as Telegraf<MyContext>
});
Object.defineProperty(botCore, 'getBotByName', { value: mockGetBotByName, configurable: true });

// Мок для Supabase (упрощенный, т.к. основная проверка баланса)
let mockSupabaseUserDb: { [key: string]: User } = {};
const mockSupabaseSingle = mockApi.create();
const mockSupabaseEq = mockApi.create<() => { single: any }>().mockReturnValue({ single: mockSupabaseSingle });
const mockSupabaseSelect = mockApi.create<() => { eq: any }>().mockReturnValue({ eq: mockSupabaseEq });
const mockSupabaseInsert = mockApi.create().mockResolvedValue({ data: [{ id: 1 }], error: null }); // Мок для createPayment
const mockSupabaseFrom = mockApi.create((tableName: string) => {
    if (tableName === 'users') return { select: mockSupabaseSelect };
    if (tableName === 'payments_v2') return { insert: mockSupabaseInsert };
    return { select: mockApi.create(), insert: mockApi.create() };
});
Object.defineProperty(supabase, 'supabase', { value: { from: mockSupabaseFrom }, configurable: true });

// --- Тестовые данные --- 
const testUser: User = {
    id: '1',
    telegram_id: '12345',
    username: 'testuser',
    is_ru: false,
    bot_name: 'test_bot',
    balance: 1000,
    subscription_end_date: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
};

// Тип для события Inngest (взят из ImageToVideoEvent)
type TestEventData = ImageToVideoEvent['data'];

const defaultEventData: TestEventData = {
    imageUrl: 'https://example.com/image.jpg',
    model_id: 'minimax', 
    telegram_id: testUser.telegram_id,
    username: testUser.username,
    is_ru: testUser.is_ru, 
    bot_name: testUser.bot_name,
    // description: 'Test video generation' // Убран
};

const createEvent = (dataOverrides: Partial<TestEventData> = {}) => ({
    name: 'image-to-video/generate', // Правильное имя события
    data: { ...defaultEventData, ...dataOverrides },
});

// --- Тестовые функции --- 

// Переменная для хранения инстанса InngestTestEngine
let engine: InngestTestEngine;

// Функция настройки перед каждым тестом
const setupTest = () => {
    engine = new InngestTestEngine();
    engine.register('image-to-video/generate', imageToVideoFunction);
    // Сброс моков
    mockFetch.mockClear();
    mockGetModelPrice.mockClear();
    mockCalculateFinalPrice.mockClear();
    mockGetBotByName.mockClear();
    mockSupabaseSelect.mockClear();
    mockSupabaseInsert.mockClear();
    mockSupabaseEq.mockClear();
    mockSupabaseSingle.mockClear();
    mockSupabaseFrom.mockClear();
    mockSupabaseUserDb = {}; // Очищаем "базу" пользователей
};

export async function testImageToVideo_Success(): Promise<TestResult> {
    const testName = 'imageToVideo: Success';
    setupTest();
    mockSupabaseUserDb = { [testUser.telegram_id]: testUser };
    mockSupabaseSingle.mockResolvedValue({ data: testUser, error: null });

    const result = await engine.send(createEvent());
    const output = result && (result as any).result ? (result as any).result as ImageToVideoResult : null;

    assert.isTrue(result?.success, `${testName} - event success`);
    assert.ok(output, `${testName} - output exists`);
    assert.isTrue(output?.success, `${testName} - function success`);
    assert.isDefined(output?.videoUrl, `${testName} - videoUrl defined`);
    return { name: testName, success: result?.success && !!output?.success, message: output?.success ? 'Passed' : output?.error || 'Failed' };
}
testImageToVideo_Success.meta = { category: TestCategory.Inngest };

export async function testImageToVideo_InsufficientBalance(): Promise<TestResult> {
    const testName = 'imageToVideo: Insufficient Balance';
    setupTest();
    const userWithLowBalance = { ...testUser, balance: 10 };
    mockSupabaseUserDb = { [userWithLowBalance.telegram_id]: userWithLowBalance };
    mockSupabaseSingle.mockResolvedValue({ data: userWithLowBalance, error: null });

    const result = await engine.send(createEvent());
    const output = result && (result as any).result ? (result as any).result : null;

    assert.isTrue(result?.success, `${testName} - event success (should contain data)`);
    assert.ok(output, `${testName} - output exists`);
    assert.isTrue(output?.insufficient_balance, `${testName} - insufficient_balance flag`);
    assert.ok(output?.modePrice && output?.modePrice > 0, `${testName} - modePrice check`);
    assert.equal(output?.newBalance, 10, `${testName} - newBalance check`);
    
    return { name: testName, success: !!output?.insufficient_balance, message: output?.insufficient_balance ? 'Passed (insufficient balance detected)' : 'Failed' };
}
testImageToVideo_InsufficientBalance.meta = { category: TestCategory.Inngest };

// TODO: Адаптировать остальные тесты: invalid model, API errors, timeout, multiple outputs, missing fields.
// Для API errors/timeout/multiple_outputs нужно будет мокировать mockFetch соответственно.
// Для invalid model - проверить логику функции imageToVideoFunction.
// Для missing fields - передать неполные данные в createEvent.

// --- Функция запуска --- 

export async function runImageToVideoTests(options: { verbose?: boolean } = {}): Promise<TestResult[]> {
  const tests = [
    testImageToVideo_Success,
    testImageToVideo_InsufficientBalance,
    // TODO: Добавить сюда остальные тестовые функции
  ];
  const results: TestResult[] = [];
  for (const test of tests) {
    results.push(await test());
  }
  return results;
} 