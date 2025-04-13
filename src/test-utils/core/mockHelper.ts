import { MyContext } from '@/interfaces';

// Constants for testing
export const TEST_USER_ID = 123456789;
export const TEST_USERNAME = 'test_user';
export const TEST_FIRST_NAME = 'Test';
export const TEST_BALANCE = 100;

/**
 * User interface - simplified for testing
 */
export interface User {
  id: string;
  username: string;
  telegram_id: string;
  balance: number;
  is_admin: boolean;
  created_at: string;
}

/**
 * UserSubscription interface - simplified for testing
 */
export interface UserSubscription {
  id: string;
  user_id: string;
  subscription_id: string;
  plan_id: string;
  tariff_id: string;
  discord_id: string;
  starts_at: string;
  expires_at: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Create a proper mock of User with all required fields
 */
export function createMockUser(overrides: Partial<User> = {}): User {
  return {
    id: TEST_USER_ID.toString(),
    username: TEST_USERNAME,
    telegram_id: TEST_USER_ID.toString(),
    balance: TEST_BALANCE,
    is_admin: false,
    created_at: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create a proper mock of UserSubscription with all required fields
 */
export function createMockSubscription(overrides: Partial<UserSubscription> = {}): UserSubscription {
  return {
    id: '12345',
    user_id: TEST_USER_ID.toString(),
    subscription_id: 'sub_123',
    plan_id: 'plan_123',
    tariff_id: 'tariff_123',
    discord_id: 'discord_123',
    starts_at: new Date(Date.now() - 86400000).toISOString(), // Yesterday
    expires_at: new Date(Date.now() + 86400000).toISOString(), // Tomorrow
    is_active: true,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

/**
 * Create properly typed mock context with better TypeScript compatibility
 */
export function createTypedContext(overrides: Partial<Record<string, any>> = {}): MyContext {
  const ctx: any = {
    from: { 
      id: TEST_USER_ID, 
      is_bot: false, 
      first_name: TEST_FIRST_NAME,
      username: TEST_USERNAME,
      language_code: 'en' 
    },
    scene: {
      enter: jest.fn().mockResolvedValue(undefined),
      leave: jest.fn().mockResolvedValue(undefined)
    },
    session: {
      balance: TEST_BALANCE,
      isAdmin: false,
      language: 'en',
      username: TEST_USERNAME,
      user: {
        id: TEST_USER_ID
      }
    },
    reply: jest.fn().mockResolvedValue(undefined),
    replyWithPhoto: jest.fn().mockResolvedValue(undefined),
    replyWithHTML: jest.fn().mockResolvedValue(undefined),
    replyWithMarkdown: jest.fn().mockResolvedValue(undefined),
    telegram: {
      getFile: jest.fn().mockResolvedValue({ file_path: 'test/path.jpg' })
    },
    wizard: {
      cursor: 0,
      next: jest.fn().mockReturnValue(1),
      selectStep: jest.fn().mockReturnValue(0),
      step: 0
    }
  };
  
  // Apply overrides
  return {
    ...ctx,
    ...overrides,
    session: {
      ...ctx.session,
      ...(overrides.session || {})
    }
  } as MyContext;
}

/**
 * Helper for working with mock functions
 */
export function createMockFunction<T extends (...args: any[]) => any>(): jest.MockedFunction<T> {
  return jest.fn() as unknown as jest.MockedFunction<T>;
}

/**
 * Create a mock scene handler that returns success
 */
export function createMockSceneHandler() {
  return jest.fn().mockResolvedValue(true);
}

/**
 * Create an event output response that satisfies the SendEventOutput type
 */
export function createMockEventOutput(data: any = {}) {
  return {
    success: true,
    data,
    meta: {
      timestamp: Date.now()
    }
  };
}

/**
 * Type assertion helper for scene steps
 * Example: await runSceneStep(scene.steps[0], ctx);
 */
export async function runSceneStep(step: any, ctx: any) {
  return await step(ctx);
}

/**
 * Create a mock wizard scene that can be used in tests
 */
export function createMockWizardScene(steps: any[] = []) {
  return {
    id: 'test-scene',
    steps: steps.length ? steps : [jest.fn().mockResolvedValue(true)]
  };
} 