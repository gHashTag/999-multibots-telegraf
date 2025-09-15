/**
 * @fileoverview Test data factory for generation limit tests
 * @description Provides mock data generators and test utilities
 */

import { MyContext } from '@/interfaces'
import { SubscriptionType } from '@/interfaces/subscription.interface'
import { UserDetailsResult } from '@/core/supabase/getUserDetailsSubscription'

export interface TestUser {
  telegram_id: string
  username?: string
  first_name?: string
  last_name?: string
  is_admin: boolean
  subscription_type?: SubscriptionType
  subscription_active: boolean
  generation_count: number
  balance: number
}

export interface TestScenario {
  name: string
  users: TestUser[]
  expected_outcomes: Record<string, boolean>
  description: string
}

/**
 * Creates mock context for testing
 */
export const createMockContext = (
  telegram_id: string = '12345',
  overrides: Partial<MyContext> = {}
): Partial<MyContext> => ({
  from: {
    id: parseInt(telegram_id),
    first_name: 'Test',
    last_name: 'User',
    username: 'testuser',
    is_bot: false,
    language_code: 'ru'
  },
  chat: {
    id: parseInt(telegram_id),
    type: 'private'
  } as any,
  session: {
    mode: '',
    user_language: 'ru',
    ...overrides.session
  },
  reply: jest.fn(),
  replyWithPhoto: jest.fn(),
  editMessageText: jest.fn(),
  editMessageReplyMarkup: jest.fn(),
  answerCbQuery: jest.fn(),
  scene: {
    enter: jest.fn(),
    leave: jest.fn(),
    reenter: jest.fn()
  } as any,
  telegram: {
    sendPhoto: jest.fn(),
    sendMessage: jest.fn(),
    editMessageText: jest.fn()
  } as any,
  ...overrides
})

/**
 * Test user factory
 */
export class TestUserFactory {
  static createAdmin(telegram_id: string = '12345'): TestUser {
    return {
      telegram_id,
      username: `admin_${telegram_id}`,
      first_name: 'Admin',
      last_name: 'User',
      is_admin: true,
      subscription_active: false, // Admins don't need subscriptions
      generation_count: 0, // Admins have unlimited generations
      balance: 10000
    }
  }

  static createNeurotesterUser(telegram_id: string = '99999'): TestUser {
    return {
      telegram_id,
      username: `neurotester_${telegram_id}`,
      first_name: 'Neurotester',
      last_name: 'User',
      is_admin: false,
      subscription_type: SubscriptionType.NEUROTESTER,
      subscription_active: true,
      generation_count: 0, // NEUROTESTER has unlimited generations
      balance: 5000
    }
  }

  static createRegularUser(
    telegram_id: string = '77777',
    generation_count: number = 0
  ): TestUser {
    return {
      telegram_id,
      username: `user_${telegram_id}`,
      first_name: 'Regular',
      last_name: 'User',
      is_admin: false,
      subscription_active: false,
      generation_count,
      balance: 1000
    }
  }

  static createExpiredSubscriptionUser(
    telegram_id: string = '66666',
    subscription_type: SubscriptionType = SubscriptionType.NEUROVIDEO
  ): TestUser {
    return {
      telegram_id,
      username: `expired_${telegram_id}`,
      first_name: 'Expired',
      last_name: 'User',
      is_admin: false,
      subscription_type,
      subscription_active: false, // Subscription expired
      generation_count: 5, // Had some generations while subscribed
      balance: 2000
    }
  }

  static createLowBalanceUser(telegram_id: string = '55555'): TestUser {
    return {
      telegram_id,
      username: `lowbalance_${telegram_id}`,
      first_name: 'Low',
      last_name: 'Balance',
      is_admin: false,
      subscription_active: false,
      generation_count: 2, // Used 2 out of 3 free generations
      balance: 50 // Low balance
    }
  }
}

/**
 * UserDetailsResult factory
 */
export class UserDetailsFactory {
  static create(
    user: TestUser,
    overrides: Partial<UserDetailsResult> = {}
  ): UserDetailsResult {
    const subscriptionStartDate = user.subscription_active && user.subscription_type
      ? new Date().toISOString()
      : null

    return {
      id: parseInt(user.telegram_id),
      created_at: new Date().toISOString(),
      stars: user.balance,
      subscriptionType: user.subscription_type || null,
      isSubscriptionActive: user.subscription_active,
      isExist: true,
      subscriptionStartDate,
      ...overrides
    }
  }

  static createExpired(user: TestUser): UserDetailsResult {
    const thirtyOneDaysAgo = new Date()
    thirtyOneDaysAgo.setDate(thirtyOneDaysAgo.getDate() - 31)

    return this.create(user, {
      subscriptionType: null,
      isSubscriptionActive: false,
      subscriptionStartDate: null
    })
  }

  static createNewUser(telegram_id: string): UserDetailsResult {
    return {
      id: parseInt(telegram_id),
      created_at: new Date().toISOString(),
      stars: 0,
      subscriptionType: null,
      isSubscriptionActive: false,
      isExist: false, // New user doesn't exist yet
      subscriptionStartDate: null
    }
  }
}

/**
 * Test scenario factory
 */
export class TestScenarioFactory {
  static createBasicLimitScenarios(): TestScenario[] {
    return [
      {
        name: 'Admin Unlimited Access',
        users: [
          TestUserFactory.createAdmin('12345')
        ],
        expected_outcomes: {
          '12345': true // Can always generate
        },
        description: 'Admin users should have unlimited generation access'
      },
      {
        name: 'NEUROTESTER Unlimited Access',
        users: [
          TestUserFactory.createNeurotesterUser('99999')
        ],
        expected_outcomes: {
          '99999': true // Can always generate
        },
        description: 'NEUROTESTER subscribers should have unlimited generation access'
      },
      {
        name: 'Regular User 3-Generation Limit',
        users: [
          TestUserFactory.createRegularUser('77777', 0), // 0 generations
          TestUserFactory.createRegularUser('77778', 1), // 1 generation
          TestUserFactory.createRegularUser('77779', 2), // 2 generations
          TestUserFactory.createRegularUser('77780', 3)  // 3 generations (limit reached)
        ],
        expected_outcomes: {
          '77777': true,  // Can generate (0/3)
          '77778': true,  // Can generate (1/3)
          '77779': true,  // Can generate (2/3)
          '77780': false  // Cannot generate (3/3 - limit reached)
        },
        description: 'Regular users should be limited to 3 generations total'
      },
      {
        name: 'Expired Subscription Fallback',
        users: [
          TestUserFactory.createExpiredSubscriptionUser('66666', SubscriptionType.NEUROVIDEO)
        ],
        expected_outcomes: {
          '66666': false // Should fallback to regular user limits
        },
        description: 'Users with expired subscriptions should fallback to regular user limits'
      }
    ]
  }

  static createEdgeCaseScenarios(): TestScenario[] {
    return [
      {
        name: 'Boundary Conditions',
        users: [
          { ...TestUserFactory.createRegularUser('11111', 3), generation_count: 3 }, // Exactly at limit
          { ...TestUserFactory.createRegularUser('11112', 4), generation_count: 4 }  // Over limit
        ],
        expected_outcomes: {
          '11111': false, // At limit - cannot generate
          '11112': false  // Over limit - cannot generate
        },
        description: 'Test boundary conditions around the 3-generation limit'
      },
      {
        name: 'New User First Generation',
        users: [
          TestUserFactory.createRegularUser('00001', 0)
        ],
        expected_outcomes: {
          '00001': true // New user should be able to generate
        },
        description: 'New users should be able to make their first generation'
      },
      {
        name: 'Multiple Subscription Types',
        users: [
          TestUserFactory.createNeurotesterUser('88881'), // NEUROTESTER (highest priority)
          { ...TestUserFactory.createRegularUser('88882'), subscription_type: SubscriptionType.NEUROVIDEO, subscription_active: true },
          { ...TestUserFactory.createRegularUser('88883'), subscription_type: SubscriptionType.NEUROPHOTO, subscription_active: true }
        ],
        expected_outcomes: {
          '88881': true, // NEUROTESTER unlimited
          '88882': true, // NEUROVIDEO unlimited while active
          '88883': true  // NEUROPHOTO unlimited while active
        },
        description: 'Different subscription types should all provide unlimited access'
      }
    ]
  }

  static createConcurrencyScenarios(): TestScenario[] {
    return [
      {
        name: 'Concurrent Generation Attempts',
        users: [
          TestUserFactory.createRegularUser('55555', 2) // 2 generations used, 1 remaining
        ],
        expected_outcomes: {
          '55555': true // Should handle concurrent requests properly
        },
        description: 'System should handle concurrent generation attempts without race conditions'
      },
      {
        name: 'High Load Scenario',
        users: Array.from({ length: 50 }, (_, i) => TestUserFactory.createRegularUser(`${10000 + i}`, 1)),
        expected_outcomes: Object.fromEntries(
          Array.from({ length: 50 }, (_, i) => [`${10000 + i}`, true])
        ),
        description: 'System should handle high concurrent load'
      }
    ]
  }

  static createErrorScenarios(): TestScenario[] {
    return [
      {
        name: 'Database Connection Failures',
        users: [
          TestUserFactory.createRegularUser('44444', 1)
        ],
        expected_outcomes: {
          '44444': true // Should default to allowing usage on error
        },
        description: 'System should handle database connection failures gracefully'
      },
      {
        name: 'Invalid User Data',
        users: [
          {
            telegram_id: '',
            username: '',
            is_admin: false,
            subscription_active: false,
            generation_count: -1, // Invalid negative count
            balance: -100 // Invalid negative balance
          }
        ],
        expected_outcomes: {
          '': false // Invalid user should be handled
        },
        description: 'System should handle invalid user data gracefully'
      }
    ]
  }

  static getAllScenarios(): TestScenario[] {
    return [
      ...this.createBasicLimitScenarios(),
      ...this.createEdgeCaseScenarios(),
      ...this.createConcurrencyScenarios(),
      ...this.createErrorScenarios()
    ]
  }
}

/**
 * Mock response factory
 */
export class MockResponseFactory {
  static createSupabaseUserResponse(user: TestUser) {
    return {
      data: {
        id: parseInt(user.telegram_id),
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        avatar_transform_used: user.generation_count >= 3, // Used if 3+ generations
        subscription: user.subscription_type,
        created_at: new Date().toISOString()
      },
      error: null
    }
  }

  static createSupabasePaymentResponse(user: TestUser) {
    if (!user.subscription_type || !user.subscription_active) {
      return {
        data: null,
        error: { code: 'PGRST116', message: 'Row not found' }
      }
    }

    return {
      data: {
        subscription_type: user.subscription_type,
        payment_date: new Date().toISOString(),
        status: 'COMPLETED'
      },
      error: null
    }
  }

  static createUserNotFoundError() {
    return {
      data: null,
      error: { code: 'PGRST116', message: 'Row not found' }
    }
  }

  static createDatabaseError() {
    return {
      data: null,
      error: { message: 'Database connection failed' }
    }
  }
}

/**
 * Assertion helpers
 */
export class AssertionHelpers {
  static assertGenerationAllowed(result: any, scenario: string) {
    expect(result.canUse, `Expected generation to be allowed in scenario: ${scenario}`).toBe(true)
  }

  static assertGenerationDenied(result: any, scenario: string) {
    expect(result.canUse, `Expected generation to be denied in scenario: ${scenario}`).toBe(false)
  }

  static assertAdminAccess(result: any) {
    expect(result.isAdmin, 'Expected admin access').toBe(true)
    expect(result.canUse, 'Expected admin to always have access').toBe(true)
  }

  static assertRegularUserLimits(result: any, generation_count: number) {
    expect(result.isAdmin, 'Expected non-admin user').toBe(false)

    if (generation_count >= 3) {
      expect(result.canUse, `Expected user with ${generation_count} generations to be denied`).toBe(false)
      expect(result.hasUsedBefore, 'Expected user to be marked as having used before').toBe(true)
    } else {
      expect(result.canUse, `Expected user with ${generation_count} generations to be allowed`).toBe(true)
    }
  }

  static assertSubscriptionAccess(userDetails: UserDetailsResult) {
    if (userDetails.isSubscriptionActive && userDetails.subscriptionType) {
      expect(['NEUROTESTER', 'NEUROVIDEO', 'NEUROPHOTO']).toContain(userDetails.subscriptionType)
    }
  }
}

/**
 * Performance testing utilities
 */
export class PerformanceTestUtils {
  static async measureExecutionTime<T>(fn: () => Promise<T>): Promise<{ result: T; duration: number }> {
    const start = performance.now()
    const result = await fn()
    const end = performance.now()
    return { result, duration: end - start }
  }

  static async runConcurrentTests<T>(
    fn: () => Promise<T>,
    concurrency: number = 10
  ): Promise<{ results: T[]; totalDuration: number; averageDuration: number }> {
    const start = performance.now()
    const promises = Array(concurrency).fill(null).map(() => fn())
    const results = await Promise.all(promises)
    const end = performance.now()

    const totalDuration = end - start
    const averageDuration = totalDuration / concurrency

    return { results, totalDuration, averageDuration }
  }

  static createLoadTest(
    userCount: number,
    generationsPerUser: number = 1
  ): { users: TestUser[]; expectedRequests: number } {
    const users = Array.from({ length: userCount }, (_, i) =>
      TestUserFactory.createRegularUser(`load_test_${i}`, Math.floor(Math.random() * 3))
    )

    return {
      users,
      expectedRequests: userCount * generationsPerUser
    }
  }
}