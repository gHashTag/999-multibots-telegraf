import { MyContext } from '@/interfaces'
import {
  createMockUser,
  createTypedContext,
  createMockFunction,
  runSceneStep,
  createMockSubscription,
} from '../../core/mockHelper'
import { TestResult } from '../../core/types'
import {
  assertReplyContains,
  assertReplyMarkupContains,
  assertScene,
} from '../../core/assertions'
import { create as mockFunction } from '../../core/mock'
import { logger } from '@/utils/logger'
import { TestCategory } from '../../core/categories'
import { getUserBalance, getUserByTelegramId } from '@/core/supabase'
import { getUserSub } from '@/libs/database'
import {
  mockInngestSend,
  verifyInngestEvent,
  expect as testExpect,
  runTest,
} from '../../core/testHelpers'

// Mock functions
const mockedGetUserBalance = createMockFunction<typeof getUserBalance>()
const mockedGetUserByTelegramId =
  createMockFunction<typeof getUserByTelegramId>()
const mockedGetUserSub = createMockFunction<typeof getUserSub>()
const mockedIsAdmin = createMockFunction<(userId: string) => Promise<boolean>>()
const mockedHandleMenu = createMockFunction<() => Promise<void>>()

// Constants for testing
const TEST_USER_ID = 123456789
const TEST_USERNAME = 'test_user'
const TEST_FIRST_NAME = 'Test'
const TEST_BALANCE = 100

/**
 * Setup test environment
 */
function setupTest() {
  // Mock getUserBalance
  mockedGetUserBalance.mockReturnValue(Promise.resolve(TEST_BALANCE))

  // Mock getUserByTelegramId - using createMockUser for proper typing
  mockedGetUserByTelegramId.mockReturnValue(
    Promise.resolve(
      createMockUser({
        id: TEST_USER_ID.toString(),
        username: TEST_USERNAME,
        telegram_id: TEST_USER_ID.toString(),
        balance: TEST_BALANCE,
      })
    )
  )

  // Mock getUserSub
  mockedGetUserSub.mockReturnValue(Promise.resolve(null))

  // Mock isAdmin
  mockedIsAdmin.mockReturnValue(Promise.resolve(false))

  // Mock handleMenu - return void not boolean
  mockedHandleMenu.mockReturnValue(Promise.resolve())

  // Reset mocks between tests
  mockedGetUserBalance.mockClear()
  mockedGetUserByTelegramId.mockClear()
  mockedGetUserSub.mockClear()
  mockedIsAdmin.mockClear()
  mockedHandleMenu.mockClear()
}

/**
 * Test entering the startScene with /start command
 */
export async function testStartScene_EnterWithStartCommand(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Create properly typed mock context
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_FIRST_NAME,
          language_code: 'en',
          username: TEST_USERNAME,
        },
        session: {
          username: TEST_USERNAME,
        },
        message: { text: '/start', message_id: 1 },
      })

      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene')
      // Use the first step of the scene directly with proper typing
      await runSceneStep(startScene.steps[0], ctx)

      // Check that the welcome message was sent
      assertReplyContains(ctx, 'Welcome')

      // Check that the main menu was displayed
      assertReplyMarkupContains(ctx, 'Main Menu')

      return {
        message: 'Successfully entered startScene with /start command',
      }
    },
    {
      name: 'startScene: Enter With /start Command',
      category: TestCategory.All,
    }
  )
}

/**
 * Test entering the startScene with new user
 */
export async function testStartScene_NewUser(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Mock getUserByTelegramId to return null (new user)
      mockedGetUserByTelegramId.mockReturnValue(Promise.resolve(null))

      // Create properly typed mock context
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_FIRST_NAME,
          language_code: 'en',
          username: TEST_USERNAME,
        },
        session: {
          username: TEST_USERNAME,
        },
        message: { text: '/start', message_id: 1 },
      })

      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene')
      await runSceneStep(startScene.steps[0], ctx)

      // Check that the new user welcome message was sent
      assertReplyContains(ctx, 'new user')

      // Check that the scene was redirected to createUserScene
      if (!ctx.scene || !ctx.scene.enter) {
        throw new Error('Scene enter method should be defined')
      }
      testExpect(ctx.scene.enter).toHaveBeenCalled()

      return {
        message: 'Successfully handled new user in startScene',
      }
    },
    {
      name: 'startScene: New User',
      category: TestCategory.All,
    }
  )
}

/**
 * Test handling admin user
 */
export async function testStartScene_AdminUser(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Mock isAdmin to return true
      mockedIsAdmin.mockReturnValue(Promise.resolve(true))

      // Create properly typed mock context
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_FIRST_NAME,
          language_code: 'en',
          username: TEST_USERNAME,
        },
        session: {
          username: TEST_USERNAME,
        },
        message: { text: '/start', message_id: 1 },
      })

      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene')
      await runSceneStep(startScene.steps[0], ctx)

      // Check that admin menu options were displayed
      assertReplyMarkupContains(ctx, 'Admin')

      return {
        message: 'Successfully displayed admin options in startScene',
      }
    },
    {
      name: 'startScene: Admin User',
      category: TestCategory.All,
    }
  )
}

/**
 * Test handling user with subscription
 */
export async function testStartScene_UserWithSubscription(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Mock getUserSub to return an active subscription using the helper
      // Make sure to specify all required fields for the UserSubscription type
      const mockSubscription = createMockSubscription({
        user_id: TEST_USER_ID.toString(),
        subscription_id: 'sub_123',
        is_active: true,
      })

      // Using mockReturnValue with the properly typed subscription
      // Using type assertion to bypass the interface mismatch
      mockedGetUserSub.mockReturnValue(Promise.resolve(mockSubscription as any))

      // Create properly typed mock context
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_FIRST_NAME,
          language_code: 'en',
          username: TEST_USERNAME,
        },
        session: {
          username: TEST_USERNAME,
        },
        message: { text: '/start', message_id: 1 },
      })

      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene')
      await runSceneStep(startScene.steps[0], ctx)

      // Check that subscription info was displayed
      assertReplyContains(ctx, 'subscription')

      return {
        message: 'Successfully displayed subscription info in startScene',
      }
    },
    {
      name: 'startScene: User With Subscription',
      category: TestCategory.All,
    }
  )
}

/**
 * Test handling user with referral parameter
 */
export async function testStartScene_WithReferralParameter(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Create properly typed mock context with referral parameter
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_FIRST_NAME,
          language_code: 'en',
          username: TEST_USERNAME,
        },
        session: {
          username: TEST_USERNAME,
        },
        message: { text: '/start ref123456', message_id: 1 },
      })

      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene')
      await runSceneStep(startScene.steps[0], ctx)

      // Check that referral was processed
      assertReplyContains(ctx, 'referral')

      // Check that the scene was redirected to createUserScene
      if (!ctx.scene || !ctx.scene.enter) {
        throw new Error('Scene enter method should be defined')
      }
      testExpect(ctx.scene.enter).toHaveBeenCalled()

      return {
        message: 'Successfully processed referral parameter in startScene',
      }
    },
    {
      name: 'startScene: With Referral Parameter',
      category: TestCategory.All,
    }
  )
}

/**
 * Test handling language selection
 */
export async function testStartScene_LanguageSelection(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Create properly typed mock context with Russian language
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_FIRST_NAME,
          language_code: 'ru',
          username: TEST_USERNAME,
        },
        session: {
          username: TEST_USERNAME,
        },
        message: { text: '/start', message_id: 1 },
      })

      // Run the start scene handler with proper type handling
      const { startScene } = await import('@/scenes/startScene')
      await runSceneStep(startScene.steps[0], ctx)

      // Check that Russian language welcome message was sent
      assertReplyContains(ctx, 'Добро пожаловать')

      return {
        message: 'Successfully displayed proper language in startScene',
      }
    },
    {
      name: 'startScene: Language Selection',
      category: TestCategory.All,
    }
  )
}

/**
 * Test navigation to balance scene
 */
export async function testStartScene_NavigateToBalance(): Promise<TestResult> {
  return runTest(
    async () => {
      setupTest()

      // Create properly typed mock context with balance command
      const ctx = createTypedContext({
        from: {
          id: TEST_USER_ID,
          is_bot: false,
          first_name: TEST_FIRST_NAME,
          language_code: 'en',
          username: TEST_USERNAME,
        },
        session: {
          username: TEST_USERNAME,
        },
        message: { text: 'Balance', message_id: 1 },
      })

      // Run the start scene handler with proper type handling - use second step for menu commands
      const { startScene } = await import('@/scenes/startScene')
      await runSceneStep(startScene.steps[1], ctx)

      // Check that handleMenu was called
      testExpect(mockedHandleMenu).toHaveBeenCalled()

      // Check that the scene was redirected to balanceScene
      if (!ctx.scene || !ctx.scene.enter) {
        throw new Error('Scene enter method should be defined')
      }
      testExpect(ctx.scene.enter).toHaveBeenCalled()

      return {
        message: 'Successfully navigated to balance scene',
      }
    },
    {
      name: 'startScene: Navigate To Balance',
      category: TestCategory.All,
    }
  )
}

/**
 * Run all startScene tests
 */
export async function runStartSceneTests(): Promise<TestResult[]> {
  const results: TestResult[] = []

  try {
    // Run each test and collect results
    results.push(await testStartScene_EnterWithStartCommand())
    results.push(await testStartScene_NewUser())
    results.push(await testStartScene_AdminUser())
    results.push(await testStartScene_UserWithSubscription())
    results.push(await testStartScene_WithReferralParameter())
    results.push(await testStartScene_LanguageSelection())
    results.push(await testStartScene_NavigateToBalance())
  } catch (error) {
    logger.error('Error running startScene tests:', error)
    results.push({
      name: 'startScene tests',
      category: TestCategory.All,
      success: false,
      message: String(error),
    })
  }

  return results
}

export default runStartSceneTests
