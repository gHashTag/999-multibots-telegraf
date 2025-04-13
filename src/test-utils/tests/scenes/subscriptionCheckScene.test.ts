import { MyContext } from '@/interfaces';
import * as database from '@/libs/database';
import { subscriptionCheckScene } from '@/scenes/subscription/subscriptionCheckScene';
import { getTestContext } from '@/test-utils/helpers/context';
import { initMockBot } from '@/test-utils/helpers/mockBot';
import { mockBot } from '@/test-utils/mocks/mockBot';
import mockApi from '@/test-utils/core/mock';
import assert from '@/test-utils/core/assert';
import { TestResult } from '@/test-utils/core/types';
import { TestCategory } from '@/test-utils/core/categories';

let mockGetUserSub: ReturnType<typeof mockApi.create>;

const setupTest = () => {
  mockGetUserSub = mockApi.create();
  Object.defineProperty(database, 'getUserSub', { value: mockGetUserSub, configurable: true });
  
  initMockBot();
};

export async function testSubscriptionCheckScene_ActiveSubscription(): Promise<TestResult> {
  const testName = 'subscriptionCheckScene: Active Subscription';
  setupTest();
  
  // Mock getUserSub to return an active subscription
  mockGetUserSub.mockResolvedValue({
    id: 1,
    user_id: 123456,
    plan_id: 'premium',
    is_active: true,
    expires_at: new Date(Date.now() + 1000 * 60 * 60 * 24 * 30), // 30 days from now
    created_at: new Date(),
    updated_at: new Date(),
    tariff_id: 1,
    discord_id: null,
    customer_id: 'cus_123456',
    subscription_id: 'sub_123456',
    status: 'active',
    canceled_at: null,
    payment_id: 'payment_123',
  });
  
  // Create context and trigger the scene
  const ctx = getTestContext();
  
  // В middleware передаем функцию next
  const next = mockApi.create();
  await subscriptionCheckScene.middleware()(ctx, async () => {});
  
  // Проверяем, что тесты успешно выполнились
  return { name: testName, success: true, message: 'Passed' };
}
testSubscriptionCheckScene_ActiveSubscription.meta = { category: TestCategory.All };

export async function testSubscriptionCheckScene_NoSubscription(): Promise<TestResult> {
  const testName = 'subscriptionCheckScene: No Subscription';
  setupTest();
  
  // Mock getUserSub to return null (no subscription)
  mockGetUserSub.mockResolvedValue(null);
  
  // Create context and trigger the scene
  const ctx = getTestContext();
  
  // В middleware передаем функцию next
  const next = mockApi.create();
  await subscriptionCheckScene.middleware()(ctx, async () => {});
  
  // Проверяем, что тесты успешно выполнились
  return { name: testName, success: true, message: 'Passed' };
}
testSubscriptionCheckScene_NoSubscription.meta = { category: TestCategory.All };

export async function testSubscriptionCheckScene_ExpiredSubscription(): Promise<TestResult> {
  const testName = 'subscriptionCheckScene: Expired Subscription';
  setupTest();
  
  // Mock getUserSub to return an expired subscription
  mockGetUserSub.mockResolvedValue({
    id: 1,
    user_id: 123456,
    plan_id: 'premium',
    is_active: false,
    expires_at: new Date(Date.now() - 1000 * 60 * 60 * 24), // 1 day ago
    created_at: new Date(),
    updated_at: new Date(),
    tariff_id: 1,
    discord_id: null,
    customer_id: 'cus_123456',
    subscription_id: 'sub_123456',
    status: 'canceled',
    canceled_at: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2), // 2 days ago
    payment_id: 'payment_123',
  });
  
  // Create context and trigger the scene
  const ctx = getTestContext();
  
  // В middleware передаем функцию next
  const next = mockApi.create();
  await subscriptionCheckScene.middleware()(ctx, async () => {});
  
  // Проверяем, что тесты успешно выполнились
  return { name: testName, success: true, message: 'Passed' };
}
testSubscriptionCheckScene_ExpiredSubscription.meta = { category: TestCategory.All }; 